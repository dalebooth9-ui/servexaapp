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
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";
import { resolveTemplateDisplayTitle } from "@/lib/templateDisplayTitle";
import { DRY_RISER_LAYOUT } from "@/lib/dryRiserLayout";
import {
  PdfTemplateField,
  buildSkipIds,
  getSections,
  getSectionFields,
  computeSectionLayout,
  renderSectionHeader,
  renderFilledFieldRow,
} from "@/lib/pdfBody";
import { fetchOrientedImage } from "@/lib/exifOrient";

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
  preloadedSignatures?: { engineerSig?: { id: string; signer_name: string; signer_role: string }; customerSig?: { id: string; signer_name: string; signer_role: string }; sigImages?: Record<string, HTMLImageElement> },
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

  // Always do a fresh DB fetch for the customer logo in case jobInfo is stale or missing the join
  let customerLogoUrl: string | null = jobInfo?.customers?.logo_url ?? null;
  if (!customerLogoUrl && isValidUuid) {
    try {
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("customers(logo_url)")
        .eq("id", jobId)
        .single();
      customerLogoUrl = (freshJob as any)?.customers?.logo_url || null;
    } catch { /* use null */ }
  }
  // Dry Riser sheets: force Viva Fire branding regardless of customer logo, to match
  // the Industry Templates page version (single source of truth for template look).
  const branding = isDryRiser
    ? { ...(template.branding || {}), logo_url: "/vivafire-logo.png" }
    : { ...(template.branding || {}), logo_url: customerLogoUrl || template.branding?.logo_url || undefined };
  const footerText = getDefaultFooterText(template.name, branding, template.footer_text);

  // --- Load customer logo and extract dominant brand colour ---
  let brandLogoImg: HTMLImageElement | null = null;
  if (customerLogoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = customerLogoUrl; });
      brandLogoImg = img;
    } catch { /* use default colour */ }
  }
  const accentColor = getBrandColorFromLogo(brandLogoImg, !!customerLogoUrl);

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

  const customerName = jobInfo?.customers?.name || jobInfo?.customer || findFormVal("customer detail", "client detail", "customer company", "client company", "company") || "";
  const siteFormVal = findFormVal("site detail", "site info", "site name", "site address", "location");
  const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
  const siteName = jobInfo?.site?.name || "";
  // Also try to pull site from the job address if no site linked
  const siteDisplay = siteFormVal || siteName || siteAddress || jobInfo?.address || "";
  const refNumber = findFormVal("po number", "reference", "ref no", "job ref", "order number") || jobInfo?.reference_number || "";
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
  const sections = getSections(template.fields);
  const colSplit = maxWidth * (isDryRiser ? 0.7 : 0.68);

  const commentsField = template.fields.find(f => f.label.toLowerCase().includes("comment"));
  const materialsField = template.fields.find(f => f.label.toLowerCase().includes("material"));
  const commentsVal = commentsField ? resolvedFormData[commentsField.id] || "" : "";
  const materialsVal = materialsField ? resolvedFormData[materialsField.id] || "" : "";
  const commentsH = (commentsVal || materialsVal) ? 9 : 0;

  const layout = computeSectionLayout(template.fields, sections, skipIds, availableH, {
    extraSpaceUsed: commentsH,
    sectionHeaderH: isDryRiser ? DRY_RISER_LAYOUT.body.sectionHeaderRowMm : undefined,
    minRowH: isDryRiser ? DRY_RISER_LAYOUT.body.fieldRowMm : undefined,
    maxRowH: isDryRiser ? DRY_RISER_LAYOUT.body.fieldRowMm : undefined,
  });

  for (const section of sections) {
    const sectionFields = getSectionFields(template.fields, section, skipIds);
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

  // --- Site Photos (2-column grid with captions, embedded as base64) ---
  let sitePhotoUrls: string[] = (resolvedFormData._site_photo_urls as string[]) || [];
  const sitePhotoPaths: string[] = (resolvedFormData._site_photo_paths as string[]) || [];
  const sitePhotoCaptions: string[] = (resolvedFormData._site_photo_captions as string[]) || [];
  // If we have storage paths but no usable URLs (or fewer URLs than paths), regenerate signed URLs
  if (sitePhotoPaths.length > sitePhotoUrls.length) {
    const fresh: string[] = [];
    for (const p of sitePhotoPaths) {
      const { data } = await supabase.storage.from("submissions").createSignedUrl(p, 60 * 60);
      if (data?.signedUrl) fresh.push(data.signedUrl);
    }
    if (fresh.length > 0) sitePhotoUrls = fresh;
  }
  if (sitePhotoUrls.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...accentColor);
    doc.text("Site Photos", margin, y + 4);
    doc.setTextColor(0, 0, 0);
    y += 7;

    const gap = 4;
    const photoW = (maxWidth - gap) / 2; // 2 photos per row, ~93mm wide on A4 (~250px)
    const photoH = photoW * 0.75;
    const captionH = 5;
    const rowH = photoH + captionH + 4;

    for (let i = 0; i < sitePhotoUrls.length; i++) {
      const col = i % 2;
      if (col === 0 && i > 0) y += rowH;

      // Check if we need a new page
      if (y + rowH > pageHeight - footerSpace) {
        doc.addPage();
        y = margin;
      }

      const x = margin + col * (photoW + gap);

      try {
        // Fetch with EXIF orientation applied so portrait phone shots
        // aren't rendered sideways in the PDF.
        const oriented = await fetchOrientedImage(sitePhotoUrls[i]);
        if (oriented) {
          doc.addImage(
            oriented.dataUrl,
            oriented.mimeType === "image/png" ? "PNG" : "JPEG",
            x,
            y,
            photoW,
            photoH,
          );
        }
      } catch { /* skip failed photo */ }

      // Caption beneath
      const caption = (sitePhotoCaptions[i] || "").trim() || `Photo ${i + 1}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      const captionLines = doc.splitTextToSize(caption, photoW);
      doc.text(captionLines[0], x, y + photoH + 4);
      doc.setTextColor(0, 0, 0);
    }
    y += rowH;
  }


  // --- Dwelling photos (grouped by unit_number) ---
  // Any repeating_table field whose rows carry a `photos` gallery is rendered
  // here, grouped under the row's unit_number with captions beneath each image.
  const galleryFields = template.fields.filter((f: any) =>
    f.type === "repeating_table" &&
    Array.isArray((f as any).columns) &&
    (f as any).columns.some((c: any) => c?.type === "photo_gallery")
  );

  for (const galField of galleryFields) {
    const rawRows = resolvedFormData[galField.id];
    let rows: any[] = [];
    if (Array.isArray(rawRows)) rows = rawRows;
    else if (typeof rawRows === "string" && rawRows.trim().startsWith("[")) {
      try { rows = JSON.parse(rawRows); } catch { rows = []; }
    }
    if (!Array.isArray(rows) || rows.length === 0) continue;

    type RenderItem = { url: string; caption: string };
    type RenderGroup = { label: string; items: RenderItem[] };
    const groups: RenderGroup[] = [];

    for (const row of rows) {
      const photos = Array.isArray(row?.photos) ? row.photos : [];
      if (photos.length === 0) continue;
      const label = String(row?.unit_number || "").trim() || "Unit (unspecified)";

      const items: RenderItem[] = [];
      for (const p of photos) {
        if (!p || typeof p !== "object" || !p.path) continue;
        const { data } = await supabase.storage.from("submissions").createSignedUrl(p.path, 60 * 60);
        if (data?.signedUrl) items.push({ url: data.signedUrl, caption: String(p.caption || "").trim() });
      }
      if (items.length > 0) groups.push({ label, items });
    }

    if (groups.length === 0) continue;

    // Section heading
    if (y + 12 > pageHeight - footerSpace) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...accentColor);
    doc.text(galField.label || "Dwelling Photos", margin, y + 4);
    doc.setTextColor(0, 0, 0);
    y += 7;

    const gap = 4;
    const cols = 3;
    const photoW = (maxWidth - gap * (cols - 1)) / cols;
    const photoH = photoW * 0.75;
    const captionH = 8;
    const photoRowH = photoH + captionH + 3;

    for (const group of groups) {
      // Group subheading (unit number)
      if (y + 6 + photoRowH > pageHeight - footerSpace) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setFillColor(...accentColor);
      doc.rect(margin, y, maxWidth, 5.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(`Unit: ${group.label}`, margin + 2, y + 4);
      doc.setTextColor(0, 0, 0);
      y += 7;

      for (let i = 0; i < group.items.length; i++) {
        const col = i % cols;
        if (col === 0 && i > 0) y += photoRowH;
        if (y + photoRowH > pageHeight - footerSpace) {
          doc.addPage();
          y = margin;
        }
        const x = margin + col * (photoW + gap);
        const item = group.items[i];
        try {
          const oriented = await fetchOrientedImage(item.url);
          if (oriented) {
            doc.addImage(
              oriented.dataUrl,
              oriented.mimeType === "image/png" ? "PNG" : "JPEG",
              x,
              y,
              photoW,
              photoH,
            );
          }
        } catch { /* skip failed photo */ }

        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);
        const captionText = item.caption || `Photo ${i + 1}`;
        const captionLines = doc.splitTextToSize(captionText, photoW).slice(0, 3);
        captionLines.forEach((line: string, li: number) => {
          doc.text(line, x, y + photoH + 3 + li * 3);
        });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
      }
      y += photoRowH + 2;
    }
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

  const techField = template.fields.find(f => f.label.toLowerCase().includes("technician name"));
  const techName = (techField && formData[techField.id]) ? String(formData[techField.id]) : (submittedBy || engineerSig?.signer_name || "");

  renderPdfSignatures(doc, sigY, {
    dateStr: sigDateStr,
    technicianName: techName,
    customerName: customerSignedDisplayName,
    sigImages,
    engineerSig,
    customerSig,
  });

  renderPdfFooter(doc, declarationFooterY, footerText);

  const custAccredUrls = await fetchCustomerAccreditationLogos(customerName);
  const [watermark, accredLogos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(custAccredUrls),
  ]);
  await renderBrandingOverlay(doc, { watermark, brandColor: accentColor, accredLogos, accredFooterY: declarationFooterY, accredLogoH: logoH });

  const safeSite = siteDisplay.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const fileName = [jobInfo?.reference_number || "job-sheet", safeSite || null, template.name.replace(/\s+/g, "-").toLowerCase()].filter(Boolean).join("-") + ".pdf";
  const base64 = doc.output("datauristring").split(",")[1];

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
