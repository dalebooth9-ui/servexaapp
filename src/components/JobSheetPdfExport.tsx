import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, Download, Eye } from "lucide-react";
import PdfPreviewDialog from "@/components/PdfPreviewDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useJobCategories } from "@/hooks/useJobCategories";

import jsPDF from "jspdf";
import { loadWatermarkImage } from "@/lib/pdfWatermark";
import { renderBrandingOverlay } from "@/lib/pdfBranding";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos } from "@/lib/pdfAccreditations";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { getBrandColorFromLogo } from "@/lib/extractLogoColors";
import { resolveDocumentBrandingProfile } from "@/lib/documentBrandingProfile";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";
import { resolveTemplateDisplayTitle } from "@/lib/templateDisplayTitle";
import { DRY_RISER_LAYOUT } from "@/lib/dryRiserLayout";
import { collectEmbeddedPhotoPaths, createSubmissionPhotoSignedUrl, normalisePhotoPathForDedupe } from "@/lib/jobPhotos";
import {
  PdfTemplateField,
  buildSkipIds,
  getSections,
  getSectionFields,
  getRenderableSections,
  getRenderableSectionFields,
  computeSectionLayout,
  renderSectionHeader,
  renderFilledFieldRow,
} from "@/lib/pdfBody";
import { fetchOrientedImage } from "@/lib/exifOrient";

function extractSubmissionPath(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const match = raw.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  if (raw.startsWith("http")) return null;
  return raw;
}

function parseDwellingPhotos(value: any): { path: string; caption: string }[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (() => { try { return JSON.parse(value); } catch { return []; } })()
      : value
        ? [value]
        : [];
  return (Array.isArray(raw) ? raw : [raw])
    .flatMap((p: any) => {
      const path = typeof p === "object" ? extractSubmissionPath(p.path || p.url || p.file_url) : extractSubmissionPath(p);
      return path ? [{ path, caption: typeof p === "object" ? String(p.caption || p.note || "").trim() : "" }] : [];
    });
}

function getDwellingRowPhotos(row: any, photoCol: any, columns: any[]): { path: string; caption: string }[] {
  const photos = parseDwellingPhotos(photoCol ? row?.[photoCol.id] : row?.photos);
  if (photos.length > 0) return photos;
  const knownColumnIds = new Set((columns || []).map((c: any) => c?.id).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (key === "id" || key === photoCol?.id) continue;
    const column = (columns || []).find((c: any) => c?.id === key);
    const label = String(column?.label || key);
    const looksLikePhoto = /photo|image|picture/i.test(key) || /photo|image|picture/i.test(label) || (!knownColumnIds.has(key) && String(value || "").includes("template-photos/"));
    if (!looksLikePhoto) continue;
    const legacy = parseDwellingPhotos(value);
    if (legacy.length > 0) return legacy;
  }
  return [];
}

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: PdfTemplateField[];
  footer_text?: string | null;
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
  };
};

type JobInfo = {
  address: string | null;
  customer: string | null;
  customers?: { name: string; logo_url?: string | null } | null;
  reference_number: string;
  customer_po?: string | null;
  category?: string | null;
  pressure_test_qty?: number;
  visual_qty?: number;
  other_qty?: number;
  other_service_type?: string | null;
  site?: { name: string; address: string | null } | null;
};

interface Props {
  template: Template;
  formData: Record<string, any>;
  jobInfo: JobInfo | null;
  jobId: string;
  submittedBy?: string;
  submittedAt?: string | null;
  onPdfGenerated?: (pdfBase64: string, fileName: string) => void;
  trigger?: React.ReactNode;
  mode?: "preview" | "download";
  categoryName?: string;
}

/**
 * Generate a filled job sheet PDF and return it as { base64, fileName }.
 * Extracted so it can be called from SendToCustomerMenu without mounting the component.
 */
export async function generateJobSheetPdf(
  template: Template,
  formData: Record<string, any>,
  jobInfo: JobInfo | null,
  jobId: string,
  submittedBy?: string,
  submittedAt?: string | null,
  categoryName?: string,
  preloadedSignatures?: { engineerSig?: { id: string; signer_name: string; signer_role: string; signer_position?: string | null; created_at?: string }; customerSig?: { id: string; signer_name: string; signer_role: string; signer_position?: string | null; created_at?: string }; sigImages?: Record<string, HTMLImageElement>; technicianSourceNote?: string | null; customerSourceNote?: string | null },
): Promise<{ base64: string; fileName: string }> {
  // Resolve scope/category fields in formData using the human-readable category name
  const resolvedFormData = { ...formData };
  const normalizeFieldLabel = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hasValue = (value: unknown) => value !== undefined && value !== null && value !== "";

  if (categoryName) {
    template.fields.forEach((f) => {
      const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
      if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category") || label.includes("service type")) {
        resolvedFormData[f.id] = categoryName;
      }
    });
  }

  const outletFields = template.fields.filter((field) => {
    const label = normalizeFieldLabel(field.label);
    return (
      label.includes("number of outlets") ||
      label.includes("no of outlets") ||
      label === "outlets"
    );
  });
  const scannedOutletValue =
    resolvedFormData._number_of_outlets ??
    resolvedFormData.number_of_outlets ??
    resolvedFormData.no_of_outlets;
  if (hasValue(scannedOutletValue)) {
    outletFields.forEach((field) => {
      if (!hasValue(resolvedFormData[field.id])) {
        resolvedFormData[field.id] = scannedOutletValue;
      }
    });
  }

  const passFailFields = template.fields.filter((field) => field.type === "pass_fail");
  const overallResultField = passFailFields.find((field) => {
    const normalizedId = normalizeFieldLabel(field.id.replace(/_/g, " "));
    const normalizedLabel = normalizeFieldLabel(field.label);
    return normalizedId === "overall result" || normalizedLabel === "overall result";
  });
  const pressureTestResultField = passFailFields.find((field) => {
    const normalizedId = normalizeFieldLabel(field.id.replace(/_/g, " "));
    const normalizedLabel = normalizeFieldLabel(field.label);
    return (
      normalizedId === "pressure test result" ||
      normalizedId === "test result" ||
      normalizedLabel === "pressure test result"
    );
  });

  if (pressureTestResultField && !hasValue(resolvedFormData[pressureTestResultField.id])) {
    const pressureTestFallback =
      resolvedFormData.pressure_test_result ??
      resolvedFormData.test_result ??
      resolvedFormData.overall_result;

    if (hasValue(pressureTestFallback)) {
      resolvedFormData[pressureTestResultField.id] = pressureTestFallback;
    }
  }

  if (overallResultField && !hasValue(resolvedFormData[overallResultField.id])) {
    const overallResultFallback =
      resolvedFormData.overall_result ??
      (pressureTestResultField ? resolvedFormData[pressureTestResultField.id] : undefined);

    if (hasValue(overallResultFallback)) {
      resolvedFormData[overallResultField.id] = overallResultFallback;
    }
  }

  // Pre-fetch job-specific signatures (skip if jobId is not a valid UUID)
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
  let sigData: any[] | null = null;
  if (isValidUuid) {
    const { data } = await supabase
      .from("job_signatures")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    sigData = data;
  }
  const signatures = (sigData || []) as any[];
  const sigImages: Record<string, HTMLImageElement> = {};

  // If no job-specific engineer signature, pull profile signature from the submitting engineer (matched by name)
  const hasEngineerSig = signatures.some((s: any) => s.signer_role === "engineer" || s.signer_role === "admin");
  if (!hasEngineerSig) {
    // Try to find the profile of the submitting engineer by matching submittedBy name first
    let submittingProfile: any = null;
    if (submittedBy) {
      const { data: profByName } = await supabase
        .from("profiles")
        .select("user_id, full_name, signature_data")
        .ilike("full_name", submittedBy.trim())
        .maybeSingle();
      if (profByName) submittingProfile = profByName;
    }
    // Fall back to the engineer_id from the submission record itself
    if (!submittingProfile && isValidUuid) {
      const { data: assigns } = await supabase.from("job_assignments").select("engineer_id, profiles(user_id, full_name, signature_data)").eq("job_id", jobId);
      if (assigns && assigns.length > 0) {
        // Prefer the one whose name matches submittedBy
        const match = submittedBy
          ? assigns.find((a: any) => a.profiles?.full_name?.toLowerCase() === submittedBy.toLowerCase())
          : null;
        const pick = match ?? assigns[0];
        if (pick?.profiles) submittingProfile = pick.profiles;
      }
    }
    if (submittingProfile?.signature_data) {
      signatures.unshift({
        id: `profile-${submittingProfile.user_id}`,
        signer_id: submittingProfile.user_id,
        signer_name: submittingProfile.full_name,
        signer_role: "engineer",
        file_path: null,
        _profileSigData: submittingProfile.signature_data,
      });
    }
  }

  await Promise.all(signatures.map(async (sig) => {
    try {
      if (sig._profileSigData) {
        // Load directly from base64 data URL
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = sig._profileSigData;
        });
        sigImages[sig.id] = img;
        return;
      }
      const { data } = await supabase.storage.from("signatures").createSignedUrl(sig.file_path, 3600);
      if (!data?.signedUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = data.signedUrl;
      });
      sigImages[sig.id] = img;
    } catch { /* skip */ }
  }));
  

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const isDryRiser = /dry\s*riser/i.test(template.name || "");
  const margin = isDryRiser ? DRY_RISER_LAYOUT.page.marginLeftMm : 10;
  const maxWidth = pageWidth - margin * 2;

  // Always do a fresh DB fetch for the customer branding in case jobInfo is
  // stale or missing the join. We need logo_url + brand_colour to feed the
  // single branding profile.
  let customerLogoUrl: string | null = jobInfo?.customers?.logo_url ?? null;
  let customerBrandColour: string | null =
    (jobInfo?.customers as any)?.brand_colour ?? null;
  if ((!customerLogoUrl || !customerBrandColour) && isValidUuid) {
    try {
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("customers(logo_url, brand_colour)")
        .eq("id", jobId)
        .single();
      const c = (freshJob as any)?.customers;
      customerLogoUrl = customerLogoUrl || c?.logo_url || null;
      customerBrandColour = customerBrandColour || c?.brand_colour || null;
    } catch { /* use null */ }
  }

  // Resolve ONE branding profile per document — header logo, watermark tint,
  // accreditation strip, and footer all derive from the same source. The
  // customer's brand_colour tints the standard flame graphic so we don't need
  // per-customer watermark assets.
  const brandProfile = await resolveDocumentBrandingProfile({
    template,
    customer: {
      name: jobInfo?.customers?.name,
      logo_url: customerLogoUrl,
      brand_colour: customerBrandColour,
    },
  });
  const branding = {
    ...(template.branding || {}),
    logo_url: brandProfile.logoUrl,
  };
  const footerText = getDefaultFooterText(template.name, branding, template.footer_text);
  const brandLogoImg = brandProfile.logoImage;
  const accentColor = brandProfile.accentColor;

  // Helper: find form value by label pattern
  const findFormVal = (...patterns: string[]): string => {
    for (const f of template.fields) {
      const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
      if (patterns.some(p => label.includes(p) || label === p)) {
        const v = resolvedFormData[f.id];
        if (hasValue(v)) return String(v);
      }
    }
    return "";
  };

  // Guard the form-text fallback: a sheet footer often prints the generating
  // org's own website ("vivafire.co.uk") next to a "Company:" label — we must
  // never surface that as the customer. Any candidate that looks like a URL /
  // domain / email or matches the org's own identity is discarded.
  const { isSafeCustomerName } = await import("@/lib/customerNameGuard");
  const orgIdentifiers = [
    (jobInfo as any)?.generating_org?.name,
    (jobInfo as any)?.generating_org?.intake_email,
    (jobInfo as any)?.generating_org?.scan_intake_email,
  ];
  const linkedCustomer = jobInfo?.customers?.name || jobInfo?.customer || "";
  const formCustomerCandidate = linkedCustomer
    ? ""
    : findFormVal("customer detail", "client detail", "customer company", "client company", "company");
  const customerName = linkedCustomer
    || (isSafeCustomerName(formCustomerCandidate, orgIdentifiers) ? formCustomerCandidate : "")
    || "";
  // Site lookup by label — deliberately narrow patterns and skip anything
  // that mentions "riser"/"valve"/"outlet" so the riser location field
  // never leaks into the Site display (it has its own dedicated header slot).
  const siteFormVal = (() => {
    const patterns = ["site detail", "site info", "site name", "site address", "site location"];
    for (const f of template.fields) {
      const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
      if (label.includes("riser") || label.includes("valve") || label.includes("outlet")) continue;
      if (patterns.some(p => label.includes(p) || label === p)) {
        const v = resolvedFormData[f.id];
        if (hasValue(v)) return String(v);
      }
    }
    return "";
  })();
  const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
  const siteName = jobInfo?.site?.name || "";
  // Also try to pull site from the job address if no site linked
  const siteDisplay = siteFormVal || siteName || siteAddress || jobInfo?.address || "";
  // Customer paperwork leads with the customer's PO; internal VFP-ref is the fallback.
  const customerPoRaw = (jobInfo as any)?.customer_po ? String((jobInfo as any).customer_po).trim() : "";
  const internalRefRaw = jobInfo?.reference_number ? String(jobInfo.reference_number).trim() : "";
  const formOverrideRef = findFormVal("po number", "reference", "ref no", "job ref", "order number");
  const refNumber = formOverrideRef
    || (customerPoRaw && internalRefRaw && customerPoRaw !== internalRefRaw
      ? `PO: ${customerPoRaw}  /  Our ref: ${internalRefRaw}`
      : customerPoRaw || internalRefRaw);
  const dateVal = resolvedFormData["date"] || resolvedFormData["inspection_date"] || findFormVal("date", "inspection date", "service date", "visit date") || new Date().toLocaleDateString("en-GB");
  const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
  const riserLocValue = riserField && hasValue(resolvedFormData[riserField.id])
    ? String(resolvedFormData[riserField.id])
    : (jobInfo?.site as any)?.riser_location || "";
  const numberOfOutletsValue = outletFields.find((field) => hasValue(resolvedFormData[field.id]))
    ? resolvedFormData[outletFields.find((field) => hasValue(resolvedFormData[field.id]))!.id]
    : hasValue(scannedOutletValue)
    ? scannedOutletValue
    : null;

  // Resolve what3words for the job site address
  let w3wAddress: string | undefined;
  const w3wLookupAddr = (jobInfo?.site as any)?.address || jobInfo?.address;
  if (w3wLookupAddr && jobId) {
    try {
      const { supabase: sb } = await import("@/integrations/supabase/client");
      const { data: w3wData } = await sb.functions.invoke("w3w-convert", { body: { address: w3wLookupAddr } });
      if (w3wData?.words) w3wAddress = w3wData.words as string;
    } catch { /* skip */ }
  }

  const { title: sheetTitle, subtitle: sheetSubtitle } = resolveTemplateDisplayTitle(
    template.name,
    { brandingSubtitle: branding.company_subtitle ?? null },
  );

  const headerAccent = isDryRiser ? DRY_RISER_LAYOUT.header.brandBlueRgb : accentColor;
  const ptToMm = (pt: number) => pt * 0.3527777778;

  let y = await renderPdfHeader(doc, sheetTitle, branding, {
    customerName,
    siteName: siteDisplay,
    siteAddress: "",
    refNumber,
    dateVal,
    riserLocation: riserLocValue,
    numberOfOutlets: numberOfOutletsValue,
    w3wAddress,
  }, isDryRiser ? "BS 9990:2015" : sheetSubtitle, headerAccent, {
    compact: false,
    marginX: margin,
    style: isDryRiser
      ? {
          logo: {
            maxW: 100,
            maxH: DRY_RISER_LAYOUT.header.logoHeightMm,
            topY: DRY_RISER_LAYOUT.page.marginTopMm,
          },
          title: { fontSize: DRY_RISER_LAYOUT.header.titleSizePt },
          standardFontSize: DRY_RISER_LAYOUT.header.subtitleSizePt,
          standardGapBelow: ptToMm(DRY_RISER_LAYOUT.header.ruleGapPt) + 1,
          separatorThickness: ptToMm(DRY_RISER_LAYOUT.header.ruleThicknessPt),
          detailGridVariant: "fourColumn",
        }
      : undefined,
  });

  // Service scope line removed per request — kept off the job sheet PDF.

  // --- Shared layout utilities ---
  // footerSpace must accommodate: sigs (18mm) + logos (12mm) + logo gap (3mm) + footer box (9mm) + buffer (8mm)
  // Bottom stack: margin(10) + footer box(9) + gap(3) + accred logos(12) + gap(3) + sigs(18) + buffer(3) = 58mm
  const footerSpace = isDryRiser ? 50 : 58;
  const availableH = pageHeight - y - footerSpace;
  const skipIds = buildSkipIds(template.fields);
  // Sections/fields the user marked as "omit from report" during form fill.
  const omittedSections: string[] = Array.isArray((resolvedFormData as any).__omitted_sections__)
    ? ((resolvedFormData as any).__omitted_sections__ as string[])
    : [];
  // Only render sections that have at least one non-blank, non-omitted field.
  const sections = getRenderableSections(
    template.fields,
    skipIds,
    resolvedFormData,
    omittedSections,
  );
  const colSplit = maxWidth * (isDryRiser ? 0.7 : 0.68);

  const commentsField = template.fields.find(f => f.label.toLowerCase().includes("comment"));
  const materialsField = template.fields.find(f => f.label.toLowerCase().includes("material"));
  const commentsVal = commentsField ? resolvedFormData[commentsField.id] || "" : "";
  const materialsVal = materialsField ? resolvedFormData[materialsField.id] || "" : "";
  const commentsH = (commentsVal || materialsVal) ? 9 : 0;

  // Layout sizing is driven off the same renderable-field set so we don't
  // reserve vertical space for rows that will never actually be drawn.
  const renderableFieldsForLayout = sections.flatMap((sec) =>
    getRenderableSectionFields(template.fields, sec, skipIds, resolvedFormData, omittedSections),
  );
  const layout = computeSectionLayout(renderableFieldsForLayout, sections, skipIds, availableH, {
    extraSpaceUsed: commentsH,
    sectionHeaderH: isDryRiser ? DRY_RISER_LAYOUT.body.sectionHeaderRowMm : undefined,
    minRowH: isDryRiser ? DRY_RISER_LAYOUT.body.fieldRowMm : undefined,
    maxRowH: isDryRiser ? DRY_RISER_LAYOUT.body.fieldRowMm : undefined,
  });

  for (const section of sections) {
    const sectionFields = getRenderableSectionFields(
      template.fields,
      section,
      skipIds,
      resolvedFormData,
      omittedSections,
    );
    if (sectionFields.length === 0) continue;

    y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH });

    for (const field of sectionFields) {
      y = renderFilledFieldRow(doc, field, resolvedFormData[field.id], resolvedFormData[`${field.id}_notes`], y, {
        margin, maxWidth, colSplit, rowH: layout.rowH,
      });
    }
    y += 1;
  }



  // --- Comments + Materials compact ---
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");

  if (commentsVal || materialsVal) {
    const commentTextWidth = maxWidth - 19;
    doc.text("Comments:", margin, y + 3);
    doc.setFont("helvetica", "normal");
    const wrappedComments = doc.splitTextToSize(String(commentsVal) || "None", commentTextWidth);
    doc.text(wrappedComments, margin + 18, y + 3);
    y += Math.max(4, wrappedComments.length * 3);
    doc.setFont("helvetica", "bold");
    doc.text("Materials:", margin, y + 3);
    doc.setFont("helvetica", "normal");
    const wrappedMaterials = doc.splitTextToSize(String(materialsVal) || "None", commentTextWidth);
    doc.text(wrappedMaterials, margin + 18, y + 3);
    y += Math.max(4, wrappedMaterials.length * 3) + 1;
  }

  // Site photo resolution + backfill is deferred to the PHOTOGRAPHIC EVIDENCE
  // section at the end of the document (after the Dwelling Access Log).



  // --- Dwelling Access Log (Section 8) ---
  // Renders any repeating_table field that includes a photo_gallery column
  // (the dwelling access log) using a professional layout:
  // header bar → access summary stats → compact dwelling table → photo grid.
  const galleryFields = template.fields.filter((f: any) =>
    f.type === "repeating_table" &&
    Array.isArray((f as any).columns) &&
    (f as any).columns.some((c: any) => c?.type === "photo_gallery")
  );
  const renderedJobPhotoPaths = new Set<string>();

  const NAVY: [number, number, number] = [26, 46, 74];        // #1a2e4a
  const GREEN_TXT: [number, number, number] = [6, 95, 70];    // #065f46
  const GREEN_BG: [number, number, number] = [209, 250, 229]; // #d1fae5
  const AMBER_TXT: [number, number, number] = [146, 64, 14];  // #92400e
  const AMBER_BG: [number, number, number] = [254, 243, 199]; // #fef3c7
  const RED_TXT: [number, number, number] = [153, 27, 27];    // #991b1b
  const RED_BG: [number, number, number] = [254, 226, 226];   // #fee2e2
  const STAT_GREEN: [number, number, number] = [26, 122, 74]; // #1a7a4a
  const STAT_AMBER: [number, number, number] = [180, 83, 9];  // #b45309
  const STAT_RED: [number, number, number] = [185, 28, 28];   // #b91c1c
  const ROW_ALT: [number, number, number] = [247, 248, 250];
  const BORDER: [number, number, number] = [210, 214, 220];
  const MUTED: [number, number, number] = [110, 116, 128];

  type StatusKind = "gained" | "noanswer" | "refused" | "unknown";
  const classifyStatus = (raw: string): StatusKind => {
    const v = (raw || "").toLowerCase();
    if (!v) return "unknown";
    if (v.includes("refus")) return "refused";
    if (v.includes("no answer") || v.includes("no access") || v.includes("not gained") || v.includes("not in") || v.includes("absent")) return "noanswer";
    if (v.includes("gain") || v === "yes" || v.includes("access ok") || v.includes("ok")) return "gained";
    return "unknown";
  };
  const statusLabel = (k: StatusKind, raw: string) => {
    if (raw && raw.trim()) return raw.trim();
    if (k === "gained") return "Access gained";
    if (k === "noanswer") return "No answer";
    if (k === "refused") return "Refused";
    return "—";
  };

  for (const galField of galleryFields) {
    const rawRows = resolvedFormData[galField.id];
    let rows: any[] = [];
    if (Array.isArray(rawRows)) rows = rawRows;
    else if (typeof rawRows === "string" && rawRows.trim().startsWith("[")) {
      try { rows = JSON.parse(rawRows); } catch { rows = []; }
    }
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const columns: any[] = Array.isArray((galField as any).columns) ? (galField as any).columns : [];
    const colMatch = (re: RegExp) => columns.find((c: any) => re.test(String(c?.id || "")) || re.test(String(c?.label || "")));
    const unitCol = colMatch(/unit|flat|dwelling|apt|apartment/i);
    const statusCol = colMatch(/status|access/i);
    const headsCol = colMatch(/^heads?$|head[_ ]?count|total[_ ]?heads|sprinkler[_ ]?heads/i);
    const notesCol = colMatch(/note|comment|remark/i);
    const photoCol = columns.find((c: any) => c?.type === "photo_gallery");
    const roomCols = columns.filter((c: any) => {
      if (!c) return false;
      if (c === unitCol || c === statusCol || c === headsCol || c === notesCol) return false;
      if (c.type === "photo_gallery" || c.type === "photo") return false;
      return /hall|kitchen|bedroom|lounge|living|bath|wc|toilet|landing|cupboard|store|stair|corridor|utility|dining|study|attic|loft|en[- ]?suite|room/i.test(String(c?.label || c?.id || ""));
    });

    // Build dwelling entries
    type Entry = {
      unit: string;
      statusRaw: string;
      status: StatusKind;
      heads: string;
      breakdown: string;
      notes: string;
      photos: { path: string; caption: string }[];
    };
    const entries: Entry[] = rows.map((row: any, idx: number) => {
      const unit = String(row?.[unitCol?.id] ?? row?.unit_number ?? "").trim() || `Unit ${idx + 1}`;
      const statusRaw = String(row?.[statusCol?.id] ?? row?.access_status ?? row?.status ?? "").trim();
      const status = classifyStatus(statusRaw);
      let heads = String(row?.[headsCol?.id] ?? row?.heads ?? row?.head_count ?? "").trim();
      const breakdownParts: string[] = [];
      let derivedHeads = 0;
      for (const rc of roomCols) {
        const v = row?.[rc.id];
        const num = Number(v);
        if (Number.isFinite(num) && num > 0) {
          breakdownParts.push(`${rc.label} ×${num}`);
          derivedHeads += num;
        } else if (typeof v === "string" && v.trim() && v.trim() !== "0") {
          breakdownParts.push(`${rc.label} ${v.trim()}`);
        }
      }
      if (!heads && derivedHeads > 0) heads = String(derivedHeads);
      if (status === "noanswer" || status === "refused") heads = "—";
      const notes = String(row?.[notesCol?.id] ?? row?.notes ?? row?.comments ?? "").trim();
      const breakdown = breakdownParts.join(", ");
      const photos = getDwellingRowPhotos(row, photoCol, columns);
      return { unit, statusRaw, status, heads: heads || "—", breakdown, notes, photos };
    });

    const totals = {
      total: entries.length,
      gained: entries.filter((e) => e.status === "gained").length,
      noanswer: entries.filter((e) => e.status === "noanswer").length,
      refused: entries.filter((e) => e.status === "refused").length,
    };

    // === PART A: Section header bar ===
    if (y + 30 > pageHeight - footerSpace) { doc.addPage(); y = margin; }
    const dwellingSectionStartPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
    const dwellingSectionStartY = y;

    const headerH = 8;
    doc.setFillColor(...NAVY);
    doc.rect(margin, y, maxWidth, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("SECTION 8 — DWELLING ACCESS LOG", margin + 3, y + 5.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 210, 225);
    const stdText = "BS 9251:2021";
    const stdW = doc.getTextWidth(stdText);
    doc.text(stdText, margin + maxWidth - stdW - 3, y + 5.4);
    doc.setTextColor(0, 0, 0);
    y += headerH;

    // === PART B: Access summary stats ===
    const statsH = 14;
    const colW = maxWidth / 4;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, maxWidth, statsH);
    for (let i = 1; i < 4; i++) {
      doc.line(margin + colW * i, y, margin + colW * i, y + statsH);
    }
    const statCols = [
      { label: "TOTAL DWELLINGS", value: String(totals.total), color: [0, 0, 0] as [number, number, number] },
      { label: "ACCESS GAINED", value: String(totals.gained), color: STAT_GREEN },
      { label: "NO ANSWER", value: String(totals.noanswer), color: STAT_AMBER },
      { label: "REFUSED", value: String(totals.refused), color: STAT_RED },
    ];
    statCols.forEach((s, i) => {
      const cx = margin + colW * i + colW / 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(s.label, cx, y + 4.5, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...s.color);
      doc.text(s.value, cx, y + 11.5, { align: "center" });
    });
    doc.setTextColor(0, 0, 0);
    y += statsH + 2;

    // === PART C: Dwelling table ===
    // 5 columns: Unit | Status | Heads per flat | Room breakdown & notes | Photo notes
    const unitW = Math.max(maxWidth * 0.30, 46);
    const statusW = Math.max(maxWidth * 0.15, 28);
    const headsW = Math.max(maxWidth * 0.11, 18);
    const remaining = maxWidth - unitW - statusW - headsW;
    const notesW = remaining / 2;
    const photoNotesW = remaining - notesW;
    const tblColW = [unitW, statusW, headsW, notesW, photoNotesW];
    const tblHeaderH = 7;
    const renderTableHeader = () => {
      doc.setFillColor(235, 238, 242);
      doc.rect(margin, y, maxWidth, tblHeaderH, "F");
      doc.setDrawColor(...BORDER);
      doc.rect(margin, y, maxWidth, tblHeaderH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 55);
      let cx = margin;
      ["Unit", "Status", "Heads per flat", "Room breakdown & notes", "Photo notes"].forEach((h, i) => {
        doc.text(h, cx + 2, y + 4.8);
        cx += tblColW[i];
      });
      doc.setTextColor(0, 0, 0);
      y += tblHeaderH;
    };
    renderTableHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const notesText = e.status === "gained"
        ? [e.breakdown, e.notes].filter(Boolean).join(". ")
        : (e.notes || "—");
      const captions = (e.photos || []).map((p) => (p.caption || "").trim()).filter(Boolean);
      const photoNotesText = captions.length ? captions.join("; ") : "—";
      const notesLines = doc.splitTextToSize(notesText || "—", tblColW[3] - 4);
      const photoNotesLines = doc.splitTextToSize(photoNotesText, tblColW[4] - 4);
      // Wrap unit name (leave ~5mm gap before status badge starts)
      const unitLines = doc.splitTextToSize(String(e.unit), tblColW[0] - 5);
      const rowH = Math.max(
        8,
        Math.max(notesLines.length, unitLines.length, photoNotesLines.length) * 3.6 + 3,
      );

      if (y + rowH > pageHeight - footerSpace) {
        doc.addPage();
        y = margin;
        renderTableHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
      }

      // Zebra body stripes intentionally removed — opaque fills on body rows
      // blank the page watermark inconsistently. Transparent interiors keep the
      // flame watermark showing evenly through every row.

      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.1);
      doc.rect(margin, y, maxWidth, rowH);

      const cy = y + rowH / 2 + 1.4;
      let cx = margin;

      // Unit (wrapped, top-aligned, breaks long names; word-break behaviour via splitTextToSize)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(20, 25, 35);
      doc.text(unitLines, cx + 2, y + 4.5);
      cx += tblColW[0];

      // Status badge (3mm inset to guarantee a visible gap after wrapped unit text)
      const badgeBg = e.status === "gained" ? GREEN_BG : e.status === "noanswer" ? AMBER_BG : e.status === "refused" ? RED_BG : [235, 238, 242] as [number, number, number];
      const badgeFg = e.status === "gained" ? GREEN_TXT : e.status === "noanswer" ? AMBER_TXT : e.status === "refused" ? RED_TXT : MUTED;
      const badgeText = statusLabel(e.status, e.statusRaw);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      const bw = Math.min(tblColW[1] - 4, doc.getTextWidth(badgeText) + 4);
      const bh = 4.6;
      const bx = cx + 3;
      const by = y + rowH / 2 - bh / 2;
      doc.setFillColor(...badgeBg);
      doc.roundedRect(bx, by, bw, bh, 1, 1, "F");
      doc.setTextColor(...badgeFg);
      doc.text(badgeText, bx + bw / 2, by + 3.3, { align: "center" });
      doc.setFontSize(9);
      cx += tblColW[1];

      // Heads (per flat)
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(String(e.heads || "—"), cx + 2, cy);
      if (e.heads && e.heads !== "—") {
        const numW = doc.getTextWidth(String(e.heads));
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text("(per flat)", cx + 2 + numW + 1.5, cy);
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
      }
      cx += tblColW[2];

      // Room breakdown & notes
      if (e.status !== "gained" && e.notes) {
        doc.setFont("helvetica", "italic");
      } else {
        doc.setFont("helvetica", "normal");
      }
      doc.setTextColor(40, 45, 55);
      doc.text(notesLines, cx + 2, y + 4.5);
      cx += tblColW[3];

      // Photo notes (combined captions)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(photoNotesText === "—" ? MUTED[0] : 40, photoNotesText === "—" ? MUTED[1] : 45, photoNotesText === "—" ? MUTED[2] : 55);
      doc.text(photoNotesLines, cx + 2, y + 4.5);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);

      y += rowH;
    }
    y += 4;

    // Tag pages from dwelling section start through here for subtle watermark
    const dwellingSectionEndPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
    (doc as any)._dwellingPages = (doc as any)._dwellingPages || new Set<number>();
    for (let p = dwellingSectionStartPage; p <= dwellingSectionEndPage; p++) {
      (doc as any)._dwellingPages.add(p);
    }

    // === PART D: Photographic Evidence (site photos with engineer captions) ===
    // Resolve site photo URLs (with submissions-table backfill for legacy data),
    // re-sign from storage paths when present, then render a 3-per-row grid
    // with each engineer-typed caption beneath its photo.
    let sitePhotoUrls: string[] = (resolvedFormData._site_photo_urls as string[]) || [];
    let sitePhotoPaths: string[] = (resolvedFormData._site_photo_paths as string[]) || [];
    let sitePhotoCaptions: string[] = (resolvedFormData._site_photo_captions as string[]) || [];

    if (sitePhotoUrls.length === 0 && jobId) {
      try {
        const { data: subs } = await supabase
          .from("submissions")
          .select("file_url, content, engineer_id, created_at")
          .eq("job_id", jobId)
          .eq("type", "photo")
          .order("created_at", { ascending: true });
        if (subs && subs.length > 0) {
          const ownPhotos = (subs as any[]).filter((s) => submittedBy && s.engineer_id === submittedBy);
          const pool = ownPhotos.length > 0 ? ownPhotos : (subs as any[]);
          sitePhotoUrls = pool.map((s) => s.file_url as string).filter(Boolean);
          sitePhotoCaptions = pool.map((s) => (s.content as string) || "");
          sitePhotoPaths = pool.map(() => "");
        }
      } catch (err) {
        console.warn("[JobSheetPdfExport] backfill site photos failed", err);
      }
    }

    if (sitePhotoPaths.length > 0) {
      const fresh: string[] = [];
      for (const p of sitePhotoPaths) {
        try {
          const signed = await createSubmissionPhotoSignedUrl(p, jobId, 60 * 60);
          fresh.push(signed?.signedUrl || "");
        } catch (err) {
          console.warn("[JobSheetPdfExport] site photo sign failed", p, err);
          fresh.push("");
        }
      }
      if (fresh.some(Boolean)) sitePhotoUrls = fresh.map((url, i) => url || sitePhotoUrls[i] || "");
    }

    const orientedSitePhotos = await Promise.all(
      sitePhotoUrls.map(async (url) => {
        try { return await fetchOrientedImage(url); }
        catch (err) { console.warn("[JobSheetPdfExport] site photo orient failed", url, err); return null; }
      }),
    );
    console.log("[JobSheetPdfExport] photographic evidence", {
      urlCount: sitePhotoUrls.length,
      loaded: orientedSitePhotos.filter(Boolean).length,
      captionCount: sitePhotoCaptions.length,
    });

    if (sitePhotoUrls.length > 0) {
      [...sitePhotoPaths, ...sitePhotoUrls].forEach((p) => {
        const key = normalisePhotoPathForDedupe(p, jobId);
        if (key) renderedJobPhotoPaths.add(key);
      });
      if (y + headerH + 5 > pageHeight - footerSpace) { doc.addPage(); y = margin; }
      doc.setFillColor(...NAVY);
      doc.rect(margin, y, maxWidth, headerH, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("PHOTOGRAPHIC EVIDENCE", margin + 3, y + 5.4);
      doc.setTextColor(0, 0, 0);
      y += headerH + 1;

      const cols = 4;
      const gap = 2;
      const photoW = (maxWidth - gap * (cols - 1)) / cols;
      const photoH = 42;
      const captionBlock = 10;
      const cellH = photoH + captionBlock + 1;

      // Reduced reserve: exclude signature space (checked separately later).
      const PHOTO_FOOTER_RESERVE = 32;
      const contentBottom = pageHeight - PHOTO_FOOTER_RESERVE;
      for (let i = 0; i < sitePhotoUrls.length; i++) {
        const col = i % cols;
        if (col === 0 && i > 0) y += cellH;
        if (col === 0 && y + cellH > contentBottom) {
          doc.addPage();
          y = margin;
        }
        const x = margin + col * (photoW + gap);

        doc.setFillColor(235, 238, 242);
        doc.rect(x, y, photoW, photoH, "F");

        const oriented = orientedSitePhotos[i];
        let rendered = false;
        if (oriented && oriented.dataUrl) {
          try {
            const ow = oriented.width || photoW;
            const oh = oriented.height || photoH;
            const scale = Math.min(photoW / ow, photoH / oh);
            const dw = Math.max(8, ow * scale);
            const dh = Math.max(8, oh * scale);
            const dx = x + (photoW - dw) / 2;
            const dy = y + (photoH - dh) / 2;
            doc.addImage(
              oriented.dataUrl,
              oriented.mimeType === "image/png" ? "PNG" : "JPEG",
              dx, dy, dw, dh, undefined, "FAST",
            );
            rendered = true;
          } catch (err) {
            console.warn("[JobSheetPdfExport] site photo addImage failed", err);
          }
        }
        if (!rendered) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text("Image unavailable", x + photoW / 2, y + photoH / 2 + 1, { align: "center" });
          doc.setTextColor(0, 0, 0);
        }
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.2);
        doc.rect(x, y, photoW, photoH);

        const caption = (sitePhotoCaptions[i] || "").trim();
        if (caption) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(50, 55, 65);
          const capLines = doc.splitTextToSize(caption, photoW).slice(0, 2);
          doc.text(capLines, x, y + photoH + 2.5);
          doc.setTextColor(0, 0, 0);
        }
      }
      y += cellH + 1;
    }
  }


  // === JOB PHOTOS / EVIDENCE ===
  // Always append job-level/site evidence, even when the template contains a
  // gallery field. Inline/gallery photos are deduped by storage path.
  if (isValidUuid) {
    try {
      const { loadJobPhotosForPdf } = await import("@/lib/jobPhotos");
      const excludePaths = collectEmbeddedPhotoPaths([{ responses: resolvedFormData }], jobId);
      renderedJobPhotoPaths.forEach((p) => excludePaths.add(p));
      const jobPhotos = await loadJobPhotosForPdf({ jobId, excludePaths });
      if (jobPhotos.length > 0) {
        const headerH = 8;
        const NAVY: [number, number, number] = [26, 46, 74];
        const BORDER: [number, number, number] = [210, 214, 220];

        if (y + headerH + 5 > pageHeight - footerSpace) { doc.addPage(); y = margin; }
        doc.setFillColor(...NAVY);
        doc.rect(margin, y, maxWidth, headerH, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`PHOTOS / EVIDENCE (${jobPhotos.length})`, margin + 3, y + 5.4);
        doc.setTextColor(0, 0, 0);
        y += headerH + 2;

        // Density-first grid: auto-pick cols so small photo sets stay on one page.
        // Reserve only the accreditation strip + footer band here (~30mm) —
        // signatures flow after and check their own remaining space (42mm).
        const PHOTO_FOOTER_RESERVE = 32;
        const contentBottom = pageHeight - PHOTO_FOOTER_RESERVE;
        const N = jobPhotos.length;

        // Choose columns by count: ≤6 → 3-per-row; 7-12 → 3-per-row; >12 → 2.
        const cols = N <= 12 ? 3 : 2;
        const gap = cols === 3 ? 3 : 4;
        const photoW = (maxWidth - gap * (cols - 1)) / cols;
        // Smaller cells for 3-col so 6 photos + table + sigs fit one page.
        const photoH = cols === 3 ? 46 : 60;
        const captionBlock = 10;
        const cellH = photoH + captionBlock + 2;

        const rowsTotal = Math.ceil(N / cols);
        const gridH = rowsTotal * cellH;
        // If the entire grid fits on the current page, don't break at all.
        const gridFits = y + gridH <= contentBottom;

        for (let i = 0; i < N; i++) {
          const col = i % cols;
          if (col === 0 && i > 0) y += cellH;
          if (!gridFits && col === 0 && y + cellH > contentBottom) {
            doc.addPage();
            y = margin;
          }
          const x = margin + col * (photoW + gap);
          const p = jobPhotos[i];

          doc.setFillColor(235, 238, 242);
          doc.rect(x, y, photoW, photoH, "F");
          try {
            const scale = Math.min(photoW / p.natW, photoH / p.natH);
            const dw = Math.max(8, p.natW * scale);
            const dh = Math.max(8, p.natH * scale);
            const dx = x + (photoW - dw) / 2;
            const dy = y + (photoH - dh) / 2;
            doc.addImage(p.dataUrl, "JPEG", dx, dy, dw, dh, undefined, "FAST");
          } catch { /* skip broken image */ }
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.2);
          doc.rect(x, y, photoW, photoH);

          const caption = (p.caption || "").trim();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(cols === 3 ? 7 : 7.5);
          doc.setTextColor(50, 55, 65);
          const bits = [caption, p.engineerName, new Date(p.createdAt).toLocaleDateString("en-GB")].filter(Boolean);
          const capLines = doc.splitTextToSize(bits.join(" · "), photoW).slice(0, cols === 3 ? 2 : 3);
          doc.text(capLines, x, y + photoH + 3);
          doc.setTextColor(0, 0, 0);
        }
        y += cellH + 2;
      }
    } catch (err) {
      console.warn("[JobSheetPdfExport] job photos section failed", err);
    }
  }


  // Signature section flows naturally after content. The sign-off block
  // occupies ~22mm (date + technician row + 11mm sig image + optional
  // source-note caption) and MUST fit above the accreditation strip on the
  // same page, or the whole report spills onto page 2. Reserve 22mm — this
  // number is intentionally aligned with the layout budget documented in
  // `pdfFooter.ts` (`renderPdfSignatures`). If you grow the sig block there,
  // grow this too and re-run `dryRiserSinglePage.test.ts`.
  const SIG_BLOCK_RESERVE_MM = 22;
  const remainingSpaceForSig = pageHeight - y - footerSpace;
  if (remainingSpaceForSig < SIG_BLOCK_RESERVE_MM) {
    doc.addPage();
    y = margin;
  }






  // --- Bottom stack layout (calculated from bottom up) ---
  // addAccreditationLogosToAllPages internally does: rowY = footerY - logoH - 3
  // So passing declarationFooterY places logos at declarationFooterY - logoH - 3
  const logoH = 12;
  const declarationFooterY = pageHeight - margin - 9;                    // e.g. 278mm
  const logoRowY = declarationFooterY - logoH - 3;                       // e.g. 263mm
  const sigY = Math.max(y + 2, logoRowY - 18);                           // e.g. 245mm (18mm for sig block)

  // Use the form's date field (job/inspection date) for the signature date, falling back to submittedAt then today
  const dateField = template.fields.find(f => {
    const lbl = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
    return lbl === "date" || lbl === "inspection date" || lbl === "service date" || lbl === "visit date";
  });
  const formDateVal = dateField ? String(formData[dateField.id] || "") : "";
  const dateStr = formDateVal || (submittedAt ? new Date(submittedAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"));
  // Use customer sign date from OCR if available (passed via _customer_sign_date in formData)
  const sigDateStr = resolvedFormData._customer_sign_date || dateStr;

  const engineerSig = signatures.find((s: any) => s.signer_role === "engineer" || s.signer_role === "admin") || preloadedSignatures?.engineerSig || null;
  const customerSig = signatures.find((s: any) => s.signer_role === "customer") || preloadedSignatures?.customerSig || null;

  // Merge preloaded sig images
  if (preloadedSignatures?.sigImages) {
    Object.assign(sigImages, preloadedSignatures.sigImages);
  }

  // For customer display name, prefer the preloaded customer sig name (OCR-extracted signer like "R. Croft")
  const customerSignedDisplayName = resolvedFormData._customer_signed_name || customerSig?.signer_name || jobInfo?.customers?.name || jobInfo?.customer || "";

  // Precedence: response's technician answer (either the template field labelled
  // "technician name" OR the top-level `technician_name` key persisted on the
  // response payload by the paper-scan flow) → assigned engineer / submitting
  // user → engineer signature record. This MUST match the engineer signature
  // lookup source (which keys off technician_name) so the printed NAME and the
  // rendered signature can't disagree — see VFP-00163 regression.
  const techField = template.fields.find(f => f.label.toLowerCase().includes("technician name"));
  const techFieldValue = techField && formData[techField.id] ? String(formData[techField.id]).trim() : "";
  const responseTechName =
    (typeof resolvedFormData.technician_name === "string" && resolvedFormData.technician_name.trim()) ||
    (typeof resolvedFormData._technician_name === "string" && resolvedFormData._technician_name.trim()) ||
    "";
  const techName = techFieldValue || responseTechName || submittedBy || engineerSig?.signer_name || "";

  renderPdfSignatures(doc, sigY, {
    dateStr: sigDateStr,
    technicianName: techName,
    customerName: customerSignedDisplayName,
    sigImages,
    engineerSig,
    customerSig,
    technicianSourceNote: preloadedSignatures?.technicianSourceNote ?? null,
    customerSourceNote: preloadedSignatures?.customerSourceNote ?? null,
  });

  renderPdfFooter(doc, declarationFooterY, footerText);

  const custAccredUrls = await fetchCustomerAccreditationLogos(customerName);
  const [watermark, accredLogos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(custAccredUrls),
  ]);
  await renderBrandingOverlay(doc, {
    watermark,
    brandColor: accentColor,
    accredLogos,
    accredFooterY: declarationFooterY,
    accredLogoH: logoH,
    // Keep the flame as a subtle background so dwelling-photo pages aren't dominated by it.
    override: { opacity: 0.06 },
  });

  const safeSite = siteDisplay.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const filenameRef = (jobInfo as any)?.customer_po || jobInfo?.reference_number || "job-sheet";
  const fileName = [filenameRef, safeSite || null, template.name.replace(/\s+/g, "-").toLowerCase()].filter(Boolean).join("-") + ".pdf";
  const base64 = doc.output("datauristring").split(",")[1];

  // Single-page safeguard. Report/job-sheet PDFs are supposed to fit on one
  // page — a page-2 spill is almost always a layout regression (sig block
  // grown, header logo bumped, extra body row added). Log a loud warning
  // rather than throwing so users still get their PDF, but the regression is
  // visible in browser + edge logs and easy to grep for.
  try {
    const pageCount = doc.getNumberOfPages();
    if (pageCount > 1) {
      // eslint-disable-next-line no-console
      console.warn(
        `[JobSheetPdfExport] SINGLE-PAGE REGRESSION: ${pageCount} pages for template "${template.name}" (${fileName}). ` +
          `Investigate sig block sizing, header logo height, or body row overflow.`,
      );
    }
  } catch { /* getNumberOfPages unavailable on this jsPDF build — skip */ }

  return { base64, fileName };
}


export default function JobSheetPdfExport({ template, formData, jobInfo, jobId, submittedBy, submittedAt, onPdfGenerated, trigger, mode = "preview", categoryName: categoryNameProp }: Props) {
  const [generating, setGenerating] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();

  const generate = async (forceMode?: "preview" | "download") => {
    setGenerating(true);
    const effectiveMode = forceMode ?? mode;
    // Immediate feedback before heavy synchronous PDF rendering.
    toast({ title: "Preparing PDF…", description: "This may take a few seconds." });
    await new Promise((r) => setTimeout(r, 50));
    try {
      const resolvedCategoryName = categoryNameProp
        || jobCategories.find(c => c.slug === (jobInfo as any)?.category)?.name
        || ((jobInfo as any)?.category ? (jobInfo as any).category.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "");
      const { base64, fileName } = await generateJobSheetPdf(template, formData, jobInfo, jobId, submittedBy, submittedAt, resolvedCategoryName);

      if (onPdfGenerated) {
        onPdfGenerated(base64, fileName);
        toast({ title: "PDF generated", description: `${fileName} attached.` });
      } else {
        const byteCharacters = atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        if (effectiveMode === "download") {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast({ title: "PDF downloaded", description: fileName });
        } else {
          // In-app preview — no save, no new tab
          setPreviewBlob(blob);
          setPreviewName(fileName);
          setPreviewOpen(true);
        }
      }
    } catch (err: any) {
      toast({ title: "Error generating PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const previewDialog = (
    <PdfPreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      blob={previewBlob}
      fileName={previewName}
      title={template.name}
    />
  );

  if (trigger) {
    return (
      <>
        <span onClick={() => generate()} className="cursor-pointer">{generating ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : trigger}</span>
        {previewDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => generate("preview")} disabled={generating} title="Preview PDF">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => generate("download")} disabled={generating} title="Download PDF">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {previewDialog}
    </>
  );
}
