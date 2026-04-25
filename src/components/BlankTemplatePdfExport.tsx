import { useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eye, Loader2, Printer, PenLine } from "lucide-react";
import PdfPreviewDialog from "@/components/PdfPreviewDialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos, addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";
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
  footer_text?: string | null;
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
    declaration_text?: string;
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
  showPrint?: boolean;
  /** When true, no UI is rendered; only the imperative ref API is exposed. */
  headless?: boolean;
}

/** How many blank sheets to generate based on template name + job quantities */
function getSystemQty(templateName: string, jobInfo: JobInfo | null | undefined): number {
  if (!jobInfo) return 1;
  const n = templateName.toLowerCase();
  // Commissioning certificates: 1 sheet per installed system
  // For installation jobs use other_qty (systems installed) if set, else 1
  if (n.includes("commission")) {
    const cat = jobInfo.category || "";
    if (cat === "dry_riser_installation" || cat === "installation") {
      return Math.max(jobInfo.other_qty || 1, 1);
    }
    return Math.max(jobInfo.pressure_test_qty || 1, 1);
  }
  if (n.includes("pressure test") || n.includes("dry riser") || n.includes("wet riser") || n.includes("sprinkler") || n.includes("hydrant")) {
    return Math.max(jobInfo.pressure_test_qty || 1, 1);
  }
  if (n.includes("visual")) {
    return Math.max(jobInfo.visual_qty || 1, 1);
  }
  return 1;
}

export type BlankTemplatePdfExportHandle = {
  download: (opts?: { handfill?: boolean }) => Promise<void> | void;
  print: (opts?: { handfill?: boolean }) => Promise<void> | void;
  preview: (opts?: { handfill?: boolean }) => Promise<void> | void;
  /** Build the PDF and return the raw Blob without opening any UI.
   *  Useful for embedding a live preview elsewhere (e.g. template editor). */
  getBlob: (opts?: { handfill?: boolean }) => Promise<Blob | null>;
};

const BlankTemplatePdfExport = forwardRef<BlankTemplatePdfExportHandle, Props>(function BlankTemplatePdfExport({ template, jobInfo, showPrint = false, headless = false }, ref) {
  const [generating, setGenerating] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();

  useImperativeHandle(ref, () => ({
    download: (o) => generate("download", o?.handfill ?? false) as Promise<void>,
    print: (o) => generate("print", o?.handfill ?? false) as Promise<void>,
    preview: (o) => generate("preview", o?.handfill ?? false) as Promise<void>,
    getBlob: (o) => generate("blob", o?.handfill ?? false) as Promise<Blob | null>,
  }));

  const generate = async (mode: "download" | "print" | "preview" | "blob" = "preview", handfill = false): Promise<Blob | null | void> => {
    setGenerating(true);
    try {
      const systemQty = getSystemQty(template.name, jobInfo);
      const customerLogoUrl = jobInfo?.customers?.logo_url || null;
      // Dry Riser worksheet: force Viva Fire branding regardless of customer logo
      const isDryRiser = /dry\s*riser/i.test(template.name || "");
      const branding = isDryRiser
        ? { ...(template.branding || {}), logo_url: "/vivafire-logo.png" }
        : { ...(template.branding || {}), ...(customerLogoUrl ? { logo_url: customerLogoUrl } : {}) };
      const footerText = getDefaultFooterText(template.name, branding, template.footer_text);
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

        const sheetTitle = isDryRiser ? "Dry Riser Pressure Test" : template.name;

        let y = await renderPdfHeader(doc, sheetTitle, branding, {
          customerName: isDryRiser ? "" : customerName,
          siteName: isDryRiser ? "" : siteName,
          siteAddress: isDryRiser ? "" : siteAddress,
          refNumber: isDryRiser ? "" : refNumber,
          dateVal,
          riserLocation: isDryRiser ? "" : riserLocValue,
        }, template.standard, accentColor);

        const skipIds = buildSkipIds(template.fields);
        const sections = getSections(template.fields);
        const colSplit = maxWidth * 0.68;
        // Dry Riser blank sheet has no declaration bar, just accreditation logos at the bottom.
        const footerSpace = isDryRiser ? 58 : 58;
        const availableH = pageHeight - y - footerSpace;

        const layout = computeSectionLayout(template.fields, sections, skipIds, availableH, {
          sectionHeaderH: 5,
          maxRowH: 6,
        });

        for (const section of sections) {
          const sectionFields = getSectionFields(template.fields, section, skipIds);
          if (sectionFields.length === 0) continue;

          // Render "Pressure Test Results" as a compact inline row (wraps to new lines if too wide)
          if (section.toLowerCase().includes("pressure test result")) {
            const inlineH = layout.rowH;
            const rightEdge = margin + maxWidth;

            // Pre-calculate rows by wrapping fields that would overflow
            type InlineRow = { field: (typeof sectionFields)[0]; x: number }[];
            const rows: InlineRow[] = [];
            let currentRow: InlineRow = [];
            let ox = margin + 1;

            for (const field of sectionFields) {
              doc.setFontSize(7);
              doc.setFont("helvetica", "bold");
              const labelW = doc.getTextWidth(field.label) + 1;
              let fieldW = labelW;
              if (field.type === "pass_fail") fieldW += 32;
              else if (field.type === "number") fieldW += 14;
              else if (field.type === "select" && field.options) {
                for (const opt of field.options) fieldW += 4 + doc.getTextWidth(opt) + 2;
                fieldW += 4;
              }
              fieldW += 2; // gap

              if (ox + fieldW > rightEdge - 1 && currentRow.length > 0) {
                rows.push(currentRow);
                currentRow = [];
                ox = margin + 1;
              }
              currentRow.push({ field, x: ox });
              ox += fieldW;
            }
            if (currentRow.length > 0) rows.push(currentRow);

            const totalH = rows.length * inlineH;
            if (y + layout.sectionHeaderH + totalH > pageHeight - footerSpace) {
              doc.addPage();
              y = margin;
            }
            y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH, showResultLabel: false, handfill });

            for (const row of rows) {
              if (!handfill) {
                doc.setDrawColor(180);
                doc.rect(margin, y, maxWidth, inlineH);
              }
              doc.setFontSize(7);
              for (const { field, x: startX } of row) {
                let ox2 = startX;
                doc.setFont("helvetica", "bold");
                doc.text(field.label, ox2, y + 3.5);
                ox2 += doc.getTextWidth(field.label) + 1;
                doc.setFont("helvetica", "normal");
                if (field.type === "pass_fail") {
                  doc.rect(ox2, y + 1, 3, 3); doc.text("P", ox2 + 4, y + 3.5);
                  doc.rect(ox2 + 10, y + 1, 3, 3); doc.text("F", ox2 + 14, y + 3.5);
                  doc.rect(ox2 + 20, y + 1, 3, 3); doc.text("N/A", ox2 + 24, y + 3.5);
                } else if (field.type === "number") {
                  doc.line(ox2, y + 3.5, ox2 + 10, y + 3.5);
                } else if (field.type === "select" && field.options) {
                  for (const opt of field.options) {
                    const optLabel = opt.length > 8 ? opt.slice(0, 7) + "…" : opt;
                    doc.rect(ox2, y + 1, 3, 3);
                    doc.text(optLabel, ox2 + 4, y + 3.5);
                    ox2 += 4 + doc.getTextWidth(optLabel) + 2;
                  }
                }
              }
              y += inlineH;
            }
            y += 1;
            continue;
          }

          // Page overflow check
          const sectionRowUnits = sectionFields.reduce((sum, field) => sum + (field.type === "signature" ? 2 : 1), 0);
          if (y + layout.sectionHeaderH + sectionRowUnits * layout.rowH > pageHeight - footerSpace) {
            doc.addPage();
            y = margin;
          }

          y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH, handfill });

          for (const field of sectionFields) {
            // Allow scope_of_work and drain/drop leg fields to be pre-filled on standard
            // templates, but keep them blank on the Dry Riser worksheet.
            const isScopeField = field.id === "scope_of_work" || field.label.toLowerCase().replace(/[:\s]+$/g, "").trim().includes("scope of work");
            const isDrainField = field.label.toLowerCase().includes("drain") || field.label.toLowerCase().includes("drop leg");
            const allowAuto = !isDryRiser && (isScopeField || isDrainField);
            const autoVal = (field.options && field.options.length > 0 && !allowAuto) ? undefined : (isDryRiser ? undefined : autoVals[field.id]);
            y = renderBlankFieldRow(doc, field, autoVal, y, {
              margin, maxWidth, colSplit, rowH: layout.rowH, handfill,
            });
          }
          y += 1;
        }

        // Comments box — shrinks to fit remaining space rather than spilling
        // to a new page. Only spills if there is literally no room left.
        const sigY = pageHeight - footerSpace - 10;
        const commentsBoxBottom = sigY - 4;
        const minCommentsH = 6;
        if (y + 4 + minCommentsH > commentsBoxBottom) {
          doc.addPage();
          y = margin;
        }
        const commentsBoxTop = y + 4;
        const maxCommentsH = isDryRiser ? 65 : 35;
        const commentsAvailH = commentsBoxBottom - commentsBoxTop;
        const commentsRectH = Math.max(Math.min(commentsAvailH, maxCommentsH), minCommentsH);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text("Comments:", margin, y + 3);
        if (!handfill) {
          doc.setDrawColor(180);
          doc.rect(margin, commentsBoxTop, maxWidth, commentsRectH);
        }

        renderPdfSignatures(doc, sigY, {
          dateStr: "",
          technicianName: engineerList,
          customerName: "",
        }, { blank: true });

        if (!isDryRiser) {
          const footerH = 9;
          const footerY = pageHeight - margin - footerH;
          renderPdfFooter(doc, footerY, footerText);
        } else {
          // Dry Riser: declaration band sits just above the accreditation logos.
          // Wording is editable per template via branding.declaration_text.
          const declarationText =
            (template.branding?.declaration_text || "").trim() ||
            "Tested and inspected in accordance with BS 9990:2015";
          const declH = 10;
          const declY = pageHeight - margin - 9 - 4 - declH;
          doc.setDrawColor(60);
          doc.setLineWidth(0.5);
          doc.rect(margin, declY, maxWidth, declH);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(33, 37, 41);
          // Wrap if user enters longer text
          const lines = doc.splitTextToSize(declarationText, maxWidth - 6) as string[];
          const lineH = 4;
          const totalH = lines.length * lineH;
          let ty = declY + (declH - totalH) / 2 + lineH - 1;
          lines.forEach((ln) => {
            doc.text(ln, pageWidth / 2, ty, { align: "center" });
            ty += lineH;
          });
        }
      }

      const logoH = 12; // bigger logos
      const custAccredUrls = await fetchCustomerAccreditationLogos(customerName);
      const [watermark, accredLogos] = await Promise.all([
        loadWatermarkImage(),
        loadAccreditationLogos(custAccredUrls),
      ]);
      if (watermark) addWatermarkToAllPages(doc, watermark, accentColor);
      const footerYForLogos = pageHeight - margin - 9;
      addAccreditationLogosToAllPages(doc, accredLogos, footerYForLogos, logoH);

      const fileName = [
        jobInfo?.reference_number || "blank",
        template.name.replace(/\s+/g, "-").toLowerCase(),
        customerName.replace(/\s+/g, "-").toLowerCase() || null,
        systemQty > 1 ? `x${systemQty}` : null,
        handfill ? "handfill" : null,
      ].filter(Boolean).join("-") + ".pdf";

      if (mode === "print") {
        const pdfBlob = doc.output("blob");
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast({ title: "Blank sheet opened", description: "Print from the new tab." });
      } else if (mode === "preview") {
        const pdfBlob = doc.output("blob");
        setPreviewBlob(pdfBlob);
        setPreviewName(fileName);
        setPreviewOpen(true);
      } else if (mode === "blob") {
        // Silent build — caller uses the returned Blob directly (e.g. live preview embed).
        return doc.output("blob") as Blob;
      } else {
        doc.save(fileName);
        toast({ title: "PDF downloaded", description: fileName });
      }
    } catch (err: any) {
      // For silent blob builds, re-throw so the caller can handle it.
      if (mode === "blob") {
        setGenerating(false);
        throw err;
      }
      toast({ title: "Error generating PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (headless) return null;

  return (
    <>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generate("preview")} disabled={generating} title="Preview blank template" aria-label={`Preview ${template.name}`}>
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generate("download")} disabled={generating} title="Download blank template PDF" aria-label={`Download ${template.name} as PDF`}>
          <Download className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generate("preview", true)} disabled={generating} title="Preview printable handfill version (exactly what prints)" aria-label={`Preview ${template.name} printable handfill version`}>
          <span className="relative inline-flex">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            <PenLine className="h-2 w-2 absolute -bottom-0.5 -right-0.5" aria-hidden />
          </span>
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generate("download", true)} disabled={generating} title="Download printable handfill PDF" aria-label={`Download ${template.name} as printable handfill PDF`}>
          <PenLine className="h-3.5 w-3.5" aria-hidden />
        </Button>
        {showPrint && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generate("print")} disabled={generating} title="Print blank template" aria-label={`Print ${template.name}`}>
            <Printer className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        blob={previewBlob}
        fileName={previewName}
        title={template.name}
      />
    </>
  );
});

export default BlankTemplatePdfExport;
