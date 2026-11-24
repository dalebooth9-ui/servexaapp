import { applySheetNotes, fixLineBreaksInAnswers, realLineBreaks, hydrantLocationText, hydrantPoText } from "@/lib/paperSheetNotes";
import { usesPrintedSheetLayout } from "@/lib/printedSheetLayout";
// Build the "electronic" filled report PDF for an archived (digitised-only)
// document. Reuses the same generator as job-mode sheets so branding,
// watermark, accreditations and layout are identical — the only difference
// is that there is no `jobs` row, so we pass a synthetic non-UUID jobId to
// skip the signatures / assignments / customer-branding lookups inside the
// generator and instead hand-feed customer + site + brand colour from the
// archive metadata.
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { generateJobSheetPdf } from "@/components/JobSheetPdfExport";
import { cropSignatureFromScan } from "@/lib/archiveSignatureCrop";
import { unmappedNotesText, cleanUnmapped } from "@/lib/paperSheetItems";
import { generateBlankSheetPdfBlob } from "@/lib/generateBlankSheetPdf";
import type { FillImage, PaperFormFill } from "@/lib/paperFormFill";

export type ArchivePdfInput = {
  archivedId: string;
  template: {
    id: string;
    name: string;
    description?: string | null;
    fields: any[];
    footer_text?: string | null;
    branding?: any;
  };
  responses: Record<string, any>;
  /**
   * Header metadata extracted by the OCR pass (paperwork_owner_company,
   * riser_location, number_of_outlets, cabinet_keys, date, po_ref,
   * engineer, customer_signed_name, customer_sign_date, and the signature
   * bounding boxes). Seeded into responses so header fields render on the
   * electronic report.
   */
  header?: Record<string, any> | null;
  /**
   * Source scan page paths (submissions bucket) — used only for technician
   * fallback crops. Customer signatures must come from an explicit office crop.
   */
  sourcePaths?: string[] | null;
  customerId: string | null;
  siteId: string | null;
  /** Free-text site name/address used as a fallback when siteId is null. */
  siteName?: string | null;
  siteAddress?: string | null;
  documentDate: string | null; // yyyy-mm-dd
  /**
   * When set, forwarded as `submittedBy` so the shared job PDF generator
   * looks up this engineer's profile signature (`profiles.signature_data`)
   * and stamps it into the technician signature block. Used by the archive
   * flow to apply an engineer's stored signature on the basis that the
   * scanned original bears their handwritten signature.
   */
  technicianName?: string | null;
  /**
   * Storage paths in the `signatures` bucket for manually-cropped signatures
   * picked by the office via "Select from photo". Customer signatures are
   * never auto-derived from OCR boxes; no manual crop means no customer
   * signature block in the generated report.
   */
  manualCustomerSignaturePath?: string | null;
  manualEngineerSignaturePath?: string | null;
};

async function loadImageFromSignaturesBucket(
  path: string,
): Promise<HTMLImageElement | null> {
  const { data } = await supabase.storage
    .from("signatures")
    .createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = data.signedUrl;
  });
}

// Well-known header keys → label fragments used on printed sheets. When any
// template field's label matches a fragment, we seed the field with the
// header value so the electronic render fills that row.
const HEADER_FIELD_ALIASES: Array<{ headerKey: string; labelFragments: string[] }> = [
  { headerKey: "riser_location", labelFragments: ["riser location", "location of riser"] },
  { headerKey: "number_of_outlets", labelFragments: ["number of outlets", "no of outlets", "no. of outlets", "outlets"] },
  { headerKey: "valve_type", labelFragments: ["valve type", "type of valve", "landing valve type"] },
  { headerKey: "cabinet_keys", labelFragments: ["cabinet keys", "keys held", "key holder"] },
  { headerKey: "po_ref", labelFragments: ["po number", "p.o. number", "purchase order", "reference number", "ref no", "job ref"] },
  { headerKey: "date", labelFragments: ["date"] },
];

function labelMatches(label: string, fragments: string[]): boolean {
  const l = label.toLowerCase();
  return fragments.some((f) => l.includes(f));
}

function seedHeaderIntoResponses(
  responses: Record<string, any>,
  header: Record<string, any> | null | undefined,
  fields: any[],
): Record<string, any> {
  if (!header) return fixLineBreaksInAnswers(responses);
  const next = fixLineBreaksInAnswers({ ...responses });
  // Top-level aliases the PDF generator already reads directly. Do not seed
  // _customer_signed_name from OCR: customer signer names are only trusted when
  // paired with an explicit manual customer signature crop.
  if (header.customer_sign_date && !next._customer_sign_date) {
    next._customer_sign_date = header.customer_sign_date;
  }
  if (header.number_of_outlets != null && !next._number_of_outlets) {
    next._number_of_outlets = header.number_of_outlets;
  }
  // Freeform off-form notes (access codes, key fobs, block info) captured by
  // OCR from margins/whitespace. Rendered by the PDF as an "Additional notes"
  // block below Comments/Materials. Underscore-prefixed so it never collides
  // with a template field id (some templates already have `additional_notes`
  // as a native field).
  if (header.additional_notes && !next._additional_notes) {
    const raw = String(header.additional_notes).trim();
    if (raw) next._additional_notes = realLineBreaks(raw);
  }
  // Sheet questions the template has no row for are printed, never dropped.
  const unmapped = unmappedNotesText(Array.isArray(next._sheet_unmapped) ? next._sheet_unmapped : header.unmapped_items);
  if (unmapped && !String(next._additional_notes || "").includes("Also on the paper sheet:")) {
    next._additional_notes = next._additional_notes ? `${next._additional_notes}\n\n${unmapped}` : unmapped;
  }
  // Map header values onto template field ids by label match.
  for (const alias of HEADER_FIELD_ALIASES) {
    const val = header[alias.headerKey];
    if (val == null || val === "") continue;
    for (const f of fields) {
      if (!f?.label) continue;
      if (!labelMatches(String(f.label), alias.labelFragments)) continue;
      if (next[f.id] === undefined || next[f.id] === null || next[f.id] === "") {
        next[f.id] = val;
      }
    }
  }
  return next;
}

export async function generateAndUploadArchivePdf(
  input: ArchivePdfInput,
): Promise<{ path: string; pageCount: number }> {
  const {
    archivedId,
    template,
    responses,
    header,
    sourcePaths,
    customerId,
    siteId,
    siteName,
    siteAddress,
    documentDate,
    technicianName,
    manualCustomerSignaturePath,
    manualEngineerSignaturePath,
  } = input;

  // Hydrate the same shape a job PDF would receive. Customer is taken *only*
  // from the archived document's confirmed customer_id — never re-derived
  // from form text — so a re-convert can never regress the customer link.
  let customer: any = null;
  if (customerId) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, logo_url, brand_colour, org_id")
      .eq("id", customerId)
      .maybeSingle();
    customer = data;
    // Belt-and-braces guard: if the linked customer's *name* is domain-shaped
    // (a legacy bad row from before the matcher was guarded), drop it so we
    // don't render "vivafire.co.uk" as the customer.
    const { looksLikeDomainOrUrl } = await import("@/lib/customerNameGuard");
    if (customer && looksLikeDomainOrUrl(customer.name)) {
      console.warn("[archivePdfBuilder] linked customer name looks domain-shaped, dropping", customer.name);
      customer = null;
    }
  }
  // Load generating-org identifiers so the shared PDF fallback chain can
  // reject any form-text candidate that collapses to the org's own identity.
  let generatingOrg: any = null;
  if (customer?.org_id) {
    const { data } = await supabase
      .from("organisations")
      .select("name, intake_email, scan_intake_email")
      .eq("id", customer.org_id)
      .maybeSingle();
    generatingOrg = data;
  }
  let site: any = null;
  if (siteId) {
    const { data } = await (supabase as any)
      .from("sites")
      .select("id, name, address")
      .eq("id", siteId)
      .maybeSingle();
    site = data;
  }
  // Fallback to free-text site name/address when there is no matched site record.
  const effectiveSite = site
    ? { name: site.name, address: site.address }
    : (siteName || siteAddress)
      ? { name: siteName || siteAddress || null, address: siteAddress || siteName || null }
      : null;

  const jobInfo = {
    address: effectiveSite?.address || null,
    customer: customer?.name || null,
    customers: customer
      ? {
          name: customer.name,
          logo_url: customer.logo_url,
          brand_colour: customer.brand_colour,
        }
      : null,
    generating_org: generatingOrg,
    // Never substitute the internal archive id into the customer-facing
    // PO/Ref header. If the sheet had no PO and there's no job reference,
    // the header stays blank. The archive id may surface as a labelled
    // "Doc ref:" in the footer for traceability, never as the PO/Ref.
    reference_number: null,
    site: effectiveSite,
  } as any;

  // Seed header extractions into responses so riser location, outlet count,
  // cabinet keys, PO ref, date, etc. render on the electronic report.
  let responsesWithDate = seedHeaderIntoResponses(
    { ...responses },
    header,
    Array.isArray(template.fields) ? template.fields : [],
  );

  if (documentDate) {
    // format as dd/mm/yyyy for the header renderer's fallback picker
    const m = documentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    responsesWithDate.date = m ? `${m[3]}/${m[2]}/${m[1]}` : documentDate;
    responsesWithDate._paper_completion_at = `${documentDate.slice(0, 10)}T12:00:00Z`;
    for (const field of template.fields || []) {
      if (/^(date|inspection date|service date|visit date|test date|date of test|completion date|commissioning date)$/i.test(String(field.label || "").trim())) responsesWithDate[field.id] = responsesWithDate.date;
    }
    if (responsesWithDate._customer_sign_date) responsesWithDate._customer_sign_date = responsesWithDate.date;
  }
  // Seed the technician name into the response payload so the job PDF
  // generator's tech-name resolution picks it up even when the template
  // has no explicit "technician name" field.
  if (technicianName && !responsesWithDate.technician_name) {
    responsesWithDate.technician_name = technicianName;
  }

  // Crop signature regions from the source scan so the real customer /
  // engineer ink carries across to the electronic report. Policy: never
  // fabricate — only carry across when the OCR pass returned a bbox
  // pointing at an actual signature on the scan.
  const sigImages: Record<string, HTMLImageElement> = {};
  let customerSig: any = undefined;
  let engineerSigOverride: any = undefined;
  let customerSourceNote: string | null = null;
  let technicianSourceNote: string | null = null;

  const paths = Array.isArray(sourcePaths) ? sourcePaths : [];
  // Manual "Select from photo" overrides win — same single-source-of-truth
  // rule as the customer link: never re-derive over a human's choice.
  if (manualCustomerSignaturePath) {
    const img = await loadImageFromSignaturesBucket(manualCustomerSignaturePath);
    if (img) {
      const id = `archive-cust-manual-${archivedId}`;
      sigImages[id] = img;
      customerSig = {
        id,
        signer_name: header?.customer_signed_name || "",
        signer_role: "customer",
        signer_position: null,
      };
      customerSourceNote = "Signature captured from original scan";
    }
  }
  if (manualEngineerSignaturePath) {
    const img = await loadImageFromSignaturesBucket(manualEngineerSignaturePath);
    if (img) {
      const id = `archive-eng-manual-${archivedId}`;
      sigImages[id] = img;
      engineerSigOverride = {
        id,
        signer_name: header?.engineer || "",
        signer_role: "engineer",
        signer_position: null,
      };
      technicianSourceNote = "Signature captured from original scan";
    }
  }

  if (paths.length > 0 && header) {
    // Customer signatures are deliberately NOT auto-cropped from OCR bboxes.
    // The only valid source is manualCustomerSignaturePath above.
    // Only crop the engineer signature from the scan when we DON'T have a
    // manual override or a profile signature to apply — otherwise the
    // shared generator's profile-signature stamping wins (correct provenance).
    if (!engineerSigOverride && !technicianName && header.engineer_signature_bbox) {
      const img = await cropSignatureFromScan(paths, header.engineer_signature_bbox);
      if (img) {
        const id = `archive-eng-${archivedId}`;
        sigImages[id] = img;
        engineerSigOverride = {
          id,
          signer_name: header.engineer || "",
          signer_role: "engineer",
          signer_position: null,
        };
        technicianSourceNote = "Signature carried from original scan";
      }
    }
  }

  // Dry riser sheets print on the same Viva sheet as the QR-flow paperwork,
  // filled in from the scan, so converted reports look the same.
  if (usesPrintedSheetLayout(template.name)) {
    const blob = await renderFilledRiserSheet({
      archivedId, template, responses: responsesWithDate, header, customer, site, effectiveSite,
      documentDate, technicianName, sigImages, customerSig, engineerSigOverride,
    });
    const rel = `archive/report/${archivedId}-${Date.now()}.pdf`;
    const fullPath = await buildOrgPathAsync(rel);
    const { error } = await supabase.storage.from("submissions").upload(fullPath, blob, { upsert: true, contentType: "application/pdf" });
    if (error) throw error;
    return { path: fullPath, pageCount: 1 };
  }

  // Non-UUID jobId => generator skips DB-driven signature / assignment / job
  // lookups and relies purely on the jobInfo we pass in.
  const fakeJobId = `archive-${archivedId}`;

  const { base64, pageCount } = await generateJobSheetPdf(
    template as any,
    responsesWithDate,
    jobInfo,
    fakeJobId,
    // submittedBy → generator ilike-matches profiles.full_name and applies
    // the stored profile signature as the technician signature.
    technicianName || undefined,
    documentDate || null,
    undefined,
    (customerSig || engineerSigOverride)
      ? {
          customerSig,
          engineerSig: engineerSigOverride,
          sigImages,
          customerSourceNote,
          technicianSourceNote,
        }
      : undefined,
  );

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const rel = `archive/report/${archivedId}-${Date.now()}.pdf`;
  const fullPath = await buildOrgPathAsync(rel);
  const { error } = await supabase.storage
    .from("submissions")
    .upload(fullPath, blob, {
      upsert: true,
      contentType: "application/pdf",
    });
  if (error) throw error;
  return { path: fullPath, pageCount };
}

/** Dry riser templates that have a QR-flow paper sheet layout. */
export function usesRiserPaperForm(name: string): boolean {
  return /dry\s*riser/i.test(name || "") && /pressure\s*test|visual|commission/i.test(name || "");
}
export { usesPrintedSheetLayout };

function imageToFill(img: HTMLImageElement | null | undefined): FillImage | null {
  if (!img || !img.naturalWidth) return null;
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return { dataUrl: c.toDataURL("image/png"), width: c.width, height: c.height, format: "PNG" };
  } catch { return null; }
}

async function dataUrlToFill(dataUrl: string | null | undefined): Promise<FillImage | null> {
  if (!dataUrl || !/^data:image\//.test(dataUrl)) return null;
  const img = await new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl; });
  return imageToFill(img);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ukDate = (iso: string | null | undefined) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ""); };

export async function renderFilledRiserSheet(o: {
  archivedId: string; template: ArchivePdfInput["template"]; responses: Record<string, any>; header: any;
  customer: any; site: any; effectiveSite: any; documentDate: string | null; technicianName?: string | null;
  sigImages: Record<string, HTMLImageElement>; customerSig: any; engineerSigOverride: any;
  /** Tablet report: customer's printed name / signing date from the captured signature. */
  custName?: string | null; custDate?: string | null;
}): Promise<Blob> {
  const { header } = o;
  const fields: any[] = Array.isArray(o.template.fields) ? o.template.fields : [];
  // Inlet/outlet valve and access lines print in their own rows; literal "\n" becomes a line break.
  const r = applySheetNotes({ ...o.responses, additional_notes: o.responses.additional_notes ?? header?.additional_notes ?? null }, fields);
  const byLabel = (re: RegExp) => { for (const f of fields) if (re.test(String(f.label || "")) && r[f.id] != null && String(r[f.id]).trim() !== "") return String(r[f.id]); return ""; };
  // Job (for reference / PO) when this report belongs to a job.
  let job: any = null;
  const jobId = UUID_RE.exec(o.archivedId)?.[0];
  if (jobId) {
    const { data } = await supabase.from("jobs").select("reference_number, customer_po").eq("id", jobId).maybeSingle();
    job = data;
  }
  // Linked riser record → QR, Riser ID and the riser line.
  let asset: any = null;
  const assetId = r.riser_asset_id || r._riser_asset_id;
  if (assetId) {
    const { data } = await (supabase as any).from("assets").select("id, asset_tag, name, riser_location, outlets_count").eq("id", assetId).maybeSingle();
    asset = data;
  }
  const outlets = asset?.outlets_count ?? (r._number_of_outlets != null && r._number_of_outlets !== "" ? Number(r._number_of_outlets) : null);
  const isHydrant = /hydrant/i.test(o.template.name);
  const riserLocation = isHydrant
    ? hydrantLocationText(r, header)
    : asset?.riser_location || r.riser_location || byLabel(/riser\s*loc/i) || header?.riser_location || null;
  // A real PO only: hydrant numbers / internal refs must never print as a PO.
  const poRaw = isHydrant
    ? hydrantPoText(job?.customer_po, r)
    : header?.po_ref || r.po_ref || byLabel(/po\s*number|purchase order/i) || job?.customer_po || "";
  const also = [
    ...String(r.additional_notes || "").split(/\n+/),
    ...cleanUnmapped(Array.isArray(r._sheet_unmapped) ? r._sheet_unmapped : header?.unmapped_items).map((i) => `${i.label}${i.value ? `: ${i.value}` : ""}`),
  ].map((x) => x.replace(/^•\s*/, "").trim()).filter((x) => x && !/^Also on the paper sheet:?$/i.test(x));
  // Engineer signature: office crop, scan crop, else the named engineer's stored signature.
  let techSig = o.engineerSigOverride ? imageToFill(o.sigImages[o.engineerSigOverride.id]) : null;
  if (!techSig && o.technicianName) {
    const { data } = await supabase.from("profiles").select("signature_data").ilike("full_name", o.technicianName).limit(1).maybeSingle();
    techSig = await dataUrlToFill((data as any)?.signature_data);
  }
  const custSig = o.customerSig ? imageToFill(o.sigImages[o.customerSig.id]) : null;
  const date = ukDate(o.documentDate) || r.date || "";
  const riserKind = /wet\s*riser/i.test(o.template.name) ? "Wet Riser" : "Dry Riser";
  const fill: PaperFormFill = {
    answers: { ...r, _scan_header: header || r._scan_header },
    // Some scans store line breaks as a literal "\n"; print real line breaks.
    issues: String(byLabel(/issues found|defects found|comments/i) || r.comments || "").replace(/\\n/g, "\n"),
    recommendation: byLabel(/recommendation/i),
    priority: byLabel(/^\s*priority/i),
    also,
    techName: o.technicianName || header?.engineer || r.technician_name || byLabel(/technician name|engineer/i) || null,
    techDate: date,
    custName: o.customerSig ? (o.custName || header?.customer_signed_name || o.customerSig.signer_name || null) : null,
    custDate: o.customerSig ? (o.custDate || r._customer_sign_date || date) : null,
    techSig, custSig,
  };
  return generateBlankSheetPdfBlob(
    { id: o.template.id, name: o.template.name, description: o.template.description ?? null, fields, footer_text: o.template.footer_text ?? null, branding: o.template.branding },
    {
      address: o.effectiveSite?.address || null,
      customer: o.customer?.name || null,
      customers: o.customer ? { name: o.customer.name, logo_url: o.customer.logo_url } : null,
      reference_number: job?.reference_number || "",
      customer_po: poRaw ? String(poRaw) : null,
      due_date: o.documentDate || null,
      site_id: o.site?.id,
      site: { name: o.effectiveSite?.name || "", address: o.effectiveSite?.address || null, postcode: null, contact_name: null, contact_phone: null, contact_email: null, riser_location: riserLocation },
      riserVisit: isHydrant && !asset ? null : { asset_id: asset?.id || null, asset_tag: asset?.asset_tag || null, riser_name: asset ? (/^(dry|wet)\s*riser/i.test(asset.name || "") ? asset.name : `${riserKind} - ${asset.riser_location || asset.name || ""}`.replace(/ - $/, "")) : null, riser_location: riserLocation, outlets_count: outlets, job_reference: job?.reference_number || null },
      filled: fill,
      ...(isHydrant ? { locationLabel: "HYDRANT NO. / LOCATION:", poOnly: true } : {}),
    },
    { copiesOverride: 1, watermarkOverride: { mode: "untinted", opacity: 0.12 } as any },
  );
}
