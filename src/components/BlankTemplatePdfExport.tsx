import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

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

interface Props {
  template: Template;
}

export default function BlankTemplatePdfExport({ template }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;
      let y = 8;

      const branding = template.branding || {};
      const companyName = branding.company_name || "VIVAFIRE";
      const companySubtitle = branding.company_subtitle || "Wet & Dry Riser Specialists";
      const footerText = branding.footer_text || "We have, today, carried out a Hydraulic Pressure Test of 12 Bars\nfor a period of 15 minutes to the requirements of BS 9990:2015";

      // --- HEADER ---
      const logoUrl = branding.logo_url || "/images/vivafire-logo.jpg";
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = logoUrl;
        });
        const logoWidth = 40;
        const logoHeight = (logoImg.naturalHeight / logoImg.naturalWidth) * logoWidth;
        doc.addImage(logoImg, "JPEG", (pageWidth - logoWidth) / 2, y, logoWidth, Math.min(logoHeight, 14));
        y += Math.min(logoHeight, 14) + 2;
      } catch {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, pageWidth / 2, y + 5, { align: "center" });
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(companySubtitle, pageWidth / 2, y + 9, { align: "center" });
        y += 12;
      }

      // --- Title ---
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(template.name.toUpperCase(), pageWidth / 2, y, { align: "center" });
      y += 5;

      // --- Customer/Date blank fields ---
      const detailH = 10;
      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, maxWidth, detailH);
      doc.line(margin + maxWidth * 0.5, y, margin + maxWidth * 0.5, y + detailH);
      doc.line(margin, y + detailH / 2, margin + maxWidth, y + detailH / 2);

      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("Customer/Site:", margin + 1, y + 3);
      doc.text("DATE:", margin + maxWidth * 0.5 + 1, y + 3);
      doc.text("PO/REF:", margin + 1, y + 3 + detailH / 2);
      y += detailH + 2;

      // --- Sections and fields as blank table ---
      const sections = [...new Set(template.fields.map((f) => f.section || "General"))];
      const skipLabels = ["customer /site details", "customer/site details", "date", "po number", "riser location"];
      const colSplit = maxWidth * 0.68;
      const sectionHeaderH = 4.5;

      // Count rows for dynamic sizing
      let totalFieldRows = 0;
      let totalSectionHeaders = 0;
      const footerSpace = 28;
      const availableH = pageHeight - y - footerSpace;

      for (const sec of sections) {
        const sf = template.fields.filter(
          (f) => (f.section || "General") === sec && !skipLabels.some(sl => f.label.toLowerCase().includes(sl))
        );
        if (sf.length === 0) continue;
        totalSectionHeaders++;
        totalFieldRows += sf.length;
      }

      const usedByHeaders = totalSectionHeaders * sectionHeaderH + totalSectionHeaders;
      const spaceForRows = availableH - usedByHeaders;
      const rowH = Math.max(5, Math.min(8, spaceForRows / Math.max(totalFieldRows, 1)));

      for (const section of sections) {
        const sectionFields = template.fields.filter(
          (f) => (f.section || "General") === section && !skipLabels.some(sl => f.label.toLowerCase().includes(sl))
        );
        if (sectionFields.length === 0) continue;

        // Check page overflow
        if (y + sectionHeaderH + sectionFields.length * rowH > pageHeight - footerSpace) {
          doc.addPage();
          y = margin;
        }

        // Section header
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, y, maxWidth, sectionHeaderH, "F");
        doc.setDrawColor(0);
        doc.rect(margin, y, maxWidth, sectionHeaderH);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text(section.toUpperCase(), margin + 1, y + 3.2);
        doc.text("RESULT", margin + colSplit + 1, y + 3.2);
        y += sectionHeaderH;

        // Empty field rows
        doc.setFontSize(6);
        for (const field of sectionFields) {
          doc.setDrawColor(180);
          doc.rect(margin, y, colSplit, rowH);
          doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

          doc.setFont("helvetica", "normal");
          const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
          doc.text(label, margin + 1, y + 3.5);

          // For pass_fail, add P/F/NA checkboxes
          if (field.type === "pass_fail") {
            const bx = margin + colSplit + 2;
            doc.setFontSize(5);
            doc.rect(bx, y + 1, 3, 3);
            doc.text("P", bx + 4, y + 3.5);
            doc.rect(bx + 10, y + 1, 3, 3);
            doc.text("F", bx + 14, y + 3.5);
            doc.rect(bx + 20, y + 1, 3, 3);
            doc.text("N/A", bx + 24, y + 3.5);
            doc.setFontSize(6);
          } else if (field.type === "checkbox") {
            const bx = margin + colSplit + 2;
            doc.setFontSize(5);
            doc.rect(bx, y + 1, 3, 3);
            doc.text("YES", bx + 4, y + 3.5);
            doc.rect(bx + 14, y + 1, 3, 3);
            doc.text("NO", bx + 18, y + 3.5);
            doc.setFontSize(6);
          }
          // Other field types left blank for handwriting

          y += rowH;
        }
        y += 1;
      }

      // --- Comments section ---
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("Comments:", margin, y + 3);
      doc.setDrawColor(180);
      doc.rect(margin, y + 4, maxWidth, 8);
      y += 14;

      // --- Signature blocks ---
      const sigY = Math.max(y + 2, pageHeight - footerSpace);
      const halfW = maxWidth / 2 - 2;

      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text("Date:", margin, sigY + 3);
      doc.line(margin + 10, sigY + 3, margin + halfW, sigY + 3);
      doc.text("Technician:", margin, sigY + 7);
      doc.line(margin + 18, sigY + 7, margin + halfW, sigY + 7);
      doc.text("Signature:", margin, sigY + 11);
      doc.line(margin + 18, sigY + 11, margin + halfW, sigY + 11);

      const cx = margin + halfW + 4;
      doc.text("Date:", cx, sigY + 3);
      doc.line(cx + 10, sigY + 3, cx + halfW, sigY + 3);
      doc.text("Customer:", cx, sigY + 7);
      doc.line(cx + 18, sigY + 7, cx + halfW, sigY + 7);
      doc.text("Signature:", cx, sigY + 11);
      doc.line(cx + 18, sigY + 11, cx + halfW, sigY + 11);

      // --- Footer declaration ---
      const footerY = sigY + 15;
      doc.setDrawColor(0);
      doc.rect(margin, footerY, maxWidth, 9);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      const footerLines = footerText.split("\n");
      footerLines.forEach((line, i) => {
        doc.text(line.trim(), pageWidth / 2, footerY + 3 + i * 3.5, { align: "center" });
      });

      const fileName = `blank-${template.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      doc.save(fileName);
      toast({ title: "Blank template exported", description: `${fileName} downloaded.` });
    } catch (err: any) {
      toast({ title: "Error generating PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={generate} disabled={generating} title="Print blank template">
      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
    </Button>
  );
}
