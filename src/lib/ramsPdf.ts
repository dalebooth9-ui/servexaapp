import jsPDF from "jspdf";
import { loadWatermarkImage } from "@/lib/pdfWatermark";
import { renderBrandingOverlay } from "@/lib/pdfBranding";
import { fetchCustomerAccreditationLogos, loadAccreditationLogos } from "@/lib/pdfAccreditations";
import { PDF_PALETTE } from "@/lib/pdfPalette";
import { PDF_DIMENSIONS } from "@/lib/pdfDimensions";
import { RAMS_FOOTER_TOP } from "@/lib/ramsPdfBase";

export type RamsFormData = Record<string, any>;

interface RamsJobInfo {
  reference_number?: string;
  name?: string | null;
  customer?: string | null;
  customers?: { name: string; logo_url?: string | null } | null;
  address?: string | null;
  site?: { name: string; address: string | null } | null;
  pressure_test_qty?: number;
  visual_qty?: number;
  other_qty?: number;
  other_service_type?: string | null;
}

/* ─────────────────────────────────────────────────────────── helpers ── */

const PAGE_W = 210;
const PAGE_H = 297;
// Standardised on PDF_DIMENSIONS.margin (10mm) — see ramsPdfBase.ts for the
// rationale. Both modules must stay in lock-step.
const ML = PDF_DIMENSIONS.margin;
const MR = PDF_DIMENSIONS.margin;
const CONTENT_W = PAGE_W - ML - MR;
const SAFE_BOTTOM = PAGE_H - 56; // Extra margin to clear accreditation logos (~21mm) + footer (~15mm) + buffer

function newPage(doc: jsPDF): number {
  doc.addPage();
  return 18;
}

async function checkPageBreak(
  doc: jsPDF,
  y: number,
  neededMm: number,
  logoImg: HTMLImageElement | null,
  pageNum: number,
  totalPages: number
): Promise<number> {
  if (y + neededMm > SAFE_BOTTOM) {
    pageFooter(doc, pageNum, totalPages);
    y = newPage(doc);
    y = await pageHeader(doc, logoImg, "", y);
  }
  return y;
}

function hr(doc: jsPDF, y: number, color = 180): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.2);
  doc.line(ML, y, PAGE_W - MR, y);
}

function labelValue(doc: jsPDF, label: string, value: string, x: number, y: number, labelW = 52): void {
  const maxValueW = PAGE_W - MR - x - labelW - 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  if (value) {
    const lines = doc.splitTextToSize(value, maxValueW);
    doc.text(lines[0], x + labelW, y);
  }
}

function para(doc: jsPDF, text: string, x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.352778 + 1.2);
}

function sectionHeading(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(33, 61, 99);
  doc.text(text, ML, y);
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 1.5, 100);
  return y + 6;
}

function numberedList(doc: jsPDF, items: string[], x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  for (let i = 0; i < items.length; i++) {
    const num = `${i + 1}.`;
    doc.text(num, x, y);
    const lines = doc.splitTextToSize(items[i], maxW - 6);
    doc.text(lines, x + 6, y);
    y += lines.length * (size * 0.352778 + 1.2);
  }
  return y;
}

function bulletList(doc: jsPDF, items: string[], x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  for (const item of items) {
    doc.text("•", x, y);
    const lines = doc.splitTextToSize(item, maxW - 5);
    doc.text(lines, x + 5, y);
    y += lines.length * (size * 0.352778 + 1.2);
  }
  return y;
}

function pageFooter(doc: jsPDF, pageNum: number, total: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Page ${pageNum} of ${total}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

async function pageHeader(doc: jsPDF, logoImg: HTMLImageElement | null, title: string, y: number): Promise<number> {
  if (logoImg) {
    const lh = 14;
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    const lw = Math.min(lh * aspect, 50);
    doc.addImage(logoImg, "JPEG", ML, y, lw, lh);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(33, 61, 99);
    doc.text("VIVA FIRE PROTECTION LTD", ML, y + 8);
    doc.setTextColor(0, 0, 0);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(33, 61, 99);
  const headerSubtitle = title || "Method Statement & Risk Assessment";
  doc.text(headerSubtitle, PAGE_W - MR, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("VIVA Fire Protection Ltd", PAGE_W - MR, y + 11, { align: "right" });
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 17, 60);
  return y + 21;
}

const RISK_FONT_SIZE = 6.5;
const RISK_LINE_H = 3.9;
const RISK_PAD_H = 1.2;
const RISK_PAD_V = 1.2;

function splitCell(doc: jsPDF, text: string, cw: number, bold = false): string[] {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(RISK_FONT_SIZE);
  return doc.splitTextToSize(text || "", cw - RISK_PAD_H * 2);
}

function cellHeight(doc: jsPDF, text: string, cw: number, bold = false): number {
  const lines = splitCell(doc, text, cw, bold);
  return lines.length * RISK_LINE_H + RISK_PAD_V * 2;
}

function drawCell(
  doc: jsPDF,
  text: string,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  opts: { fill?: [number,number,number]; textColor?: [number,number,number]; bold?: boolean; center?: boolean } = {}
): void {
  if (opts.fill) {
    doc.setFillColor(...opts.fill);
    doc.rect(cx, cy, cw, ch, "F");
  }
  doc.setDrawColor(80);
  doc.setLineWidth(0.2);
  doc.rect(cx, cy, cw, ch);
  if (text) {
    doc.setTextColor(...(opts.textColor ?? [0, 0, 0] as [number,number,number]));
    const lines = splitCell(doc, text, cw, opts.bold);
    const textX = opts.center ? cx + cw / 2 : cx + RISK_PAD_H;
    const textBlockH = lines.length * RISK_LINE_H;
    const textY = cy + (ch - textBlockH) / 2 + RISK_LINE_H * 0.75;
    doc.text(lines, textX, textY, opts.center ? { align: "center" } : {});
  }
}

function riskRow(doc: jsPDF, cols: string[], widths: number[], y: number, _rowH: number, bold = false): number {
  let rowH = RISK_LINE_H + RISK_PAD_V * 2;
  for (let i = 0; i < cols.length; i++) {
    const h = cellHeight(doc, cols[i], widths[i], bold);
    if (h > rowH) rowH = h;
  }
  rowH = Math.max(rowH, RISK_LINE_H + RISK_PAD_V * 2);

  const NAVY: [number,number,number] = [33, 61, 99];
  const WHITE: [number,number,number] = [255, 255, 255];
  const ratingCols = new Set([5, 9]);

  let x = ML;
  for (let i = 0; i < cols.length; i++) {
    let fill: [number,number,number] | undefined = bold ? NAVY : undefined;
    const textColor: [number,number,number] = bold ? WHITE : [0,0,0];

    if (!bold && ratingCols.has(i)) {
      const num = parseInt((cols[i] || "").trim(), 10);
      if (!isNaN(num)) {
        if      (num >= 15) fill = [255, 80, 80];
        else if (num >= 8)  fill = [255, 165, 0];
        else if (num >= 4)  fill = [255, 230, 0];
        else                fill = [0, 180, 0];
      }
    }

    drawCell(doc, cols[i], x, y, widths[i], rowH, { fill, textColor, bold, center: ratingCols.has(i) });
    x += widths[i];
  }

  doc.setTextColor(0, 0, 0);
  return y + rowH;
}

function riskTableHeader(doc: jsPDF, widths: number[], y: number): number {
  const NAVY: [number,number,number] = [33, 61, 99];
  const WHITE: [number,number,number] = [255, 255, 255];

  const row1H = RISK_LINE_H * 2 + RISK_PAD_V * 2;
  const row2H = RISK_LINE_H + RISK_PAD_V * 2;

  const x0 = ML;
  const x1 = x0 + widths[0];
  const x2 = x1 + widths[1];
  const x3 = x2 + widths[2];
  const x4 = x3 + widths[3];
  const x5 = x4 + widths[4];
  const x6 = x5 + widths[5];
  const x7 = x6 + widths[6];
  const x8 = x7 + widths[7];
  const x9 = x8 + widths[8];
  const x10 = x9 + widths[9];

  const preW = widths[3] + widths[4] + widths[5];
  const postW = widths[7] + widths[8] + widths[9];

  const spanH = row1H + row2H;
  drawCell(doc, "Activity",                x0, y, widths[0], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Hazard",                  x1, y, widths[1], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Risks / Persons at Risk", x2, y, widths[2], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Pre Control\nRisk Rating",x3, y, preW,      row1H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "Control Measures",        x6, y, widths[6], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Post Control\nRisk Rating",x7, y, postW,    row1H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "Comments",                x10, y, widths[10], spanH, { fill: NAVY, textColor: WHITE, bold: true });

  const row2y = y + row1H;
  drawCell(doc, "L", x3, row2y, widths[3], row2H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "S", x4, row2y, widths[4], row2H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "R", x5, row2y, widths[5], row2H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "L", x7, row2y, widths[7], row2H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "S", x8, row2y, widths[8], row2H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "R", x9, row2y, widths[9], row2H, { fill: NAVY, textColor: WHITE, bold: true, center: true });

  doc.setTextColor(0, 0, 0);
  return row2y + row2H;
}

function riskColorLegend(doc: jsPDF, y: number): number {
  const legendItems: { label: string; r: number; g: number; b: number }[] = [
    { label: "High Risk (≥15)",        r: 255, g: 80,  b: 80  },
    { label: "Medium Risk (8–14)",     r: 255, g: 165, b: 0   },
    { label: "Low-Medium Risk (4–7)",  r: 255, g: 230, b: 0   },
    { label: "Low Risk (<4)",          r: 0,   g: 180, b: 0   },
  ];
  const boxW = 8;
  const boxH = 4;
  const gap = 2;
  const itemW = 44;
  const totalW = legendItems.length * itemW;
  let x = (PAGE_W - totalW) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text("Risk Rating Key:", x - 2, y + 3);
  x += 22;

  for (const item of legendItems) {
    doc.setFillColor(item.r, item.g, item.b);
    doc.setDrawColor(80);
    doc.setLineWidth(0.2);
    doc.rect(x, y, boxW, boxH, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(item.label, x + boxW + gap, y + 3);
    x += itemW;
  }

  doc.setTextColor(0, 0, 0);
  return y + boxH + 2;
}

function signatureRow(
  doc: jsPDF,
  name: string,
  sigData: string | undefined,
  date: string,
  y: number
): number {
  const colW = CONTENT_W / 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  doc.rect(ML, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Name:", ML + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(name || "____________________", ML + 12, y + 4);

  doc.rect(ML + colW, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Signature:", ML + colW + 1, y + 4); doc.setFont("helvetica", "normal");
  if (sigData && sigData.startsWith("data:image")) {
    try {
      doc.addImage(sigData, "PNG", ML + colW + 22, y + 1, 25, 9);
    } catch { /* skip */ }
  }

  doc.rect(ML + colW * 2, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Date:", ML + colW * 2 + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(date || "____________________", ML + colW * 2 + 12, y + 4);

  return y + 14;
}

/* ══════════════════════════════════════════════════════════ COVER PAGE TITLES ══ */

const RAMS_TYPE_COVER: Record<string, { subtitle: string; operationTask: string }> = {
  dry_riser: {
    subtitle: "Dry Riser — Annual Service & Pressure Testing",
    operationTask: "Pressure testing pipework and associated fittings",
  },
  dry_riser_remedial: {
    subtitle: "Dry Riser — Remedial / Repairs",
    operationTask: "Remedial repair works to dry riser system including hot works",
  },
  wet_riser: {
    subtitle: "Wet Riser — Annual Service & Flow Testing",
    operationTask: "Inspection, testing and servicing of wet riser system",
  },
  fire_alarm: {
    subtitle: "Fire Alarm — Service & Testing",
    operationTask: "Inspection, testing and servicing of fire alarm system",
  },
  emergency_lighting: {
    subtitle: "Emergency Lighting — Service & Testing",
    operationTask: "Inspection, testing and servicing of emergency lighting system",
  },
  passive_fire: {
    subtitle: "Passive Fire Protection Works",
    operationTask: "Passive fire protection installation and inspection",
  },
  hose_reel: {
    subtitle: "Hose Reel — Service & Testing",
    operationTask: "Inspection, testing and servicing of hose reel system",
  },
  fire_risk_assessment: {
    subtitle: "Fire Risk Assessment",
    operationTask: "Fire risk assessment survey and reporting",
  },
};

/* ══════════════════════════════════════════════════════════ main export ══ */

export async function generateRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  assignedEngineers?: { name: string; sig: string; date: string }[],
  ramsType?: string
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let logoImg: HTMLImageElement | null = null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej();
      img.src = `/images/vivafire-logo-new.jpg?v=${Date.now()}`;
    });
    logoImg = img;
  } catch { /* no logo */ }

  // ── Resolve all dynamic content from formData (editor-saved fields) ──
  const contractName = formData["rams_contract_job_name"] || jobInfo?.name || "";
  const datePrepared = formData["rams_assessment_date"] || new Date().toLocaleDateString("en-GB");
  const clientName   = formData["rams_client"] || jobInfo?.customers?.name || jobInfo?.customer || "";
  const attendanceDate = formData["rams_attendance_date"] || "";
  const siteLocation = formData["rams_site_location"] ||
    (jobInfo?.site?.name
      ? `${jobInfo.site.name}${jobInfo.site.address ? ", " + jobInfo.site.address : ""}`
      : jobInfo?.address || "All areas / locations");

  // Dynamic method statement content — populated from editor via _prefixed fields
  const descriptionOfWork: string = formData["_descriptionOfWork"] || formData["rams_description_of_work"] || "Fire safety works in accordance with applicable British Standards.";
  const sequenceOfOps: string[]    = formData["_sequenceOfOps"]    || [];
  const taskSpecificOps: string[]  = formData["_taskSpecificOps"]  || [];
  const location: string           = formData["_location"]         || siteLocation || "All areas / locations";
  const resources: string          = formData["_resources"]        || "Minimum of: 2 Operatives";
  const personnel: string          = formData["_personnel"]        || "Dale Booth";
  const plantAndEquipment: string[]= formData["_plantAndEquipment"]|| [];
  const significantRisks: string[] = formData["_significantRisks"] || [];
  const specialTraining: string    = formData["_specialTraining"]  || "All operatives hold current CSCS cards.";
  const ppeItems: string[]         = formData["_ppeItems"]         || ["Hard Hat EN397","High Visibility Vest EN471","Steel Toe Cap/Mid Sole Boots EN20345","Gloves CE4131","Glasses EN166","Goggles EN166"];
  const riskRows: string[][]       = formData["_riskRows"]         || [];

  // Cover page titles
  const typeKey = ramsType || "dry_riser";
  const coverTitles = RAMS_TYPE_COVER[typeKey] || RAMS_TYPE_COVER["dry_riser"];

  // Operatives
  let operatives: { name: string; sig: string; date: string }[] = [];
  if (assignedEngineers && assignedEngineers.length > 0) {
    operatives = assignedEngineers;
  } else {
    for (let i = 1; i <= 8; i++) {
      const n = formData[`rams_op${i}_name`] || "";
      const s = formData[`rams_op${i}_sig`] || "";
      const d = formData[`rams_op${i}_date`] || "";
      if (n || s || d) operatives.push({ name: n, sig: s, date: d });
    }
  }
  const engineerNames = operatives.length > 0
    ? operatives.map((o) => o.name).filter(Boolean).join(", ")
    : "Viva Fire Operatives";

  // Scope line for cover page
  const scopeParts = [
    (jobInfo?.pressure_test_qty ?? 0) > 0 ? `Pressure Test x${jobInfo!.pressure_test_qty}` : null,
    (jobInfo?.visual_qty ?? 0) > 0 ? `Visual x${jobInfo!.visual_qty}` : null,
    (jobInfo?.other_qty ?? 0) > 0 ? `${jobInfo!.other_service_type || "Other"} x${jobInfo!.other_qty}` : null,
  ].filter(Boolean).join("  |  ");

  const paraH = (text: string, maxW: number, size = 8.5): number => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW);
    return lines.length * (size * 0.352778 + 1.2);
  };

  /* ─────────────────────────────────────── PAGE 1 – Cover ── */
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(33, 61, 99);
  doc.text(coverTitles.subtitle, PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(22);
  doc.text("VIVA FIRE", PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(13);
  doc.text("Method Statement & Risk Assessment", PAGE_W / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.text("Fire Protection Ltd", PAGE_W / 2, y, { align: "center" });
  y += 12;
  doc.setTextColor(0, 0, 0);
  hr(doc, y, 60);
  y += 8;

  const rowGap = 7;
  doc.setFontSize(8.5);
  const reviewText = "Review date: This method statement and its associated risk assessments will be reviewed on an on-going basis for the duration of the works.";
  const reviewLines = doc.splitTextToSize(reviewText, CONTENT_W - 6);

  const contractLabel = "Contract / Job Name:";
  const contractVal = contractName + (jobInfo?.reference_number ? `  [${jobInfo.reference_number}]` : "");
  doc.setFontSize(9);
  const contractLines = doc.splitTextToSize(contractVal, CONTENT_W - 3 - 52);
  const customerVal = clientName;
  const addressVal = jobInfo?.site?.address || jobInfo?.address || "";

  const boxY = y;
  let ry = boxY + 7;
  ry += rowGap;
  ry += Math.max(rowGap, contractLines.length * (9 * 0.352778 + 1.2));
  if (customerVal) ry += rowGap;
  if (addressVal) {
    const addrLines = doc.splitTextToSize(addressVal, CONTENT_W - 3 - 52);
    ry += Math.max(rowGap, addrLines.length * (9 * 0.352778 + 1.2));
  }
  if (siteLocation && siteLocation !== "All areas / locations") {
    const siteLines = doc.splitTextToSize(siteLocation, CONTENT_W - 55);
    ry += Math.max(rowGap, siteLines.length * (9 * 0.352778 + 1.2));
  }
  ry += rowGap;
  if (scopeParts) ry += rowGap;
  if (engineerNames && engineerNames !== "Viva Fire Operatives") {
    const engLines = doc.splitTextToSize(engineerNames, CONTENT_W - 3 - 52);
    ry += Math.max(rowGap, engLines.length * (9 * 0.352778 + 1.2));
  }
  ry += reviewLines.length * (8.5 * 0.352778 + 1.2) + 2;
  ry += rowGap;
  ry += rowGap;
  const detailBoxH = Math.min(ry - boxY + 3, 255); // clamp at 255mm

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(ML, boxY, CONTENT_W, detailBoxH);

  doc.setFontSize(9);
  let ry2 = boxY + 7;
  labelValue(doc, "Operation / Task:", coverTitles.operationTask, ML + 3, ry2); ry2 += rowGap;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(contractLabel, ML + 3, ry2);
  doc.setFont("helvetica", "normal");
  doc.text(contractLines, ML + 3 + 52, ry2);
  ry2 += Math.max(rowGap, contractLines.length * (9 * 0.352778 + 1.2));
  if (customerVal) {
    labelValue(doc, "Customer:", customerVal, ML + 3, ry2); ry2 += rowGap;
  }
  if (addressVal) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Address:", ML + 3, ry2);
    doc.setFont("helvetica", "normal");
    const addrLines = doc.splitTextToSize(addressVal, CONTENT_W - 3 - 52);
    doc.text(addrLines, ML + 3 + 52, ry2);
    ry2 += Math.max(rowGap, addrLines.length * (9 * 0.352778 + 1.2));
  }
  if (siteLocation && siteLocation !== "All areas / locations") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Site / Location:", ML + 3, ry2);
    doc.setFont("helvetica", "normal");
    const siteLines = doc.splitTextToSize(siteLocation, CONTENT_W - 55);
    doc.text(siteLines, ML + 3 + 52, ry2);
    ry2 += Math.max(rowGap, siteLines.length * (9 * 0.352778 + 1.2));
  }
  labelValue(doc, "Date Prepared / Revision:", datePrepared, ML + 3, ry2); ry2 += rowGap;
  if (scopeParts) {
    labelValue(doc, "Service Scope:", scopeParts, ML + 3, ry2); ry2 += rowGap;
  }
  if (engineerNames && engineerNames !== "Viva Fire Operatives") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Assigned Engineers:", ML + 3, ry2);
    doc.setFont("helvetica", "normal");
    const engLines = doc.splitTextToSize(engineerNames, CONTENT_W - 3 - 52);
    doc.text(engLines, ML + 3 + 52, ry2);
    ry2 += Math.max(rowGap, engLines.length * (9 * 0.352778 + 1.2));
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text(reviewLines, ML + 3, ry2);
  ry2 += reviewLines.length * (8.5 * 0.352778 + 1.2) + 2;
  doc.setFontSize(9);
  labelValue(doc, "Method Statement Written by:", "Dale Booth", ML + 3, ry2); ry2 += rowGap;
  labelValue(doc, "Method Statement Approved by:", "Dale Booth", ML + 3, ry2);

  y = boxY + detailBoxH + 8;

  let currentPage = 1;
  const TOTAL_PAGES = 10;

  /* ─────────────────────────────── PAGES 1-5 — Method Statement ── */

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  y = await sectionH1(doc, y, logoImg, "1 Introduction");
  y = para(doc,
    "This Method Statement describes the specific safe working methods which will be used to carry out the work. It gives details of how the work will be carried out and what health and safety issues and controls are involved. The content of this Method Statement reflects the finding of the relevant Risk Assessment(s).",
    ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  y = await sectionH1(doc, y, logoImg, "2 Description of Work");
  y = para(doc, descriptionOfWork, ML, y, CONTENT_W);
  y += 3;

  // Working hours block
  y = await checkPageBreak(doc, y, 18, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Time", ML, y); y += 3.5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Site Working Hours:", ML, y); y += 3.5;
  y = bulletList(doc, [
    "Monday to Friday: 6:00am to 8:00pm",
    "Saturday: 8:00am to 12:30pm",
    "Sunday: None (Inc. Bank Holidays)",
  ], ML + 3, y, CONTENT_W - 3);
  y = para(doc, "Any additional hours will need to be approved by main contractor.", ML, y + 0.5, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 20, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.1 Duration", ML, y); y += 4;
  y = para(doc,
    "All works will be supervised at every stage by a competent qualified supervisor, who will be responsible for the day-to-day supervision of personnel and sub-contractors on site.",
    ML, y, CONTENT_W);
  y += 2;

  // 2.2 Sequence of Operations — dynamic
  if (sequenceOfOps.length > 0) {
    y = await checkPageBreak(doc, y, 15, logoImg, currentPage, TOTAL_PAGES);
    if (doc.getNumberOfPages() > currentPage) currentPage++;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.2 Sequence of Operations", ML, y); y += 4;
    y = numberedList(doc, sequenceOfOps, ML + 2, y, CONTENT_W - 2);
    y += 2;
  }

  // 2.3 Task Specific Operations — dynamic
  if (taskSpecificOps.length > 0) {
    y = await checkPageBreak(doc, y, 15, logoImg, currentPage, TOTAL_PAGES);
    if (doc.getNumberOfPages() > currentPage) currentPage++;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.3 Task Specific Sequence of Operations", ML, y); y += 4;
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
    for (let i = 0; i < taskSpecificOps.length; i++) {
      const itemH = paraH(taskSpecificOps[i], CONTENT_W - 8) + 3;
      y = await checkPageBreak(doc, y, itemH, logoImg, currentPage, TOTAL_PAGES);
      if (doc.getNumberOfPages() > currentPage) currentPage++;
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
      doc.text(`${i + 1}.`, ML + 2, y);
      const lines = doc.splitTextToSize(taskSpecificOps[i], CONTENT_W - 8);
      doc.text(lines, ML + 8, y);
      y += lines.length * (8.5 * 0.352778 + 1.2);
    }
    y += 2;
  }

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.4 Location", ML, y); y += 4;
  y = para(doc, location, ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.5 Access and Egress", ML, y); y += 4;
  y = para(doc,
    "Access and egress must be kept open to site at all times for authorised personnel. All Principal Contractor rules regarding access and egress must be followed by Viva Fire operatives and sub-contractors at all times whilst on site with no deviation being permitted. All Viva Fire personnel and sub-contractors must make themselves familiar with site rules and entrance/exit points at induction and ensure they sign in and out at all times, whilst always being vigilant and report any potential problems immediately to site management.",
    ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 12, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3 Resources", ML, y); y += 4;
  y = para(doc, resources, ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.1 Personnel", ML, y); y += 4;
  y = para(doc, personnel || engineerNames, ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 12, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.2 Supervision", ML, y); y += 4;
  y = para(doc, "NAME AND CONTACT: Dale Booth, Tel: 07801269206", ML, y, CONTENT_W); y += 2;

  if (plantAndEquipment.length > 0) {
    y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
    if (doc.getNumberOfPages() > currentPage) currentPage++;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.3 Plant and Equipment", ML, y); y += 4;
    y = bulletList(doc, plantAndEquipment, ML + 3, y, CONTENT_W - 3);
    y += 2;
  }

  // 4. Significant Risks — dynamic
  if (significantRisks.length > 0) {
    y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
    if (doc.getNumberOfPages() > currentPage) currentPage++;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4 Assessment of Significant Risks for all Tasks", ML, y); y += 4;
    y = numberedList(doc, significantRisks, ML + 2, y, CONTENT_W / 2 - 2);
    y += 2;
  }

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.1 COSHH", ML, y); y += 4;
  y = para(doc, "N/A", ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.2 Security", ML, y); y += 4;
  y = para(doc,
    "Site security will be Principal Contractor responsibility but all Viva Fire personnel and sub-contractors on site must play their part and cooperate fully. They must also keep all equipment/tools safe and secure.",
    ML, y, CONTENT_W);
  y += 2;

  // 4.3 Special Training — dynamic
  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.3 Special Training", ML, y); y += 4;
  y = para(doc, specialTraining, ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.4 References to Environmental Aspects and Impacts Register control measures.", ML, y); y += 4;
  y = para(doc, "N/A.", ML, y, CONTENT_W); y += 2;

  // 5 PPE — dynamic
  if (ppeItems.length > 0) {
    y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
    if (doc.getNumberOfPages() > currentPage) currentPage++;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("5 PPE", ML, y); y += 4;
    y = bulletList(doc, ppeItems, ML + 3, y, CONTENT_W - 3);
    y += 2;
  }

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6 Emergency Arrangements", ML, y); y += 4;
  y = para(doc,
    "All accidents must be recorded in the site accident book and reported to Principal Contractor and Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "Emergency arrangements will be as Principal Contractor site induction. In the event of an emergency, incident, or accident all employees must report it to Site manager of Principal Contractor management team along with Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.1 Special First Aid Requirements", ML, y); y += 4;
  y = para(doc,
    "No special first aid requirements are necessary, and the principal contractor will provide suitable first aid provision as per CDM regulations 2015. Information about this will be provided at induction.",
    ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.2 Rescue", ML, y); y += 4;
  y = para(doc,
    "In the event of an incident requiring emergency rescue, all operatives are reminded not to put themselves at risk of harm. Any incident occurring which requires emergency rescue must be judged on its individual risk conditions by the most senior person present.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "If a safe rescue cannot be completed by those in attendance, the emergency services must be informed. Note that whoever informs the emergency services must relay as much information as possible about the incident and site conditions.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc, "Please note all high-risk activities must be accompanied with an individual rescue plan.", ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("7 Temporary Amended Systems", ML, y); y += 4;
  y = para(doc,
    "No amendments are anticipated on site at this stage, but provisions will be made should this become necessary, and the possibility will be at the forefront of our onsite management teams thinking. Any changes to systems will be advised accordingly by Viva Fire in line with the CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8 Responsibilities for Safety Control & Monitoring", ML, y); y += 4;
  y = para(doc, "Work activities will be monitored on a daily basis by site supervision and reviewed accordingly.", ML, y, CONTENT_W);
  y += 1.5;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.1 Persons Responsible", ML, y); y += 4;
  y = para(doc, "Dale Booth.", ML, y, CONTENT_W);
  y += 1.5;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.2 Duties", ML, y); y += 4;
  y = para(doc,
    "Dale Booth will be responsible for overseeing the safe implementation of all Viva Fire works and as well as regular visits to site will provide ongoing assistance and support to the site supervisor.",
    ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 14, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9 Environment Impacts", ML, y); y += 3.5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.1 Waste Handling", ML, y); y += 4;
  y = para(doc, "All waste materials must be disposed of in the correct skips provided by Viva Fire.", ML, y, CONTENT_W); y += 1;
  y = para(doc, "Special care and attention must be taken regarding our environmental impact. If in doubt, ask.", ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "Full cooperation with principal contractor on any environmental issue must be stringently followed at all times in line with Viva Fire environmental policy.",
    ML, y, CONTENT_W);
  y += 1.5;
  y = para(doc, "Viva Fire will manage Waste Streams of COSHH Materials and will complete Principal Contractor Waste Management Form.", ML, y, CONTENT_W);
  y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.2 Water", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.3 Fuel Oils", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.4 Risks of Environmental Contamination", ML, y); y += 4;
  y = para(doc, "None anticipated.", ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10 Briefing Arrangements", ML, y); y += 3.5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.1 Person Responsible", ML, y); y += 4;
  y = para(doc, "Name Dale Booth. Mob 07801269206.", ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.2 Acknowledgement", ML, y); y += 4;
  y = para(doc, "See signatures below.", ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 10, logoImg, currentPage, TOTAL_PAGES);
  if (doc.getNumberOfPages() > currentPage) currentPage++;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("11 Interfaces with Others", ML, y); y += 4;
  y = para(doc, "Ensure co-ordination with other trades at all times to ensure work areas are not congested.", ML, y, CONTENT_W); y += 2;

  pageFooter(doc, currentPage, TOTAL_PAGES);

  /* ─────────────────────────────── RISK TABLE PAGES — dynamic ── */

  const rC = [22, 20, 28, 6, 6, 8, 42, 6, 6, 8, 30];
  const riskTitle = `Risk Assessment — ${coverTitles.subtitle}`;

  const renderRiskPageHeader = (pNum: number) => {
    const yy = newPage(doc);
    pageHeader(doc, logoImg, "", yy).then(() => {}); // fire-and-forget (sync in practice)
    return yy + 21;
  };

  // Render dynamic risk rows across pages
  if (riskRows.length > 0) {
    let ry3 = newPage(doc);
    currentPage++;
    ry3 = await pageHeader(doc, logoImg, "", ry3);
    ry3 += 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
    doc.text(riskTitle, PAGE_W / 2, ry3, { align: "center" }); doc.setTextColor(0, 0, 0); ry3 += 6;

    const siteLocTrunc2 = doc.splitTextToSize(siteLocation, CONTENT_W - 30).slice(0, 1).join("") +
      (doc.splitTextToSize(siteLocation, CONTENT_W - 30).length > 1 ? "…" : "");

    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    labelValue(doc, "Operation/Task:", coverTitles.operationTask, ML, ry3, 28); ry3 += 4.5;
    labelValue(doc, "Employees at Risk:", engineerNames, ML, ry3, 32); ry3 += 4.5;
    labelValue(doc, "Location/Area:", siteLocTrunc2, ML, ry3, 26); ry3 += 4.5;
    labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, ry3, 36); ry3 += 4.5;
    labelValue(doc, "Assessor:", "Dale Booth", ML, ry3, 18); ry3 += 4.5;
    labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, ry3, 46); ry3 += 6;

    ry3 = riskTableHeader(doc, rC, ry3);

    for (const row of riskRows) {
      // Estimate row height
      let estimatedH = RISK_LINE_H + RISK_PAD_V * 2;
      for (let ci = 0; ci < row.length; ci++) {
        const h = cellHeight(doc, row[ci] || "", rC[ci] || 20);
        if (h > estimatedH) estimatedH = h;
      }
      estimatedH = Math.max(estimatedH, RISK_LINE_H + RISK_PAD_V * 2);

      if (ry3 + estimatedH > SAFE_BOTTOM - 10) {
        riskColorLegend(doc, PAGE_H - 58);
        pageFooter(doc, currentPage, TOTAL_PAGES);
        currentPage++;
        ry3 = newPage(doc);
        ry3 = await pageHeader(doc, logoImg, "", ry3);
        ry3 += 2;
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
        doc.text(riskTitle, PAGE_W / 2, ry3, { align: "center" }); doc.setTextColor(0, 0, 0); ry3 += 6;
        doc.setFontSize(8); doc.setFont("helvetica", "normal");
        labelValue(doc, "Operation/Task:", coverTitles.operationTask, ML, ry3, 28); ry3 += 4.5;
        labelValue(doc, "Employees at Risk:", engineerNames, ML, ry3, 32); ry3 += 4.5;
        labelValue(doc, "Location/Area:", siteLocTrunc2, ML, ry3, 26); ry3 += 4.5;
        labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, ry3, 36); ry3 += 4.5;
        labelValue(doc, "Assessor:", "Dale Booth", ML, ry3, 18); ry3 += 4.5;
        labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, ry3, 46); ry3 += 6;
        ry3 = riskTableHeader(doc, rC, ry3);
      }

      ry3 = riskRow(doc, row.map((c, i) => c || ""), rC, ry3, 0, false);
    }

    riskColorLegend(doc, PAGE_H - 58);

    // Assessment detail block at bottom of last risk page
    const detailBlockH = 5 * 8 + 35;
    if (ry3 + detailBlockH > SAFE_BOTTOM) {
      pageFooter(doc, currentPage, TOTAL_PAGES);
      currentPage++;
      ry3 = newPage(doc);
      ry3 = await pageHeader(doc, logoImg, "", ry3);
    }
    ry3 += 4;
    const fieldRowH = 8;
    const labelColW = 55;
    const detailFields: [string, string][] = [
      ["Assessment Date:", datePrepared],
      ["Review Date:", "12 monthly"],
      ["Client:", clientName],
      ["Attendance Date:", attendanceDate],
      ["Copies Issued To:", "(For Contract Specific Use)"],
    ];
    for (const [label, val] of detailFields) {
      doc.rect(ML, ry3, CONTENT_W, fieldRowH);
      doc.rect(ML, ry3, labelColW, fieldRowH);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.text(label, ML + 1, ry3 + 5);
      doc.setFont("helvetica", "normal");
      doc.text(val, ML + labelColW + 2, ry3 + 5);
      ry3 += fieldRowH;
    }
    ry3 += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, ry3); ry3 += 4;
    ry3 = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, ry3, CONTENT_W, 8); ry3 += 3;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, ry3); ry3 += 4;
    ry3 = para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, ry3, CONTENT_W, 8);

    pageFooter(doc, currentPage, TOTAL_PAGES);
  }

  /* ─────────────────────────────── SIGN OFF PAGE ── */
  currentPage++;
  const spY0 = newPage(doc);
  let spy = await pageHeader(doc, logoImg, "", spY0);

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(33, 61, 99);
  doc.text("Method Statement", PAGE_W / 2, spy, { align: "center" }); spy += 6;
  doc.setFontSize(10);
  doc.text("VIVA Fire Protection Ltd – Fire Protection Specialist", PAGE_W / 2, spy, { align: "center" });
  doc.setTextColor(0, 0, 0); spy += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("1.3 Confirmation of operatives briefing.", ML, spy); spy += 4;
  spy = para(doc,
    "The following operatives have read and understood this method statement and risk assessment and are approved to work to this method statement.",
    ML, spy, CONTENT_W);
  spy += 4;

  const sigCols = [CONTENT_W / 3, CONTENT_W / 3, CONTENT_W / 3];
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  let hx = ML;
  for (const [lbl, w] of [["Operative Name", sigCols[0]], ["Signature", sigCols[1]], ["Date", sigCols[2]]] as [string, number][]) {
    doc.setFillColor(...PDF_PALETTE.headerTable); doc.rect(hx, spy, w, 7, "F"); doc.rect(hx, spy, w, 7);
    doc.text(lbl, hx + 2, spy + 4.5);
    hx += w;
  }
  spy += 7;

  const minRows = 8;
  const numRows = Math.max(operatives.length, minRows);
  for (let i = 0; i < numRows; i++) {
    const op = operatives[i];
    spy = signatureRow(doc, op?.name || "", op?.sig || "", op?.date || "", spy);
  }

  spy += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Checking, Reviewing and Updating:", ML, spy); spy += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  spy = para(doc, "1.1 Work activities will be reviewed as programme.", ML, spy, CONTENT_W); spy += 2;
  spy = para(doc, "1.2 Change requirements: Legislation, Work Area, Personnel, Task.", ML, spy, CONTENT_W);
  pageFooter(doc, currentPage, TOTAL_PAGES);

  /* ─────────────────────────────── PERSONNEL & APPROVAL PAGE ── */
  const personnelList: { name: string; role: string; company: string }[] = formData["_personnelList"] || [];
  const approvalF = formData["_approvalFields"] || {};
  const supervisorF = formData["_supervisorFields"] || {};
  const hasPersonnelPage = personnelList.length > 0 || approvalF.approverName || supervisorF.supervisorName;

  if (hasPersonnelPage) {
    currentPage++;
    const ppY0 = newPage(doc);
    let ppy = await pageHeader(doc, logoImg, "", ppY0);

    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(33, 61, 99);
    doc.text("Personnel, Approval & Supervision", ML, ppy); ppy += 8;
    doc.setTextColor(0, 0, 0);

    // Personnel table
    if (personnelList.length > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Personnel on Site", ML, ppy); ppy += 5;
      const colW = [CONTENT_W * 0.35, CONTENT_W * 0.30, CONTENT_W * 0.35];
      const rowH = 7;
      // header
      doc.setFillColor(...PDF_PALETTE.navy); doc.setTextColor(...PDF_PALETTE.navyText);
      let px = ML;
      for (const [lbl, w] of [["Full Name", colW[0]], ["Role / Trade", colW[1]], ["Company", colW[2]]] as [string, number][]) {
        doc.rect(px, ppy, w, rowH, "F"); doc.rect(px, ppy, w, rowH);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
        doc.text(lbl, px + 2, ppy + 4.5);
        px += w;
      }
      ppy += rowH;
      doc.setTextColor(0, 0, 0);
      for (const person of personnelList) {
        let px2 = ML;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
        for (const [val, w] of [[person.name, colW[0]], [person.role, colW[1]], [person.company, colW[2]]] as [string, number][]) {
          doc.rect(px2, ppy, w, rowH);
          doc.text(val || "", px2 + 2, ppy + 4.5);
          px2 += w;
        }
        ppy += rowH;
      }
      ppy += 8;
    }

    // Approval section
    if (approvalF.approverName || approvalF.approverRole) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(33, 61, 99);
      doc.text("RAMS Approval", ML, ppy); ppy += 5;
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      const approvalDetails: [string, string][] = [
        ["Approved By:", approvalF.approverName || ""],
        ["Role / Title:", approvalF.approverRole || ""],
        ["Date:", approvalF.approvalDate || ""],
      ];
      for (const [lbl, val] of approvalDetails) {
        doc.setFont("helvetica", "bold"); doc.text(lbl, ML, ppy);
        doc.setFont("helvetica", "normal"); doc.text(val, ML + 40, ppy);
        ppy += 6;
      }
      if (approvalF.approverSignature) {
        doc.setFont("helvetica", "bold"); doc.text("Signature:", ML, ppy); ppy += 3;
        doc.addImage(approvalF.approverSignature, "PNG", ML, ppy, 60, 18); ppy += 22;
      }
      ppy += 6;
    }

    // Supervisor section
    if (supervisorF.supervisorName || supervisorF.supervisorRole) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(33, 61, 99);
      doc.text("Site Supervisor", ML, ppy); ppy += 5;
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      const supervisorDetails: [string, string][] = [
        ["Supervisor:", supervisorF.supervisorName || ""],
        ["Role / Title:", supervisorF.supervisorRole || ""],
        ["Contact:", supervisorF.supervisorContact || ""],
      ];
      for (const [lbl, val] of supervisorDetails) {
        doc.setFont("helvetica", "bold"); doc.text(lbl, ML, ppy);
        doc.setFont("helvetica", "normal"); doc.text(val, ML + 40, ppy);
        ppy += 6;
      }
      if (supervisorF.supervisorSignature) {
        doc.setFont("helvetica", "bold"); doc.text("Signature:", ML, ppy); ppy += 3;
        doc.addImage(supervisorF.supervisorSignature, "PNG", ML, ppy, 60, 18); ppy += 22;
      }
    }

    pageFooter(doc, currentPage, TOTAL_PAGES);
  }

  // Watermark + Accreditations
  const custAccredUrls = await fetchCustomerAccreditationLogos(jobInfo?.customers?.name || jobInfo?.customer);
  const [watermark, accredLogos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(custAccredUrls),
  ]);
  await renderBrandingOverlay(doc, {
    watermark,
    accredLogos,
    accredFooterY: RAMS_FOOTER_TOP,
    accredLogoH: PDF_DIMENSIONS.accredLogoH,
  });

  const customerName = (jobInfo as any)?.customers?.name || (jobInfo as any)?.customer || (jobInfo as any)?.site?.name || "job";
  const slug = String(customerName).toLowerCase().replace(/[^a-z0-9]+/g, "") || "job";
  const typePrefix = ramsType ? ramsType.replace(/_/g, "").toUpperCase() : "";
  const fileName = `RAMS${typePrefix ? `-${typePrefix}` : ""}-${slug}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1];
  return { base64, fileName };
}

async function sectionH1(doc: jsPDF, y: number, _logo: HTMLImageElement | null, text: string): Promise<number> {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(text, ML, y);
  y += 5;
  return y;
}
