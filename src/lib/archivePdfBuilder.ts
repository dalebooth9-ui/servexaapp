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
   * Source scan page paths (submissions bucket) — used to crop the customer
   * / engineer signature regions from the original scan so the electronic
   * report carries across the real ink instead of dropping the signature.
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
   * picked by the office via "Select from photo". When set, override the
   * auto-crop (customer_signature_bbox / engineer_signature_bbox) and any
   * profile-signature stamping. Same single-source-of-truth rule as the
   * customer link — never re-derive over a human's choice.
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
  if (!header) return responses;
  const next = { ...responses };
  // Top-level aliases the PDF generator already reads directly.
  if (header.customer_signed_name && !next._customer_signed_name) {
    next._customer_signed_name = header.customer_signed_name;
  }
  if (header.customer_sign_date && !next._customer_sign_date) {
    next._customer_sign_date = header.customer_sign_date;
  }
  if (header.number_of_outlets != null && !next._number_of_outlets) {
    next._number_of_outlets = header.number_of_outlets;
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
    reference_number: `ARCH-${archivedId.substring(0, 8).toUpperCase()}`,
    site: effectiveSite,
  } as any;

  // Seed header extractions into responses so riser location, outlet count,
  // cabinet keys, PO ref, date, etc. render on the electronic report.
  let responsesWithDate = seedHeaderIntoResponses(
    { ...responses },
    header,
    Array.isArray(template.fields) ? template.fields : [],
  );

  if (documentDate && !responsesWithDate.date) {
    // format as dd/mm/yyyy for the header renderer's fallback picker
    const m = documentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    responsesWithDate.date = m ? `${m[3]}/${m[2]}/${m[1]}` : documentDate;
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
    if (!customerSig && header.customer_signature_bbox) {
      const img = await cropSignatureFromScan(paths, header.customer_signature_bbox);
      if (img) {
        const id = `archive-cust-${archivedId}`;
        sigImages[id] = img;
        customerSig = {
          id,
          signer_name: header.customer_signed_name || "",
          signer_role: "customer",
          signer_position: null,
        };
        customerSourceNote = "Signature carried from original scan";
      }
    }
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
