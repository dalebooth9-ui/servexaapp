import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useJobCategories } from "@/hooks/useJobCategories";

import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { loadAccreditationLogos, addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { getBrandColorFromLogo } from "@/lib/extractLogoColors";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";
import {
  PdfTemplateField,
  buildSkipIds,
  getSections,
  getSectionFields,
  computeSectionLayout,
  renderSectionHeader,
  renderFilledFieldRow,
} from "@/lib/pdfBody";

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: PdfTemplateField[];
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

  const outletsField = template.fields.find((field) => {
    const label = normalizeFieldLabel(field.label);
    return label === "number of outlets" || label === "no of outlets" || label === "outlets";
  });
  const scannedOutletValue = resolvedFormData._number_of_outlets ?? resolvedFormData.number_of_outlets;
  if (outletsField && !hasValue(resolvedFormData[outletsField.id]) && hasValue(scannedOutletValue)) {
    resolvedFormData[outletsField.id] = scannedOutletValue;
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
  const margin = 10;
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
  // Customer logo always takes priority over the template's stored branding logo
  const branding = { ...(template.branding || {}), logo_url: customerLogoUrl || template.branding?.logo_url || undefined };
  const footerText = getDefaultFooterText(template.name, branding);

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
  const numberOfOutletsValue = outletsField && hasValue(resolvedFormData[outletsField.id])
    ? resolvedFormData[outletsField.id]
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

  let y = await renderPdfHeader(doc, template.name, branding, {
    customerName,
    siteName: siteDisplay,
    siteAddress: "",
    refNumber,
    dateVal,
    riserLocation: riserLocValue,
    numberOfOutlets: numberOfOutletsValue,
    w3wAddress,
  }, undefined, accentColor);

  // --- Service scope line (PT / Visual / Other) ---
  const scopeParts = [
    (jobInfo?.pressure_test_qty ?? 0) > 0 ? `PT x ${jobInfo!.pressure_test_qty}` : null,
    (jobInfo?.visual_qty ?? 0) > 0 ? `Vis x ${jobInfo!.visual_qty}` : null,
    (jobInfo?.other_qty ?? 0) > 0 ? `${jobInfo!.other_service_type || "Other"} x ${jobInfo!.other_qty}` : null,
  ].filter(Boolean).join("  |  ");
  if (scopeParts) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...accentColor);
    doc.text(`Service Scope: `, margin, y + 3.5);
    const labelWidth = doc.getTextWidth("Service Scope: ");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(scopeParts, margin + labelWidth, y + 3.5);
    y += 6;
  }

  // --- Shared layout utilities ---
  // footerSpace must accommodate: sigs (18mm) + logos (12mm) + logo gap (3mm) + footer box (9mm) + buffer (8mm)
  // Bottom stack: margin(10) + footer box(9) + gap(3) + accred logos(12) + gap(3) + sigs(18) + buffer(3) = 58mm
  const footerSpace = 58;
  const availableH = pageHeight - y - footerSpace;
  const skipIds = buildSkipIds(template.fields);
  const sections = getSections(template.fields);
  const colSplit = maxWidth * 0.68;

  const commentsField = template.fields.find(f => f.label.toLowerCase().includes("comment"));
  const materialsField = template.fields.find(f => f.label.toLowerCase().includes("material"));
  const commentsVal = commentsField ? resolvedFormData[commentsField.id] || "" : "";
  const materialsVal = materialsField ? resolvedFormData[materialsField.id] || "" : "";
  const commentsH = (commentsVal || materialsVal) ? 9 : 0;

  const layout = computeSectionLayout(template.fields, sections, skipIds, availableH, {
    extraSpaceUsed: commentsH,
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

  // --- Site Photos (embedded in comments section) ---
  const sitePhotoUrls: string[] = (resolvedFormData._site_photo_urls as string[]) || [];
  if (sitePhotoUrls.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...accentColor);
    doc.text("Site Photos", margin, y + 3.5);
    doc.setTextColor(0, 0, 0);
    y += 5;

    const photoW = (maxWidth - 4) / 3; // 3 photos per row
    const photoH = photoW * 0.75;

    for (let i = 0; i < sitePhotoUrls.length; i++) {
      const col = i % 3;
      if (col === 0 && i > 0) y += photoH + 3;

      // Check if we need a new page
      if (y + photoH + 10 > pageHeight - footerSpace) {
        doc.addPage();
        y = margin;
      }

      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = sitePhotoUrls[i];
        });
        if (img.naturalWidth > 0) {
          const x = margin + col * (photoW + 2);
          doc.addImage(img, "JPEG", x, y, photoW, photoH);
        }
      } catch { /* skip failed photo */ }
    }
    y += photoH + 3;
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

  const [watermark, accredLogos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(),
  ]);
  if (watermark) addWatermarkToAllPages(doc, watermark, accentColor);
  // Pass declarationFooterY so internal calc places logos at: declarationFooterY - logoH - 3 = logoRowY
  addAccreditationLogosToAllPages(doc, accredLogos, declarationFooterY, logoH);

  const safeSite = siteDisplay.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const fileName = [jobInfo?.reference_number || "job-sheet", safeSite || null, template.name.replace(/\s+/g, "-").toLowerCase()].filter(Boolean).join("-") + ".pdf";
  const base64 = doc.output("datauristring").split(",")[1];

  return { base64, fileName };
}

export default function JobSheetPdfExport({ template, formData, jobInfo, jobId, submittedBy, submittedAt, onPdfGenerated, trigger, mode = "preview", categoryName: categoryNameProp }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();

  const generate = async (forceMode?: "preview" | "download") => {
    setGenerating(true);
    const effectiveMode = forceMode ?? mode;
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
        const url = URL.createObjectURL(blob);
        if (effectiveMode === "download") {
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast({ title: "PDF downloaded", description: fileName });
        } else {
          window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          toast({ title: "PDF opened", description: fileName });
        }
      }
    } catch (err: any) {
      toast({ title: "Error generating PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (trigger) {
    return <span onClick={() => generate()} className="cursor-pointer">{generating ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : trigger}</span>;
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" onClick={() => generate("preview")} disabled={generating} title="Preview PDF">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
      </Button>
      <Button variant="outline" size="sm" onClick={() => generate("download")} disabled={generating} title="Download PDF">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
