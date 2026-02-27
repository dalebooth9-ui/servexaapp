import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { renderPdfHeader } from "@/lib/pdfHeader";
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
  customers?: { name: string } | null;
  reference_number: string;
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
): Promise<{ base64: string; fileName: string }> {
  // Pre-fetch signatures for this job
  const { data: sigData } = await supabase
    .from("job_signatures")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const signatures = (sigData || []) as any[];
  const sigImages: Record<string, HTMLImageElement> = {};
  await Promise.all(signatures.map(async (sig) => {
    try {
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

  const branding = template.branding || {};
  const footerText = getDefaultFooterText(template.name, branding);

  // Helper: find form value by label pattern
  const findFormVal = (...patterns: string[]): string => {
    for (const f of template.fields) {
      const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
      if (patterns.some(p => label.includes(p) || label === p)) {
        const v = formData[f.id];
        if (v) return String(v);
      }
    }
    return "";
  };

  const customerName = findFormVal("customer detail", "customer name", "client") || jobInfo?.customers?.name || jobInfo?.customer || "";
  const siteFormVal = findFormVal("site detail", "site info", "site name", "site address");
  const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
  const siteName = jobInfo?.site?.name || "";
  const refNumber = findFormVal("po number", "reference", "ref no", "job ref", "order number") || jobInfo?.reference_number || "";
  const dateVal = formData["date"] || formData["inspection_date"] || findFormVal("date", "inspection date", "service date", "visit date") || new Date().toLocaleDateString("en-GB");
  const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
  const riserLocValue = riserField && formData[riserField.id] ? String(formData[riserField.id]) : "";

  let y = await renderPdfHeader(doc, template.name, branding, {
    customerName,
    siteName: siteFormVal || siteName,
    siteAddress: siteFormVal ? "" : siteAddress,
    refNumber,
    dateVal,
    riserLocation: riserLocValue,
  });

  // --- Service scope line (PT / Visual / Other) ---
  const scopeParts = [
    (jobInfo?.pressure_test_qty ?? 0) > 0 ? `PT x${jobInfo!.pressure_test_qty}` : null,
    (jobInfo?.visual_qty ?? 0) > 0 ? `Vis x${jobInfo!.visual_qty}` : null,
    (jobInfo?.other_qty ?? 0) > 0 ? `${jobInfo!.other_service_type || "Other"} x${jobInfo!.other_qty}` : null,
  ].filter(Boolean).join("  |  ");
  if (scopeParts) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(33, 61, 99);
    doc.text(`Service Scope: `, margin, y + 3.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(scopeParts, margin + doc.getTextWidth("Service Scope: "), y + 3.5);
    y += 6;
  }

  // --- Shared layout utilities ---
  const footerSpace = 28;
  const availableH = pageHeight - y - footerSpace;
  const skipIds = buildSkipIds(template.fields);
  const sections = getSections(template.fields);
  const colSplit = maxWidth * 0.68;

  const commentsField = template.fields.find(f => f.label.toLowerCase().includes("comment"));
  const materialsField = template.fields.find(f => f.label.toLowerCase().includes("material"));
  const commentsVal = commentsField ? formData[commentsField.id] || "" : "";
  const materialsVal = materialsField ? formData[materialsField.id] || "" : "";
  const commentsH = (commentsVal || materialsVal) ? 9 : 0;

  const layout = computeSectionLayout(template.fields, sections, skipIds, availableH, {
    extraSpaceUsed: commentsH,
  });

  for (const section of sections) {
    const sectionFields = getSectionFields(template.fields, section, skipIds);
    if (sectionFields.length === 0) continue;

    y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH });

    for (const field of sectionFields) {
      y = renderFilledFieldRow(doc, field, formData[field.id], formData[`${field.id}_notes`], y, {
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

  // --- Signature blocks ---
  const sigY = Math.max(y + 2, pageHeight - footerSpace);
  const dateStr = submittedAt ? new Date(submittedAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");

  const engineerSig = signatures.find((s: any) => s.signer_role === "engineer" || s.signer_role === "admin");
  const customerSig = signatures.find((s: any) => s.signer_role === "customer");

  const techField = template.fields.find(f => f.label.toLowerCase().includes("technician name"));
  const techName = (techField && formData[techField.id]) ? String(formData[techField.id]) : (engineerSig?.signer_name || submittedBy || "");

  const footerY = renderPdfSignatures(doc, sigY, {
    dateStr,
    technicianName: techName,
    customerName: jobInfo?.customers?.name || jobInfo?.customer || "",
    sigImages,
    engineerSig,
    customerSig,
  });

  renderPdfFooter(doc, footerY, footerText);

  const watermark = await loadWatermarkImage();
  if (watermark) addWatermarkToAllPages(doc, watermark);

  const fileName = `${jobInfo?.reference_number || "job-sheet"}-${template.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1];

  return { base64, fileName };
}

export default function JobSheetPdfExport({ template, formData, jobInfo, jobId, submittedBy, submittedAt, onPdfGenerated, trigger, mode = "preview" }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async (forceMode?: "preview" | "download") => {
    setGenerating(true);
    const effectiveMode = forceMode ?? mode;
    // Open window immediately before async work to avoid popup blocker
    const previewWindow = (effectiveMode === "preview" && !onPdfGenerated) ? window.open("", "_blank") : null;
    try {
      const { base64, fileName } = await generateJobSheetPdf(template, formData, jobInfo, jobId, submittedBy, submittedAt);

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
          if (previewWindow) {
            previewWindow.location.href = url;
          } else {
            window.open(url, "_blank");
          }
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          toast({ title: "PDF opened", description: fileName });
        }
      }
    } catch (err: any) {
      if (previewWindow) previewWindow.close();
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
