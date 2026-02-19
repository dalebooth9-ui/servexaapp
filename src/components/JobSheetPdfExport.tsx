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
};

type JobInfo = {
  address: string | null;
  customer: string | null;
  reference_number: string;
  site?: { name: string; address: string | null } | null;
};

interface Props {
  template: Template;
  formData: Record<string, any>;
  jobInfo: JobInfo | null;
  submittedBy?: string;
  submittedAt?: string | null;
}

export default function JobSheetPdfExport({ template, formData, jobInfo, submittedBy, submittedAt }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      let y = 15;

      const checkPage = (needed: number) => {
        if (y + needed > 275) {
          doc.addPage();
          y = 15;
        }
      };

      // --- HEADER: Logo ---
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = "/images/vivafire-logo.jpg";
        });
        const logoWidth = 55;
        const logoHeight = (logoImg.naturalHeight / logoImg.naturalWidth) * logoWidth;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(logoImg, "JPEG", logoX, y, logoWidth, logoHeight);
        y += logoHeight + 4;
      } catch {
        // Fallback text header
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("VIVAFIRE", pageWidth / 2, y + 8, { align: "center" });
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("Wet & Dry Riser Specialists", pageWidth / 2, y + 13, { align: "center" });
        y += 18;
      }

      // --- Title ---
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(template.name.toUpperCase(), pageWidth / 2, y, { align: "center" });
      y += 8;

      // --- Customer/Site Details box ---
      const customerName = jobInfo?.customer || "";
      const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
      const siteName = jobInfo?.site?.name || "";
      const refNumber = jobInfo?.reference_number || "";
      const dateVal = formData["date"] || formData["inspection_date"] || new Date().toLocaleDateString("en-GB");

      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.rect(margin, y, maxWidth, 22);
      doc.line(margin + maxWidth / 2, y, margin + maxWidth / 2, y + 22);
      doc.line(margin, y + 11, margin + maxWidth, y + 11);

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Customer/Site Details:", margin + 2, y + 4);
      doc.setFont("helvetica", "normal");
      doc.text([customerName, siteName, siteAddress].filter(Boolean).join(", "), margin + 2, y + 8);

      doc.setFont("helvetica", "bold");
      doc.text("DATE:", margin + maxWidth / 2 + 2, y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(String(dateVal), margin + maxWidth / 2 + 18, y + 4);

      doc.setFont("helvetica", "bold");
      doc.text("PO NUMBER:", margin + maxWidth / 2 + 2, y + 15);
      doc.setFont("helvetica", "normal");
      doc.text(refNumber, margin + maxWidth / 2 + 30, y + 15);

      y += 26;

      // --- Sections and fields as table ---
      const sections = [...new Set(template.fields.map((f) => f.section || "General"))];

      for (const section of sections) {
        const sectionFields = template.fields.filter((f) => (f.section || "General") === section);

        checkPage(12 + sectionFields.length * 8);

        // Section header
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, y, maxWidth, 7, "F");
        doc.setDrawColor(0);
        doc.rect(margin, y, maxWidth, 7);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(section.toUpperCase(), margin + 2, y + 5);

        // "PASS" header on right
        const colSplit = maxWidth * 0.7;
        doc.text("RESULT", margin + colSplit + 2, y + 5);
        y += 7;

        // Field rows
        doc.setFontSize(8);
        for (const field of sectionFields) {
          checkPage(10);
          const rowH = 7;

          doc.setDrawColor(180);
          doc.rect(margin, y, colSplit, rowH);
          doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

          // Label
          doc.setFont("helvetica", "normal");
          const labelLines = doc.splitTextToSize(field.label, colSplit - 4);
          const actualH = Math.max(rowH, labelLines.length * 4 + 3);
          if (actualH > rowH) {
            // Redraw taller
            doc.setFillColor(255, 255, 255);
            doc.rect(margin, y, colSplit, actualH, "FD");
            doc.rect(margin + colSplit, y, maxWidth - colSplit, actualH, "FD");
          }
          labelLines.forEach((line: string, i: number) => {
            doc.text(line, margin + 2, y + 4 + i * 4);
          });

          // Value
          const val = formData[field.id];
          let displayVal = "";
          if (field.type === "pass_fail") {
            displayVal = val === "pass" ? "PASS" : val === "fail" ? "FAIL" : val === "n/a" ? "N/A" : "—";
            if (val === "pass") {
              doc.setTextColor(0, 128, 0);
              doc.setFont("helvetica", "bold");
            } else if (val === "fail") {
              doc.setTextColor(200, 0, 0);
              doc.setFont("helvetica", "bold");
            }
          } else if (field.type === "checkbox") {
            displayVal = val ? "YES" : "NO";
          } else {
            displayVal = val ? String(val) : "—";
          }

          doc.text(displayVal, margin + colSplit + 2, y + 4);
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "normal");

          // Notes
          const noteVal = formData[`${field.id}_notes`];
          if (field.allow_notes && noteVal) {
            y += actualH;
            checkPage(6);
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(100, 100, 100);
            doc.text(`Note: ${noteVal}`, margin + 4, y + 3);
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            y += 5;
          } else {
            y += actualH;
          }
        }
        y += 4;
      }

      // --- Comments section ---
      checkPage(20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Comments:", margin, y + 5);
      doc.setDrawColor(0);
      doc.rect(margin, y + 7, maxWidth, 15);
      y += 26;

      // --- Materials Required ---
      checkPage(15);
      doc.setFont("helvetica", "bold");
      doc.text("MATERIALS REQUIRED:", margin, y + 5);
      doc.rect(margin, y + 7, maxWidth, 12);
      y += 23;

      // --- Signature blocks ---
      checkPage(35);
      const halfW = maxWidth / 2 - 2;
      const sigY = y;

      // Technician
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Date:", margin, sigY + 5);
      doc.setFont("helvetica", "normal");
      doc.text(submittedAt ? new Date(submittedAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"), margin + 12, sigY + 5);
      doc.setFont("helvetica", "bold");
      doc.text("Technician Name:", margin, sigY + 12);
      doc.setFont("helvetica", "normal");
      doc.text(submittedBy || "", margin + 35, sigY + 12);
      doc.text("Signature:", margin, sigY + 19);
      doc.line(margin + 20, sigY + 19, margin + halfW, sigY + 19);

      // Customer
      const cx = margin + halfW + 4;
      doc.setFont("helvetica", "bold");
      doc.text("Date:", cx, sigY + 5);
      doc.setFont("helvetica", "normal");
      doc.text(submittedAt ? new Date(submittedAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"), cx + 12, sigY + 5);
      doc.setFont("helvetica", "bold");
      doc.text("Customer Name:", cx, sigY + 12);
      doc.setFont("helvetica", "normal");
      doc.text(jobInfo?.customer || "", cx + 32, sigY + 12);
      doc.text("Signature:", cx, sigY + 19);
      doc.line(cx + 20, sigY + 19, cx + halfW, sigY + 19);

      y = sigY + 28;

      // --- Footer declaration ---
      checkPage(15);
      doc.setDrawColor(0);
      doc.rect(margin, y, maxWidth, 12);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(
        "We have, today, carried out a Hydraulic Pressure Test of 12 Bars",
        pageWidth / 2,
        y + 4,
        { align: "center" }
      );
      doc.text(
        "for a period of 15 minutes to the requirements of BS 9990:2015",
        pageWidth / 2,
        y + 9,
        { align: "center" }
      );

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
