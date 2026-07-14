import jsPDF from "jspdf";
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
import { renderPdfSignatures, renderPdfFooter, getDefaultFooterText } from "@/lib/pdfFooter";
import { DRY_RISER_LAYOUT } from "@/lib/dryRiserLayout";
import { resolveTemplateDisplayTitle } from "@/lib/templateDisplayTitle";

type RgbTriple = [number, number, number];
type WatermarkMode = "tinted" | "untinted" | "none";

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
  due_date?: string | null;
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

type WorkerPayload = {
  template: Template;
  jobInfo?: JobInfo | null;
  handfill: boolean;
  watermarkOverride: Partial<{ mode: WatermarkMode; opacity: number; accreditationOpacity: number }> | null;
  watermarkSettings: { mode: WatermarkMode; opacity: number; accreditationOpacity: number };
  categoryName: string;
  accentColor: RgbTriple;
  accreditationLogoUrls: string[];
};

type LoadedImage = {
  dataUrl: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG";
  bitmap?: ImageBitmap;
};

const DEFAULT_LOGOS = [
  "/accreditation/smas-logo.png",
  "/accreditation/constructionline-logo.png",
  "/accreditation/iso-9001-logo.jpg",
  "/accreditation/bafe-logo.jpeg",
];

function getSystemQty(templateName: string, jobInfo: JobInfo | null | undefined): number {
  if (!jobInfo) return 1;
  const n = templateName.toLowerCase();
  if (n.includes("commission")) {
    const cat = jobInfo.category || "";
    if (cat === "dry_riser_installation" || cat === "installation") return Math.max(jobInfo.other_qty || 1, 1);
    return Math.max(jobInfo.pressure_test_qty || 1, 1);
  }
  if (n.includes("pressure test") || n.includes("dry riser") || n.includes("wet riser") || n.includes("sprinkler") || n.includes("hydrant")) {
    return Math.max(jobInfo.pressure_test_qty || 1, 1);
  }
  if (n.includes("visual")) return Math.max(jobInfo.visual_qty || 1, 1);
  return 1;
}

function mimeToFormat(mime: string, url: string): "PNG" | "JPEG" {
  const u = url.toLowerCase();
  return mime.includes("jpeg") || mime.includes("jpg") || u.endsWith(".jpg") || u.endsWith(".jpeg") ? "JPEG" : "PNG";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadImage(url: string | null | undefined): Promise<LoadedImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: "cors", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Image failed: ${response.status}`);
    const blob = await response.blob();
    const format = mimeToFormat(blob.type, url);
    const buffer = await blob.arrayBuffer();
    const dataUrl = `data:${blob.type || (format === "JPEG" ? "image/jpeg" : "image/png")};base64,${bytesToBase64(new Uint8Array(buffer))}`;
    let width = 1;
    let height = 1;
    let bitmap: ImageBitmap | undefined;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
    }
    return { dataUrl, width, height, format, bitmap };
  } catch {
    return null;
  }
}

function resolveWatermark(base: WorkerPayload["watermarkSettings"], override: WorkerPayload["watermarkOverride"]) {
  return {
    mode: override?.mode ?? base.mode,
    opacity: typeof override?.opacity === "number" ? override.opacity : base.opacity,
    accreditationOpacity: typeof override?.accreditationOpacity === "number" ? override.accreditationOpacity : base.accreditationOpacity,
  };
}

function renderHeader(
  doc: jsPDF,
  templateName: string,
  branding: NonNullable<Template["branding"]>,
  data: { customerName: string; siteName: string; siteAddress: string; refNumber: string; dateVal: string; riserLocation: string },
  standard: string | null | undefined,
  accent: RgbTriple,
  opts: { compact?: boolean; marginX?: number; logo?: LoadedImage | null; isDryRiser?: boolean },
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = opts.marginX ?? 10;
  const maxWidth = pageWidth - margin * 2;
  const compact = !!opts.compact;
  const logoTopY = opts.isDryRiser ? DRY_RISER_LAYOUT.page.marginTopMm : compact ? 6 : 8;
  const logoMaxW = opts.isDryRiser ? 60 : compact ? 65 : 85;
  const logoMaxH = opts.isDryRiser ? DRY_RISER_LAYOUT.header.logoHeightMm : compact ? 28 : 40;
  let logoBottomY = logoTopY;

  if (opts.logo) {
    const aspect = opts.logo.width / opts.logo.height;
    let lw = logoMaxH * aspect;
    let lh = logoMaxH;
    if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
    doc.addImage(opts.logo.dataUrl, opts.logo.format, (pageWidth - lw) / 2, logoTopY, lw, lh);
    logoBottomY = logoTopY + lh + (compact ? 1.5 : 3);
  } else if (branding.company_name) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(branding.company_name, pageWidth / 2, logoTopY + 5, { align: "center" });
    logoBottomY = logoTopY + 12;
  }

  let y = logoBottomY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(opts.isDryRiser ? DRY_RISER_LAYOUT.header.titleSizePt : 15);
  doc.setTextColor(...accent);
  const titleY = compact ? y + 2 : y;
  doc.text(templateName.toUpperCase(), pageWidth / 2, titleY, { align: "center" });
  y = titleY + 4;

  if (standard) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(opts.isDryRiser ? DRY_RISER_LAYOUT.header.subtitleSizePt : 9);
    doc.setTextColor(...accent);
    doc.text(standard, pageWidth / 2, y, { align: "center" });
    y += opts.isDryRiser ? DRY_RISER_LAYOUT.header.ruleGapPt * 0.3527777778 + 1 : 4;
  }

  doc.setDrawColor(...accent);
  doc.setLineWidth(opts.isDryRiser ? DRY_RISER_LAYOUT.header.ruleThicknessPt * 0.3527777778 : 0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;
  doc.setTextColor(30, 30, 30);

  const headerRowH = 6;
  if (opts.isDryRiser) {
    const detailH = headerRowH * 3;
    const c1 = maxWidth * 0.18;
    const c2 = maxWidth * 0.34;
    const c3 = maxWidth * 0.12;
    const x0 = margin;
    const x1 = x0 + c1;
    const x2 = x1 + c2;
    const x3 = x2 + c3;
    const x4 = margin + maxWidth;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(x0, y, maxWidth, detailH);
    doc.line(x0, y + headerRowH, x4, y + headerRowH);
    doc.line(x0, y + headerRowH * 2, x4, y + headerRowH * 2);
    doc.line(x1, y, x1, y + headerRowH * 2);
    doc.line(x2, y, x2, y + headerRowH * 2);
    doc.line(x3, y, x3, y + headerRowH * 2);
    doc.line(x1, y + headerRowH * 2, x1, y + headerRowH * 3);
    const drawCell = (label: string, value: string, lx: number, vx: number, maxValueW: number, yy: number) => {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(label, lx + 2, yy + 4);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(value || "", maxValueW).slice(0, 1).join(""), vx + 2, yy + 4);
    };
    drawCell("Customer:", data.customerName, x0, x1, c2 - 4, y);
    drawCell("DATE:", data.dateVal, x2, x3, x4 - x3 - 4, y);
    drawCell("Site:", [data.siteName, data.siteAddress].filter(Boolean).join(", "), x0, x1, c2 - 4, y + headerRowH);
    drawCell("PO/REF:", data.refNumber, x2, x3, x4 - x3 - 4, y + headerRowH);
    drawCell("Riser Location:", data.riserLocation, x0, x1, x4 - x1 - 4, y + headerRowH * 2);
    y += detailH + 8;
  } else {
    const detailH = headerRowH * 3;
    const splitX = margin + maxWidth * 0.7;
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, maxWidth, detailH);
    doc.line(splitX, y, splitX, y + headerRowH * 2);
    doc.line(margin, y + headerRowH, margin + maxWidth, y + headerRowH);
    doc.line(margin, y + headerRowH * 2, margin + maxWidth, y + headerRowH * 2);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Customer:", margin + 1, y + 4);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(data.customerName, maxWidth * 0.7 - 22).slice(0, 1).join(""), margin + 19, y + 4);
    doc.setFont("helvetica", "bold");
    doc.text("DATE:", splitX + 1, y + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.dateVal, splitX + 14, y + 4);
    doc.setFont("helvetica", "bold");
    doc.text("Site:", margin + 1, y + headerRowH + 4);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize([data.siteName, data.siteAddress].filter(Boolean).join(", "), maxWidth * 0.7 - 12).slice(0, 1).join(""), margin + 10, y + headerRowH + 4);
    doc.setFont("helvetica", "bold");
    doc.text("PO/REF:", splitX + 1, y + headerRowH + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.refNumber, splitX + 16, y + headerRowH + 4);
    doc.setFont("helvetica", "bold");
    doc.text("Riser Location:", margin + 1, y + headerRowH * 2 + 4);
    doc.setFont("helvetica", "normal");
    doc.text(data.riserLocation, margin + 28, y + headerRowH * 2 + 4);
    y += detailH + 2;
  }

  return y;
}

function addAccreditationLogos(doc: jsPDF, logos: LoadedImage[], footerY: number, logoH: number, opacity: number) {
  if (logos.length === 0) return;
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 5;
  const dims = logos.map((img) => ({ img, w: (img.width / img.height) * logoH }));
  const totalW = dims.reduce((sum, d) => sum + d.w, 0) + gap * (dims.length - 1);
  const rowY = footerY - logoH - 3;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    let x = (pageWidth - totalW) / 2;
    const gState = (doc as any).GState({ opacity });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    for (const { img, w } of dims) {
      doc.addImage(img.dataUrl, img.format, x, rowY, w, logoH);
      x += w + gap;
    }
    doc.restoreGraphicsState();
  }
}

function addWatermark(doc: jsPDF, watermark: LoadedImage | null, brandColor: RgbTriple, mode: WatermarkMode, opacity: number) {
  if (!watermark || mode === "none") return;
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const wmH = pageHeight * 0.85;
  const wmW = (watermark.width / watermark.height) * wmH;
  const x = (pageWidth - wmW) / 2;
  const y = (pageHeight - wmH) / 2 + 12;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const gState = (doc as any).GState({ opacity });
    doc.saveGraphicsState();
    (doc as any).setGState(gState);
    doc.addImage(watermark.dataUrl, watermark.format, x, y, wmW, wmH);
    doc.restoreGraphicsState();
  }
}

async function buildPdf(payload: WorkerPayload) {
  const { template, jobInfo, handfill, categoryName, accentColor } = payload;
  const systemQty = getSystemQty(template.name, jobInfo);
  const customerLogoUrl = jobInfo?.customers?.logo_url || null;
  const isDryRiser = /dry\s*riser/i.test(template.name || "");
  const isWetRiser = /wet\s*riser/i.test(template.name || "");
  const isRiserTemplate = isDryRiser || isWetRiser;
  const branding = isRiserTemplate
    ? { ...(template.branding || {}), logo_url: "/vivafire-logo.png" }
    : { ...(template.branding || {}), ...(customerLogoUrl ? { logo_url: customerLogoUrl } : {}) };
  const footerText = getDefaultFooterText(template.name, branding, template.footer_text);
  const autoVals = getAutoPopulatedValues(template.name, template.fields, jobInfo ? { ...jobInfo, categoryName } : jobInfo);
  const customerName = jobInfo?.customers?.name || jobInfo?.customer || "";
  const siteName = jobInfo?.site?.name || "";
  const siteAddress = [jobInfo?.site?.address || jobInfo?.address || "", jobInfo?.site?.postcode || ""].filter(Boolean).join(", ");
  const refNumber = jobInfo?.reference_number || "";
  const dateVal = "";
  const riserField = template.fields.find(f => f.label.toLowerCase().includes("riser location"));
  const riserLocValue = jobInfo?.site?.riser_location || (riserField ? (autoVals[riserField.id] || "") : "");
  const engineerList = (jobInfo?.engineers || []).join(", ");

  const [logoImage, watermark, accreditationLogos] = await Promise.all([
    loadImage(branding.logo_url || "/images/vivafire-logo-new.png"),
    loadImage("/images/viva-watermark.png?v=4"),
    Promise.all((payload.accreditationLogoUrls?.length ? payload.accreditationLogoUrls : DEFAULT_LOGOS).map(loadImage)),
  ]);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = isDryRiser ? DRY_RISER_LAYOUT.page.marginLeftMm : 10;
  const margin = marginX;
  const maxWidth = pageWidth - marginX * 2;

  for (let sysIdx = 0; sysIdx < systemQty; sysIdx++) {
    if (sysIdx > 0) doc.addPage();
    const { title: sheetTitle, subtitle: sheetSubtitle } = resolveTemplateDisplayTitle(template.name, {
      brandingSubtitle: template.branding?.company_subtitle ?? null,
    });
    let y = renderHeader(doc, sheetTitle, branding, {
      customerName,
      siteName,
      siteAddress,
      refNumber,
      dateVal,
      riserLocation: riserLocValue,
    }, template.standard || sheetSubtitle, isDryRiser ? DRY_RISER_LAYOUT.header.brandBlueRgb : accentColor, {
      compact: false,
      marginX,
      logo: logoImage,
      isDryRiser,
    });

    const skipIds = buildSkipIds(template.fields);
    const sections = getSections(template.fields);
    const colSplit = maxWidth * 0.68;
    const footerSpace = isDryRiser ? 58 : 50;
    const availableH = pageHeight - y - footerSpace;
    const layout = computeSectionLayout(template.fields, sections, skipIds, availableH, { sectionHeaderH: 5, maxRowH: 6 });

    for (const section of sections) {
      const sectionFields = getSectionFields(template.fields, section, skipIds);
      if (sectionFields.length === 0) continue;
      if (section.toLowerCase().includes("pressure test result")) {
        const inlineH = layout.rowH;
        const rightEdge = margin + maxWidth;
        type InlineRow = { field: (typeof sectionFields)[0]; x: number }[];
        const rows: InlineRow[] = [];
        let currentRow: InlineRow = [];
        let ox = margin + 1;
        for (const field of sectionFields) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          const labelW = doc.getTextWidth(field.label) + 1;
          let fieldW = labelW;
          if (field.type === "pass_fail") fieldW += 32;
          else if (field.type === "number") fieldW += field.allow_na ? 34 : 14;
          else if (["text", "short_text", "textarea", "date"].includes(field.type)) fieldW += field.allow_na ? 45 : 22;
          else if (field.type === "select" && field.options) {
            const hasNa = field.options.some((opt) => opt.toLowerCase() === "n/a" || opt.toLowerCase() === "na");
            const options = field.allow_na && !hasNa ? [...field.options, "N/A"] : field.options;
            for (const opt of options) fieldW += 4 + doc.getTextWidth(opt) + 2;
            fieldW += 4;
          }
          fieldW += 2;
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
        if (y + layout.sectionHeaderH + totalH > pageHeight - footerSpace) { doc.addPage(); y = margin; }
        y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH, showResultLabel: false, handfill });
        for (const row of rows) {
          if (!handfill) { doc.setDrawColor(180); doc.rect(margin, y, maxWidth, inlineH); }
          doc.setFontSize(8);
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
              if (field.allow_na) { doc.rect(ox2 + 13, y + 1, 3, 3); doc.text("N/A", ox2 + 17, y + 3.5); }
            } else if (["text", "short_text", "textarea", "date"].includes(field.type)) {
              doc.line(ox2, y + 3.5, ox2 + 18, y + 3.5);
              if (field.allow_na) { doc.rect(ox2 + 21, y + 1, 3, 3); doc.text("N/A", ox2 + 25, y + 3.5); }
            } else if (field.type === "select" && field.options) {
              const hasNa = field.options.some((opt) => opt.toLowerCase() === "n/a" || opt.toLowerCase() === "na");
              const options = field.allow_na && !hasNa ? [...field.options, "N/A"] : field.options;
              for (const opt of options) {
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

      const sectionRowUnits = sectionFields.reduce((sum, field) => sum + (field.type === "signature" ? 2 : 1), 0);
      if (y + layout.sectionHeaderH + sectionRowUnits * layout.rowH > pageHeight - footerSpace) { doc.addPage(); y = margin; }
      y = renderSectionHeader(doc, section, y, { margin, maxWidth, colSplit, sectionHeaderH: layout.sectionHeaderH, handfill });
      for (const field of sectionFields) {
        const isScopeField = field.id === "scope_of_work" || field.label.toLowerCase().replace(/[:\s]+$/g, "").trim().includes("scope of work");
        if (isDryRiser && isScopeField) continue;
        const isDrainField = field.label.toLowerCase().includes("drain") || field.label.toLowerCase().includes("drop leg");
        const allowAuto = !isDryRiser && (isScopeField || isDrainField);
        const autoVal = (field.options && field.options.length > 0 && !allowAuto) ? undefined : (isDryRiser ? undefined : autoVals[field.id]);
        y = renderBlankFieldRow(doc, field, autoVal, y, { margin, maxWidth, colSplit, rowH: layout.rowH, handfill });
      }
      y += 1;
    }

    const logoH = 9;
    const footerYForLogos = isDryRiser ? pageHeight - margin - 9 - 2 : pageHeight - 1;
    const accredStripTop = footerYForLogos - logoH - 3;
    const sigY = accredStripTop - 28 - 1;
    const commentsBoxBottom = sigY - 3;
    const minCommentsH = 6;
    const commentsBoxTop = Math.min(y + 4, commentsBoxBottom - minCommentsH);
    const commentsAvailH = commentsBoxBottom - commentsBoxTop;
    const commentsRectH = isDryRiser ? Math.max(commentsAvailH, minCommentsH) : Math.max(Math.min(commentsAvailH, 45), minCommentsH);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text("Comments:", margin, commentsBoxTop - 1);
    if (!handfill) { doc.setDrawColor(180); doc.rect(margin, commentsBoxTop, maxWidth, commentsRectH); }
    renderPdfSignatures(doc, sigY, { dateStr: "", technicianName: engineerList, customerName: "" }, { blank: true });
    if (!isDryRiser) {
      renderPdfFooter(doc, pageHeight - margin - 9, footerText);
    } else {
      const declarationText = (template.branding?.declaration_text || "").trim() || "Tested and inspected in accordance with BS 9990:2015";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const padX = 4;
      const padY = 2.5;
      const lineH = 4;
      const lines = doc.splitTextToSize(declarationText, pageWidth - margin * 2 - padX * 2) as string[];
      const textH = lines.length * lineH;
      const declH = Math.max(9, textH + padY * 2);
      const declY = pageHeight - margin - declH;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(margin, declY, pageWidth - margin * 2, declH);
      let ty = declY + (declH - textH) / 2 + lineH - 1;
      lines.forEach((ln) => { doc.text(ln, pageWidth / 2, ty, { align: "center" }); ty += lineH; });
    }
  }

  const wm = resolveWatermark(payload.watermarkSettings, payload.watermarkOverride);
  const footerYForLogos = isDryRiser ? pageHeight - margin - 9 - 2 : pageHeight - 1;
  addWatermark(doc, watermark, accentColor, wm.mode, wm.opacity);
  addAccreditationLogos(doc, accreditationLogos.filter(Boolean) as LoadedImage[], footerYForLogos, 9, wm.accreditationOpacity);

  const fileName = [
    jobInfo?.reference_number || "blank",
    template.name.replace(/\s+/g, "-").toLowerCase(),
    customerName.replace(/\s+/g, "-").toLowerCase() || null,
    systemQty > 1 ? `x${systemQty}` : null,
    handfill ? "handfill" : null,
  ].filter(Boolean).join("-") + ".pdf";

  return { buffer: doc.output("arraybuffer") as ArrayBuffer, fileName };
}

self.onmessage = async (event: MessageEvent) => {
  const { type, requestId, payload } = event.data || {};
  if (type !== "generate") return;
  const label = `BlankTemplatePdfWorker.generate:${payload?.template?.id || payload?.template?.name || "unknown"}`;
  console.time(label);
  const started = performance.now();
  try {
    const { buffer, fileName } = await buildPdf(payload as WorkerPayload);
    const duration = performance.now() - started;
    console.timeEnd(label);
    (self as any).postMessage({ type: "success", requestId, buffer, fileName, duration }, [buffer]);
  } catch (error: any) {
    console.timeEnd(label);
    self.postMessage({ type: "error", requestId, error: error?.message || "Unable to generate PDF." });
  }
};

export {};