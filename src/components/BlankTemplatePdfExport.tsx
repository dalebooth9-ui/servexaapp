import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
    // Riser location
    } else if (label.includes("riser location") || label.includes("location")) {
      vals[f.id] = [siteAddress, sitePostcode].filter(Boolean).join(", ");
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
      let y = 8;

      const branding = template.branding || {};
      const companyName = branding.company_name || "VIVAFIRE";
      const companySubtitle = branding.company_subtitle || "Wet & Dry Riser Specialists";
      const isVisual = template.name.toLowerCase().includes("visual") || (template as any).category === "visual";
      const defaultFooter = isVisual
        ? "We have, today, carried out a visual check of the system\nto the requirements of BS 9990:2015"
        : "We have, today, carried out a Hydraulic Pressure Test to 12 Bar\nfor a period of 15 minutes to the requirements of BS 9990:2015";
      const footerText = branding.footer_text || defaultFooter;

      // Auto-populated values (mirrors online sheet logic)
      const autoVals = getAutoPopulatedValues(template, jobInfo);

      // --- HEADER: Logo centred, title below ---
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

      // --- Customer & Site detail boxes (separate) ---
      const customerName = jobInfo?.customers?.name || jobInfo?.customer || "";
      const siteName = jobInfo?.site?.name || "";
      const siteAddress = jobInfo?.site?.address || jobInfo?.address || "";
      const sitePostcode = jobInfo?.site?.postcode || "";
      const refNumber = jobInfo?.reference_number || "";
      const dateVal = new Date().toLocaleDateString("en-GB");

      const detailRowH = 6;
      doc.setDrawColor(0);
      doc.setLineWidth(0.2);

      // Row 1: Customer | Date
      doc.rect(margin, y, maxWidth, detailRowH);
      doc.line(margin + maxWidth * 0.5, y, margin + maxWidth * 0.5, y + detailRowH);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Customer:", margin + 1, y + 4);
      doc.setFont("helvetica", "normal");
      if (customerName) doc.text(customerName, margin + 20, y + 4);
      doc.setFont("helvetica", "bold");
      doc.text("DATE:", margin + maxWidth * 0.5 + 1, y + 4);
      doc.setFont("helvetica", "normal");
      if (dateVal) doc.text(dateVal, margin + maxWidth * 0.5 + 14, y + 4);
      y += detailRowH;

      // Row 2: Site | PO/REF
      doc.rect(margin, y, maxWidth, detailRowH);
      doc.line(margin + maxWidth * 0.5, y, margin + maxWidth * 0.5, y + detailRowH);
      doc.setFont("helvetica", "bold");
      doc.text("Site:", margin + 1, y + 4);
      doc.setFont("helvetica", "normal");
      const siteStr = [siteName, siteAddress, sitePostcode].filter(Boolean).join(", ");
      if (siteStr) {
        const truncSite = doc.splitTextToSize(siteStr, maxWidth * 0.48 - 12).slice(0, 1).join("");
        doc.text(truncSite, margin + 12, y + 4);
      }
      doc.setFont("helvetica", "bold");
      doc.text("PO/REF:", margin + maxWidth * 0.5 + 1, y + 4);
      doc.setFont("helvetica", "normal");
      if (refNumber) doc.text(refNumber, margin + maxWidth * 0.5 + 16, y + 4);
      y += detailRowH + 2;

      // --- Sections and fields as blank table ---
      const sections = [...new Set(template.fields.map((f) => f.section || "General"))];
      // These fields are already shown in the header boxes above
      const skipIds = new Set<string>();
      template.fields.forEach((f) => {
        const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
        if (
          label.includes("customer") && (label.includes("detail") || label === "customer" || label === "customer name") ||
          label === "date" ||
          label.includes("po number")
        ) {
          skipIds.add(f.id);
        }
      });

      const colSplit = maxWidth * 0.68;
      const sectionHeaderH = 6;

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
      const rowH = Math.max(5, Math.min(8, spaceForRows / Math.max(totalFieldRows, 1)));

      for (const section of sections) {
        const sectionFields = template.fields.filter(
          (f) => (f.section || "General") === section && !skipIds.has(f.id)
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
            // Render Yes/No/N/A tick boxes for select fields with those options
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
            // Print auto-populated value in the result cell
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

      // --- Comments section ---
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("Comments:", margin, y + 3);
      doc.setDrawColor(180);
      doc.rect(margin, y + 4, maxWidth, 8);
      y += 14;

      // --- Signature blocks ---
      const sigY = Math.max(y + 2, pageHeight - footerSpace);
      const halfW = maxWidth / 2 - 2;

      doc.setFontSize(8.5);
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
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      const footerLines = footerText.split("\n");
      footerLines.forEach((line, i) => {
        doc.text(line.trim(), pageWidth / 2, footerY + 3 + i * 3.5, { align: "center" });
      });

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
