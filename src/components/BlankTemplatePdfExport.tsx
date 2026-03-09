import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  renderBlankFieldRow,
  getAutoPopulatedValues,
} from "@/lib/pdfBody";
import { useJobCategories } from "@/hooks/useJobCategories";

type Template = {
  id: string;
  name: string;
  description: string | null;
  standard?: string | null;
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
  name?: string | null;
  priority?: string | null;
  visual_qty?: number;
  pressure_test_qty?: number;
  engineers?: string[];
  other_qty?: number;
  other_service_type?: string | null;
  site?: {
    name: string;
    address: string | null;
    postcode: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    riser_location?: string | null;
  } | null;
};

interface Props {
  template: Template;
  jobInfo?: JobInfo | null;
}

/** How many blank sheets to generate based on template name + job quantities */
function getSystemQty(templateName: string, jobInfo: JobInfo | null | undefined): number {
  if (!jobInfo) return 1;
  const n = templateName.toLowerCase();
  if (
    n.includes("pressure test") || n.includes("dry riser") ||
    n.includes("wet riser") || n.includes("sprinkler") || n.includes("hydrant")
  ) {
    return Math.max(jobInfo.pressure_test_qty || 1, 1);
  }
  if (n.includes("visual")) {
    return Math.max(jobInfo.visual_qty || 1, 1);
  }
  return 1;
}

export default function BlankTemplatePdfExport({ template, jobInfo }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();

  const generate = async () => {
    setGenerating(true);
    try {
      const systemQty = getSystemQty(template.name, jobInfo);
      // Customer logo always takes priority over the template's stored branding logo
      const customerLogoUrl: string | null = jobInfo?.customers?.logo_url || null;
      const branding = { ...(template.branding || {}), logo_url: customerLogoUrl || template.branding?.logo_url || undefined };
      const footerText = getDefaultFooterText(template.name, branding);
      const categoryName = jobCategories.find(c => c.slug === jobInfo?.category)?.name
        || (jobInfo?.category ? jobInfo.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "");
      const autoVals = getAutoPopulatedValues(template.name, template.fields, jobInfo ? { ...jobInfo, categoryName } : jobInfo);

      const customerName = jobInfo?.customers?.name || jobInfo?.customer || "";
      const siteName = jobInfo?.site?.name || "";
      const siteAddress = [
        jobInfo?.site?.address || jobInfo?.address || "",
        jobInfo?.site?.postcode || "",
      ].filter(Boolean).join(", ");
      const refNumber = jobInfo?.reference_number || "";
      const dateVal = ""; // blank — no auto-filled date on blank templates
      const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
      const riserLocValue = jobInfo?.site?.riser_location || (riserField ? (autoVals[riserField.id] || "") : "");
      const engineerList = (jobInfo?.engineers || []).join(", ");

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

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;

      for (let sysIdx = 0; sysIdx < systemQty; sysIdx++) {
        // Add a new page for every sheet after the first
        if (sysIdx > 0) doc.addPage();

        const sheetTitle = template.name;

        let y = await renderPdfHeader(doc, sheetTitle, branding, {
          customerName,
          siteName,
          siteAddress,
          refNumber,
          dateVal,
          riserLocation: riserLocValue,
        }, template.standard, accentColor);

        const skipIds = buildSkipIds(template.fields);
        const sections = getSections(template.fields);
        const colSplit = maxWidth * 0.68;
        const footerSpace = 44; // footer(9) + logos(12+3) + sigs(15) + buffer
        const availableH = pageHeight - y - footerSpace;

        const layout = computeSectionLayout(template.fields, sections, skipIds, availableH, {
          sectionHeaderH: 5,
          maxRowH: 6,
        });

        for (const section of sections) {
          const sectionFields = getSectionFields(template.fields, section, skipIds);
          if (sectionFields.length === 0) continue;

          // Render "Pressure Test Results" as a single compact inline row
          if (section.toLowerCase().includes("pressure test result")) {
            const inlineH = layout.rowH;
            if (y + layout.sectionHeaderH + inlineH > pageHeight - footerSpace) {
              doc.addPage();
              y = margin;
            }
            y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH, showResultLabel: false });
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

          // Page overflow check
          if (y + layout.sectionHeaderH + sectionFields.length * layout.rowH > pageHeight - footerSpace) {
            doc.addPage();
            y = margin;
          }

          y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH });

          for (const field of sectionFields) {
            // Allow scope_of_work to be pre-filled; leave other select fields blank for manual completion
            const isScopeField = field.id === "scope_of_work" || field.label.toLowerCase().replace(/[:\s]+$/g, "").trim().includes("scope of work");
            const autoVal = (field.options && field.options.length > 0 && !isScopeField) ? undefined : autoVals[field.id];
            y = renderBlankFieldRow(doc, field, autoVal, y, {
              margin, maxWidth, colSplit, rowH: layout.rowH,
            });
          }
          y += 1;
        }

        // Comments box — bottom sits 10mm above the date/signature line
        const sigY = pageHeight - footerSpace - 10;
        const commentsBoxBottom = sigY - 10;
        const commentsBoxTop = y + 4;
        const commentsRectH = Math.max(commentsBoxBottom - commentsBoxTop, 4);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text("Comments:", margin, y + 3);
        doc.setDrawColor(180);
        doc.rect(margin, commentsBoxTop, maxWidth, commentsRectH);

        renderPdfSignatures(doc, sigY, {
          dateStr: "",
          technicianName: engineerList,
          customerName: "",
        }, { blank: true });

        const footerH = 9;
        const footerY = pageHeight - margin - footerH;
        renderPdfFooter(doc, footerY, footerText);
      }

      const logoH = 12; // bigger logos
      const [watermark, accredLogos] = await Promise.all([
        loadWatermarkImage(),
        loadAccreditationLogos(),
      ]);
      if (watermark) addWatermarkToAllPages(doc, watermark, accentColor);
      const footerYForLogos = pageHeight - margin - 9;
      addAccreditationLogosToAllPages(doc, accredLogos, footerYForLogos, logoH);

      const fileName = `blank-${template.name.replace(/\s+/g, "-").toLowerCase()}${systemQty > 1 ? `-x${systemQty}` : ""}.pdf`;
      doc.save(fileName);
      toast({
        title: "PDF downloaded",
        description: fileName,
      });
    } catch (err: any) {
      toast({ title: "Error generating PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={generate} disabled={generating} title="Download blank template">
      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </Button>
  );
}
