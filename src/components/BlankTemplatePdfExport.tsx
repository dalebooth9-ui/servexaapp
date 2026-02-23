import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { renderPdfHeader } from "@/lib/pdfHeader";
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";

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
  category?: string | null;
  name?: string | null;
  priority?: string | null;
  visual_qty?: number;
  pressure_test_qty?: number;
  engineers?: string[];
  site?: {
    name: string;
    address: string | null;
    postcode: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  } | null;
};

interface Props {
  template: Template;
  jobInfo?: JobInfo | null;
}

/**
 * Auto-populate field values for the printable PDF, mirroring the online sheet logic.
 */
function getAutoPopulatedValues(
  template: Template,
  jobInfo: JobInfo | null | undefined
): Record<string, string> {
  const vals: Record<string, string> = {};
  if (!jobInfo) return vals;

  const customerName = jobInfo.customers?.name || jobInfo.customer || "";
  const siteName = jobInfo.site?.name || "";
  const siteAddress = jobInfo.site?.address || jobInfo.address || "";
  const sitePostcode = jobInfo.site?.postcode || "";
  const engineerList = (jobInfo.engineers || []).join(", ");
  const refNumber = jobInfo.reference_number || "";
  const dateVal = new Date().toLocaleDateString("en-GB");

  template.fields.forEach((f) => {
    const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();

    // Site details composite
    if ((label.includes("site") && label.includes("detail")) || (label.includes("site") && label.includes("info"))) {
      vals[f.id] = [siteName, siteAddress, sitePostcode].filter(Boolean).join(", ");
    } else if (label === "site name" || label === "site") {
      vals[f.id] = siteName;
    } else if (label === "site address" || label === "address") {
      vals[f.id] = [siteAddress, sitePostcode].filter(Boolean).join(", ");
    } else if (label.includes("postcode") || label.includes("post code")) {
      vals[f.id] = sitePostcode;
    // Customer details
    } else if ((label.includes("customer") && label.includes("detail")) || (label.includes("client") && label.includes("detail"))) {
      vals[f.id] = customerName;
    } else if (label === "customer name" || label === "client name" || label === "customer" || label === "client") {
      vals[f.id] = customerName;
    } else if (label.includes("customer") && !label.includes("sign") && !label.includes("email") && !label.includes("phone")) {
      vals[f.id] = customerName;
    // Reference / PO
    } else if (label.includes("po number") || label.includes("reference") || label.includes("ref no") || label.includes("job ref") || label.includes("order number")) {
      vals[f.id] = refNumber;
    // Date
    } else if (label === "date" || label === "inspection date" || label === "service date" || label === "visit date") {
      vals[f.id] = dateVal;
    // Scope of work — auto-set from template name
    } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category")) {
      const tplName = template.name.toLowerCase();
      if (tplName.includes("pressure test") || tplName.includes("pressure-test")) {
        vals[f.id] = "Pressure Test";
      } else if (tplName.includes("visual")) {
        vals[f.id] = "Visual";
      } else {
        vals[f.id] = jobInfo.category || "";
      }
    // Engineer / technician
    } else if (label.includes("engineer") || label.includes("technician") || label.includes("operative") || label.includes("carried out by") || label.includes("completed by") || label.includes("attended by")) {
      vals[f.id] = engineerList;
    // Job name
    } else if (label === "job name" || label === "job title" || label === "job description") {
      vals[f.id] = jobInfo.name || "";
    // Riser location — leave blank for manual entry
    } else if (label.includes("riser location") || (label.includes("rise") && label.includes("location"))) {
      // Do not auto-fill — riser location is specific and should be entered manually
    // Number of outlets
    } else if (label.includes("no of outlets") || label.includes("number of outlets")) {
      // Leave blank for manual entry
    }
  });

  return vals;
}

export default function BlankTemplatePdfExport({ template, jobInfo }: Props) {
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

      const branding = template.branding || {};
      const footerText = getDefaultFooterText(template.name, branding);

      // Auto-populated values (mirrors online sheet logic)
      const autoVals = getAutoPopulatedValues(template, jobInfo);

      const customerName = jobInfo?.customers?.name || jobInfo?.customer || "";
      const siteName = jobInfo?.site?.name || "";
      const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
      const refNumber = jobInfo?.reference_number || "";
      const dateVal = new Date().toLocaleDateString("en-GB");
      const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
      const riserLocValue = riserField ? (autoVals[riserField.id] || "") : "";

      let y = await renderPdfHeader(doc, template.name, branding, {
        customerName,
        siteName,
        siteAddress,
        refNumber,
        dateVal,
        riserLocation: riserLocValue,
      });

      // --- Sections and fields as blank table ---
      const sections = [...new Set(template.fields.map((f) => f.section || "General"))];
      // These fields are already shown in the header boxes above
      const skipIds = new Set<string>();
      template.fields.forEach((f) => {
        const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
        if (
          (label.includes("customer") && (label.includes("detail") || label === "customer" || label === "customer name" || label === "client")) ||
          label === "date" || label === "inspection date" || label === "service date" || label === "visit date" ||
          label.includes("po number") || label.includes("reference") || label.includes("ref no") || label.includes("job ref") || label.includes("order number") ||
          (label.includes("site") && (label.includes("detail") || label.includes("info"))) ||
          label === "site name" || label === "site" || label === "site address" || label === "address" ||
          label.includes("postcode") || label.includes("post code") ||
          label.includes("riser location") ||
          label.includes("technician name") || label.includes("engineer") ||
          label === "comments" || label.includes("comment") ||
          label.includes("material")
        ) {
          skipIds.add(f.id);
        }
      });

      const colSplit = maxWidth * 0.68;
      const sectionHeaderH = 5;

      // Count rows for dynamic sizing
      let totalFieldRows = 0;
      let totalSectionHeaders = 0;
      const footerSpace = 28;
      const availableH = pageHeight - y - footerSpace;

      for (const sec of sections) {
        const sf = template.fields.filter(
          (f) => (f.section || "General") === sec && !skipIds.has(f.id)
        );
        if (sf.length === 0) continue;
        totalSectionHeaders++;
        totalFieldRows += sf.length;
      }

      const usedByHeaders = totalSectionHeaders * sectionHeaderH + totalSectionHeaders;
      const spaceForRows = availableH - usedByHeaders;
      const rowH = Math.max(4, Math.min(6, spaceForRows / Math.max(totalFieldRows, 1)));

      for (const section of sections) {
        const sectionFields = template.fields.filter(
          (f) => (f.section || "General") === section && !skipIds.has(f.id)
        );
        if (sectionFields.length === 0) continue;

        // Render "Pressure Test Results" section as a single compact row
        if (section.toLowerCase().includes("pressure test result")) {
          const inlineH = rowH;
          if (y + sectionHeaderH + inlineH > pageHeight - footerSpace) {
            doc.addPage();
            y = margin;
          }
          // Section header
          doc.setFillColor(230, 230, 230);
          doc.rect(margin, y, maxWidth, sectionHeaderH, "F");
          doc.setDrawColor(0);
          doc.rect(margin, y, maxWidth, sectionHeaderH);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text(section.toUpperCase(), margin + 1, y + 4.5);
          y += sectionHeaderH;

          // Draw single row with all fields inline
          doc.setDrawColor(180);
          doc.rect(margin, y, maxWidth, inlineH);
          doc.setFontSize(7);
          let ox = margin + 1;
          for (const field of sectionFields) {
            doc.setFont("helvetica", "bold");
            doc.text(field.label, ox, y + 3.5);
            ox += doc.getTextWidth(field.label) + 1;

            if (field.type === "pass_fail") {
              doc.setFont("helvetica", "normal");
              doc.rect(ox, y + 1, 3, 3); doc.text("P", ox + 4, y + 3.5);
              doc.rect(ox + 10, y + 1, 3, 3); doc.text("F", ox + 14, y + 3.5);
              doc.rect(ox + 20, y + 1, 3, 3); doc.text("N/A", ox + 24, y + 3.5);
              ox += 32;
            } else if (field.type === "number") {
              doc.line(ox, y + 3.5, ox + 10, y + 3.5);
              ox += 12;
            } else if (field.type === "select" && field.options) {
              doc.setFont("helvetica", "normal");
              for (const opt of field.options) {
                doc.rect(ox, y + 1, 3, 3);
                doc.text(opt, ox + 4, y + 3.5);
                ox += 4 + doc.getTextWidth(opt) + 2;
              }
              ox += 2;
            }
            ox += 2;
          }
          y += inlineH + 1;
          continue;
        }

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
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(section.toUpperCase(), margin + 1, y + 4.5);
        doc.text("RESULT", margin + colSplit + 1, y + 4.5);
        y += sectionHeaderH;

        // Field rows with auto-fill
        doc.setFontSize(8.5);
        for (const field of sectionFields) {
          doc.setDrawColor(180);
          doc.rect(margin, y, colSplit, rowH);
          doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

          doc.setFont("helvetica", "normal");
          const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
          doc.text(label, margin + 1, y + 3.5);

          // Auto-fill value in the result column
          const autoVal = autoVals[field.id];

          if (field.type === "pass_fail") {
            const bx = margin + colSplit + 2;
            doc.setFontSize(7.5);
            doc.rect(bx, y + 1, 3, 3);
            doc.text("P", bx + 4, y + 3.5);
            doc.rect(bx + 10, y + 1, 3, 3);
            doc.text("F", bx + 14, y + 3.5);
            doc.rect(bx + 20, y + 1, 3, 3);
            doc.text("N/A", bx + 24, y + 3.5);
            doc.setFontSize(8.5);
          } else if (field.type === "checkbox") {
            const bx = margin + colSplit + 2;
            doc.setFontSize(6);
            doc.rect(bx, y + 1, 3, 3);
            doc.text("YES", bx + 4, y + 3.5);
            doc.rect(bx + 14, y + 1, 3, 3);
            doc.text("NO", bx + 18, y + 3.5);
            doc.setFontSize(8.5);
          } else if (field.type === "select" && field.options && field.options.some(o => o.toLowerCase() === "yes") && field.options.some(o => o.toLowerCase() === "no")) {
            const bx = margin + colSplit + 2;
            doc.setFontSize(6);
            let ox = bx;
            for (const opt of field.options) {
              doc.rect(ox, y + 1, 3, 3);
              doc.text(opt.toUpperCase(), ox + 4, y + 3.5);
              ox += 4 + doc.getTextWidth(opt.toUpperCase()) + 3;
            }
            doc.setFontSize(8.5);
          } else if (autoVal) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            const truncVal = doc.splitTextToSize(autoVal, maxWidth - colSplit - 4).slice(0, 1).join("");
            doc.text(truncVal, margin + colSplit + 2, y + 3.5);
            doc.setFontSize(8.5);
          }

          y += rowH;
        }
        y += 1;
      }

      // --- Signature & footer ---
      const sigY = pageHeight - footerSpace - 10;

      // --- Comments section (fills space between fields and signature) ---
      const commentsH = Math.max(sigY - y - 2, 6);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("Comments:", margin, y + 3);
      doc.setDrawColor(180);
      doc.rect(margin, y + 4, maxWidth, commentsH - 4);

      const engineerList = (jobInfo?.engineers || []).join(", ");

      const afterSig = renderPdfSignatures(doc, sigY, {
        dateStr: "",
        technicianName: engineerList,
        customerName: "",
      }, { blank: true });

      // --- Footer declaration pinned to bottom of page ---
      const footerH = 9;
      const footerY = pageHeight - margin - footerH;
      renderPdfFooter(doc, footerY, footerText);

      // Watermark on every page
      const watermark = await loadWatermarkImage();
      if (watermark) addWatermarkToAllPages(doc, watermark);

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
