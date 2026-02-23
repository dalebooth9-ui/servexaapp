import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";


type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  allow_notes?: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
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
  site?: { name: string; address: string | null } | null;
};

interface Props {
  template: Template;
  formData: Record<string, any>;
  jobInfo: JobInfo | null;
  jobId: string;
  submittedBy?: string;
  submittedAt?: string | null;
}

export default function JobSheetPdfExport({ template, formData, jobInfo, jobId, submittedBy, submittedAt }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
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
      let y = 8;

      const branding = template.branding || {};
      const companyName = branding.company_name || "VIVAFIRE";
      const companySubtitle = branding.company_subtitle || "Wet & Dry Riser Specialists";
      const isVisual = template.name.toLowerCase().includes("visual") || (template as any).category === "visual";
      const defaultFooter = isVisual
        ? "We have, today, carried out a visual check of the system\nto the requirements of BS 9990:2015"
        : "We have, today, carried out a Hydraulic Pressure Test to 12 Bar\nfor a period of 15 minutes to the requirements of BS 9990:2015";
      const footerText = branding.footer_text || defaultFooter;

      // --- HEADER: Logo centred, title below, white background ---
      const logoUrl = branding.logo_url || "/images/vivafire-logo-new.jpg";
      let logoBottomY = y;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = logoUrl;
        });
        const logoMaxW = 70;
        const logoMaxH = 20;
        const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
        let lw = logoMaxH * aspect;
        let lh = logoMaxH;
        if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
        const fmt = logoUrl.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        doc.addImage(logoImg, fmt, (pageWidth - lw) / 2, y, lw, lh);
        logoBottomY = y + lh + 3;
      } catch {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, pageWidth / 2, y + 5, { align: "center" });
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(companySubtitle, pageWidth / 2, y + 9, { align: "center" });
        logoBottomY = y + 12;
      }

      // Title below logo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(33, 61, 99);
      doc.text(template.name.toUpperCase(), pageWidth / 2, logoBottomY, { align: "center" });

      // Separator line
      doc.setDrawColor(33, 61, 99);
      doc.setLineWidth(0.5);
      doc.line(margin, logoBottomY + 3, pageWidth - margin, logoBottomY + 3);

      doc.setTextColor(30, 30, 30);
      y = logoBottomY + 7;

      // --- Customer details compact row ---
      const customerName = jobInfo?.customers?.name || jobInfo?.customer || "";
      const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
      const siteName = jobInfo?.site?.name || "";
      const refNumber = jobInfo?.reference_number || "";
      const dateVal = formData["date"] || formData["inspection_date"] || new Date().toLocaleDateString("en-GB");

      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      const detailH = 12;
      doc.rect(margin, y, maxWidth, detailH);
      doc.line(margin + maxWidth * 0.5, y, margin + maxWidth * 0.5, y + detailH);
      doc.line(margin, y + detailH / 2, margin + maxWidth, y + detailH / 2);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Customer/Site:", margin + 1, y + 3);
      doc.setFont("helvetica", "normal");
      const siteStr = [customerName, siteName, siteAddress].filter(Boolean).join(", ");
      doc.text(doc.splitTextToSize(siteStr, maxWidth * 0.48 - 20).slice(0, 1).join(""), margin + 22, y + 3);

      doc.setFont("helvetica", "bold");
      doc.text("DATE:", margin + maxWidth * 0.5 + 1, y + 3);
      doc.setFont("helvetica", "normal");
      doc.text(String(dateVal), margin + maxWidth * 0.5 + 14, y + 3);

      doc.setFont("helvetica", "bold");
      doc.text("PO/REF:", margin + 1, y + 3 + detailH / 2);
      doc.setFont("helvetica", "normal");
      doc.text(refNumber, margin + 16, y + 3 + detailH / 2);

      // Find riser location field value
      const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
      if (riserField && formData[riserField.id]) {
        doc.setFont("helvetica", "bold");
        doc.text("RISER LOC:", margin + maxWidth * 0.5 + 1, y + 3 + detailH / 2);
        doc.setFont("helvetica", "normal");
        doc.text(String(formData[riserField.id]), margin + maxWidth * 0.5 + 22, y + 3 + detailH / 2);
      }

      y += detailH + 2;

      // --- Calculate available space for sections ---
      const footerSpace = 28; // signatures + footer declaration
      const availableH = pageHeight - y - footerSpace;

      // --- Sections and fields as compact table ---
      const sections = [...new Set(template.fields.map((f) => f.section || "General"))];
      // Skip fields already shown in header (customer, date, PO, riser location)
      const skipLabels = ["customer /site details", "customer/site details", "date", "po number", "riser location"];

      const colSplit = maxWidth * 0.68;

      // Count total rows and section headers to dynamically size rows
      let totalFieldRows = 0;
      let totalSectionHeaders = 0;
      const sectionHeaderH = 6;
      const commentsField = template.fields.find(f => f.label.toLowerCase().includes("comment"));
      const materialsField = template.fields.find(f => f.label.toLowerCase().includes("material"));
      const commentsVal = commentsField ? formData[commentsField.id] || "" : "";
      const materialsVal = materialsField ? formData[materialsField.id] || "" : "";
      const commentsH = (commentsVal || materialsVal) ? 9 : 0;

      for (const sec of sections) {
        const sf = template.fields.filter(
          (f) => (f.section || "General") === sec &&
            !skipLabels.some(sl => f.label.toLowerCase().includes(sl))
        );
        if (sf.length === 0) continue;
        totalSectionHeaders++;
        totalFieldRows += sf.length;
      }

      const usedByHeaders = totalSectionHeaders * sectionHeaderH + totalSectionHeaders; // +1 gap per section
      const spaceForRows = availableH - usedByHeaders - commentsH;
      const rowH = Math.max(4, Math.min(7, spaceForRows / Math.max(totalFieldRows, 1)));

      for (const section of sections) {
        const sectionFields = template.fields.filter(
          (f) => (f.section || "General") === section &&
            !skipLabels.some(sl => f.label.toLowerCase().includes(sl))
        );
        if (sectionFields.length === 0) continue;

        // Section header
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, y, maxWidth, sectionHeaderH, "F");
        doc.setDrawColor(0);
        doc.rect(margin, y, maxWidth, sectionHeaderH);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(section.toUpperCase(), margin + 1, y + 4.5);
        doc.text("RESULT", margin + colSplit + 1, y + 4.5);
        y += sectionHeaderH;

        // Field rows
        doc.setFontSize(8.5);
        for (const field of sectionFields) {
          doc.setDrawColor(180);
          doc.rect(margin, y, colSplit, rowH);
          doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

          // Label
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
          const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
          doc.text(label, margin + 1, y + 3);

          // Value
          const val = formData[field.id];
          let displayVal = "";
          if (field.type === "pass_fail") {
            displayVal = val === "pass" ? "PASS" : val === "fail" ? "FAIL" : val === "n/a" ? "N/A" : "—";
            if (val === "pass") { doc.setTextColor(0, 128, 0); doc.setFont("helvetica", "bold"); }
            else if (val === "fail") { doc.setTextColor(200, 0, 0); doc.setFont("helvetica", "bold"); }
            doc.text(displayVal, margin + colSplit + 1, y + 3);
          } else if (field.type === "checkbox") {
            displayVal = val ? "YES" : "NO";
            doc.text(displayVal, margin + colSplit + 1, y + 3);
          } else if (field.type === "photo") {
            displayVal = val ? "✓ Captured" : "—";
            doc.text(displayVal, margin + colSplit + 1, y + 3);
          } else {
            displayVal = val ? String(val).substring(0, 50) : "—";
            doc.text(displayVal, margin + colSplit + 1, y + 3);
          }
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "normal");

          // Inline note
          const noteVal = formData[`${field.id}_notes`];
          if (field.allow_notes && noteVal) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(100, 100, 100);
            doc.text(`Note: ${noteVal}`.substring(0, 80), margin + 2, y + rowH + 2.5);
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "normal");
            y += 3;
          }

          y += rowH;
        }
        y += 1;
      }

      // --- Comments + Materials compact ---
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");

      if (commentsVal || materialsVal) {
        doc.text("Comments:", margin, y + 3);
        doc.setFont("helvetica", "normal");
        doc.text(String(commentsVal).substring(0, 100) || "None", margin + 18, y + 3);
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.text("Materials:", margin, y + 3);
        doc.setFont("helvetica", "normal");
        doc.text(String(materialsVal).substring(0, 100) || "None", margin + 18, y + 3);
        y += 5;
      }

      // --- Signature blocks ---
      const sigY = Math.max(y + 2, pageHeight - footerSpace);
      const halfW = maxWidth / 2 - 2;
      const dateStr = submittedAt ? new Date(submittedAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");

      // Find engineer and customer signatures (treat admin as technician)
      const engineerSig = signatures.find((s: any) => s.signer_role === "engineer" || s.signer_role === "admin");
      const customerSig = signatures.find((s: any) => s.signer_role === "customer");
      const sigImgH = 8;
      const sigImgW = 25;

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(`Date: `, margin, sigY + 3);
      doc.setFont("helvetica", "normal");
      doc.text(dateStr, margin + 10, sigY + 3);
      doc.setFont("helvetica", "bold");
      doc.text("Technician:", margin, sigY + 7);
      doc.setFont("helvetica", "normal");
      doc.text(engineerSig?.signer_name || submittedBy || "", margin + 20, sigY + 7);
      if (engineerSig && sigImages[engineerSig.id]) {
        doc.addImage(sigImages[engineerSig.id], "PNG", margin + 18, sigY + 8, sigImgW, sigImgH);
      } else {
        doc.text("Signature:", margin, sigY + 11);
        doc.line(margin + 18, sigY + 11, margin + halfW, sigY + 11);
      }

      const cx = margin + halfW + 4;
      doc.setFont("helvetica", "bold");
      doc.text(`Date: `, cx, sigY + 3);
      doc.setFont("helvetica", "normal");
      doc.text(dateStr, cx + 10, sigY + 3);
      doc.setFont("helvetica", "bold");
      doc.text("Customer:", cx, sigY + 7);
      doc.setFont("helvetica", "normal");
      doc.text(customerSig?.signer_name || jobInfo?.customers?.name || jobInfo?.customer || "", cx + 18, sigY + 7);
      if (customerSig && sigImages[customerSig.id]) {
        doc.addImage(sigImages[customerSig.id], "PNG", cx + 18, sigY + 8, sigImgW, sigImgH);
      } else {
        doc.text("Signature:", cx, sigY + 11);
        doc.line(cx + 18, sigY + 11, cx + halfW, sigY + 11);
      }

      // --- Footer declaration ---
      const footerY = sigY + 15;
      doc.setDrawColor(0);
      doc.rect(margin, footerY, maxWidth, 9);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      const footerLines = footerText.split("\n");
      footerLines.forEach((line, i) => {
        doc.text(line.trim(), pageWidth / 2, footerY + 3 + i * 3.5, { align: "center" });
      });


      // Watermark on every page
      const watermark = await loadWatermarkImage();
      if (watermark) addWatermarkToAllPages(doc, watermark);

      const fileName = `${jobInfo?.reference_number || "job-sheet"}-${template.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      doc.save(fileName);
      toast({ title: "PDF generated", description: `${fileName} downloaded.` });
    } catch (err: any) {
      toast({ title: "Error generating PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
      {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1.5 h-3.5 w-3.5" />}
      {generating ? "Generating..." : "Print"}
    </Button>
  );
}
