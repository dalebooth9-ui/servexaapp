/**
 * ramsPdfBase.ts
 * Shared helpers for all RAMS PDF generators.
 * Import these into ramsPdf.ts (dry riser) and ramsPdfVariants.ts.
 */
import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";
import { loadAccreditationLogos, addAccreditationLogosToAllPages } from "@/lib/pdfAccreditations";

export type RamsFormData = Record<string, any>;

export interface RamsJobInfo {
  reference_number?: string;
  name?: string | null;
  customer?: string | null;
  customers?: { name: string } | null;
  address?: string | null;
  site?: { name: string; address: string | null } | null;
  pressure_test_qty?: number;
  visual_qty?: number;
  other_qty?: number;
  other_service_type?: string | null;
}

/* ─────────────────────────────────────── constants ── */
export const PAGE_W = 210;
export const PAGE_H = 297;
export const ML = 14;
export const MR = 14;
export const CONTENT_W = PAGE_W - ML - MR;
export const SAFE_BOTTOM = PAGE_H - 20;

export const RISK_FONT_SIZE = 6.5;
export const RISK_LINE_H = 3.9;
export const RISK_PAD_H = 1.2;
export const RISK_PAD_V = 1.2;

/* ─────────────────────────────────────── basic helpers ── */

export function newPage(doc: jsPDF): number {
  doc.addPage();
  return 18;
}

export function hr(doc: jsPDF, y: number, color = 180): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.2);
  doc.line(ML, y, PAGE_W - MR, y);
}

export function labelValue(doc: jsPDF, label: string, value: string, x: number, y: number, labelW = 52): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(value, x + labelW, y);
}

export function para(doc: jsPDF, text: string, x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.352778 + 1.2);
}

export function sectionHeading(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(33, 61, 99);
  doc.text(text, ML, y);
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 1.5, 100);
  return y + 6;
}

export function numberedList(doc: jsPDF, items: string[], x: number, y: number, maxW: number, size = 8.5): number {
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

export function bulletList(doc: jsPDF, items: string[], x: number, y: number, maxW: number, size = 8.5): number {
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

export function pageFooter(doc: jsPDF, pageNum: number, total: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Page ${pageNum} of ${total}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

export async function pageHeader(
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  subtitle: string,
  y: number
): Promise<number> {
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
  doc.text(subtitle || "Method Statement & Risk Assessment", PAGE_W - MR, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Method Statement & Risk Assessment", PAGE_W - MR, y + 10, { align: "right" });
  doc.text("Fire Protection Ltd", PAGE_W - MR, y + 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 17, 60);
  return y + 21;
}

export async function checkPageBreak(
  doc: jsPDF,
  y: number,
  neededMm: number,
  logoImg: HTMLImageElement | null,
  pageNum: number,
  totalPages: number,
  subtitle = ""
): Promise<number> {
  if (y + neededMm > SAFE_BOTTOM) {
    pageFooter(doc, pageNum, totalPages);
    y = newPage(doc);
    y = await pageHeader(doc, logoImg, subtitle, y);
  }
  return y;
}

/* ─────────────────────────────────────── risk table ── */

export function splitCell(doc: jsPDF, text: string, cw: number, bold = false): string[] {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(RISK_FONT_SIZE);
  return doc.splitTextToSize(text || "", cw - RISK_PAD_H * 2);
}

export function cellHeight(doc: jsPDF, text: string, cw: number, bold = false): number {
  const lines = splitCell(doc, text, cw, bold);
  return lines.length * RISK_LINE_H + RISK_PAD_V * 2;
}

export function drawCell(
  doc: jsPDF,
  text: string,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  opts: { fill?: [number, number, number]; textColor?: [number, number, number]; bold?: boolean; center?: boolean } = {}
): void {
  if (opts.fill) {
    doc.setFillColor(...opts.fill);
    doc.rect(cx, cy, cw, ch, "F");
  }
  doc.setDrawColor(80);
  doc.setLineWidth(0.2);
  doc.rect(cx, cy, cw, ch);
  if (text) {
    doc.setTextColor(...((opts.textColor ?? [0, 0, 0]) as [number, number, number]));
    const lines = splitCell(doc, text, cw, opts.bold);
    const textX = opts.center ? cx + cw / 2 : cx + RISK_PAD_H;
    const textY = cy + RISK_PAD_V + RISK_LINE_H * 0.75;
    doc.text(lines, textX, textY, opts.center ? { align: "center" } : {});
  }
}

export function riskRow(
  doc: jsPDF,
  cols: string[],
  widths: number[],
  y: number,
  _rowH: number,
  bold = false
): number {
  let rowH = RISK_LINE_H + RISK_PAD_V * 2;
  for (let i = 0; i < cols.length; i++) {
    const h = cellHeight(doc, cols[i], widths[i], bold);
    if (h > rowH) rowH = h;
  }
  rowH = Math.max(rowH, RISK_LINE_H + RISK_PAD_V * 2);

  const NAVY: [number, number, number] = [33, 61, 99];
  const WHITE: [number, number, number] = [255, 255, 255];
  const ratingCols = new Set([5, 9]);

  let x = ML;
  for (let i = 0; i < cols.length; i++) {
    let fill: [number, number, number] | undefined = bold ? NAVY : undefined;
    const textColor: [number, number, number] = bold ? WHITE : [0, 0, 0];

    if (!bold && ratingCols.has(i)) {
      const num = parseInt((cols[i] || "").trim(), 10);
      if (!isNaN(num)) {
        if (num >= 15) fill = [255, 80, 80];
        else if (num >= 8) fill = [255, 165, 0];
        else if (num >= 4) fill = [255, 230, 0];
        else fill = [0, 180, 0];
      }
    }

    drawCell(doc, cols[i], x, y, widths[i], rowH, { fill, textColor, bold, center: ratingCols.has(i) });
    x += widths[i];
  }

  doc.setTextColor(0, 0, 0);
  return y + rowH;
}

export function riskTableHeader(doc: jsPDF, widths: number[], y: number): number {
  const NAVY: [number, number, number] = [33, 61, 99];
  const WHITE: [number, number, number] = [255, 255, 255];

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
  drawCell(doc, "Activity",                 x0,  y, widths[0],  spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Hazard",                   x1,  y, widths[1],  spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Risks / Persons at Risk",  x2,  y, widths[2],  spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Pre Control\nRisk Rating", x3,  y, preW,       row1H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "Control Measures",         x6,  y, widths[6],  spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Post Control\nRisk Rating",x7,  y, postW,      row1H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "Comments",                 x10, y, widths[10], spanH, { fill: NAVY, textColor: WHITE, bold: true });

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

export function riskColorLegend(doc: jsPDF, y: number): number {
  const legendItems = [
    { label: "High Risk (≥15)",       r: 255, g: 80,  b: 80  },
    { label: "Medium Risk (8–14)",    r: 255, g: 165, b: 0   },
    { label: "Low-Medium Risk (4–7)", r: 255, g: 230, b: 0   },
    { label: "Low Risk (<4)",         r: 0,   g: 180, b: 0   },
  ];
  const boxW = 8, boxH = 4, gap = 2, itemW = 44;
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

export function signatureRow(
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
    try { doc.addImage(sigData, "PNG", ML + colW + 22, y + 1, 25, 9); } catch { /* skip */ }
  }

  doc.rect(ML + colW * 2, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Date:", ML + colW * 2 + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(date || "____________________", ML + colW * 2 + 12, y + 4);

  return y + 14;
}

/* ─────────────────────────────────────── logo loader ── */

export async function loadLogoImage(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej();
      img.src = "/images/vivafire-logo-new.jpg";
    });
    return img;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────── cover page builder ── */

export interface CoverPageOptions {
  title1: string;   // e.g. "Sprinkler System Inspection & Servicing"
  title2: string;   // e.g. "Dry Riser Pressure Testing"
  operationTask: string;
}

export async function buildCoverPage(
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  opts: CoverPageOptions,
  assignedEngineers: { name: string; sig: string; date: string }[]
): Promise<{
  y: number;
  contractName: string;
  datePrepared: string;
  clientName: string;
  attendanceDate: string;
  siteLocation: string;
  engineerNames: string;
  operatives: { name: string; sig: string; date: string }[];
}> {
  const contractName = formData["rams_contract_job_name"] || jobInfo?.name || "";
  const datePrepared = formData["rams_assessment_date"] || new Date().toLocaleDateString("en-GB");
  const clientName = formData["rams_client"] || jobInfo?.customers?.name || jobInfo?.customer || "";
  const attendanceDate = formData["rams_attendance_date"] || "";
  const siteLocation = jobInfo?.site?.name
    ? `${jobInfo.site.name}${jobInfo.site.address ? ", " + jobInfo.site.address : ""}`
    : jobInfo?.address || "All areas / locations";

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

  let y = 20;

  // Cover titles
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(33, 61, 99);
  doc.text(opts.title1, PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(22);
  doc.text("VIVA FIRE", PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(13);
  doc.text("Method Statement & Risk Assessment", PAGE_W / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(14);
  doc.text("Fire Protection Ltd", PAGE_W / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(13);
  doc.text(opts.title2, PAGE_W / 2, y, { align: "center" });
  y += 12;
  doc.setTextColor(0, 0, 0);
  hr(doc, y, 60);
  y += 8;

  const rowGap = 7;

  const scopeParts = [
    (jobInfo?.pressure_test_qty ?? 0) > 0 ? `Pressure Test x${jobInfo!.pressure_test_qty}` : null,
    (jobInfo?.visual_qty ?? 0) > 0 ? `Visual x${jobInfo!.visual_qty}` : null,
    (jobInfo?.other_qty ?? 0) > 0 ? `${jobInfo!.other_service_type || "Other"} x${jobInfo!.other_qty}` : null,
  ].filter(Boolean).join("  |  ");

  doc.setFontSize(8.5);
  const reviewText = "Review date: This method statement and its associated risk assessments will be reviewed on an on-going basis for the duration of the works.";
  const reviewLines = doc.splitTextToSize(reviewText, CONTENT_W - 6);

  const boxY = y;
  let ry = boxY + 7;
  ry += rowGap;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const contractLabel = "Contract / Job Name:";
  const contractVal = contractName + (jobInfo?.reference_number ? `  [${jobInfo.reference_number}]` : "");
  const contractLines = doc.splitTextToSize(contractVal, CONTENT_W - 3 - 52);
  ry += Math.max(rowGap, contractLines.length * (9 * 0.352778 + 1.2));
  const customerVal = jobInfo?.customers?.name || jobInfo?.customer || "";
  if (customerVal) ry += rowGap;
  const addressVal = jobInfo?.site?.address || jobInfo?.address || "";
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
  const detailBoxH = ry - boxY + 3;

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(ML, boxY, CONTENT_W, detailBoxH);

  doc.setFontSize(9);
  let ry2 = boxY + 7;
  labelValue(doc, "Operation / Task:", opts.operationTask, ML + 3, ry2); ry2 += rowGap;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(contractLabel, ML + 3, ry2);
  doc.setFont("helvetica", "normal");
  doc.text(contractLines, ML + 3 + 52, ry2);
  ry2 += Math.max(rowGap, contractLines.length * (9 * 0.352778 + 1.2));
  if (customerVal) { labelValue(doc, "Customer:", customerVal, ML + 3, ry2); ry2 += rowGap; }
  if (addressVal) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Address:", ML + 3, ry2);
    doc.setFont("helvetica", "normal");
    const addrLines = doc.splitTextToSize(addressVal, CONTENT_W - 3 - 52);
    doc.text(addrLines, ML + 3 + 52, ry2);
    ry2 += Math.max(rowGap, addrLines.length * (9 * 0.352778 + 1.2));
  }
  if (siteLocation && siteLocation !== "All areas / locations") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Site / Location:", ML + 3, ry2);
    doc.setFont("helvetica", "normal");
    const siteLines = doc.splitTextToSize(siteLocation, CONTENT_W - 55);
    doc.text(siteLines, ML + 3 + 52, ry2);
    ry2 += Math.max(rowGap, siteLines.length * (9 * 0.352778 + 1.2));
  }
  labelValue(doc, "Date Prepared / Revision:", datePrepared, ML + 3, ry2); ry2 += rowGap;
  if (scopeParts) { labelValue(doc, "Service Scope:", scopeParts, ML + 3, ry2); ry2 += rowGap; }
  if (engineerNames && engineerNames !== "Viva Fire Operatives") {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Assigned Engineers:", ML + 3, ry2);
    doc.setFont("helvetica", "normal");
    const engLines = doc.splitTextToSize(engineerNames, CONTENT_W - 3 - 52);
    doc.text(engLines, ML + 3 + 52, ry2);
    ry2 += Math.max(rowGap, engLines.length * (9 * 0.352778 + 1.2));
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text(reviewLines, ML + 3, ry2);
  ry2 += reviewLines.length * (8.5 * 0.352778 + 1.2) + 2;
  doc.setFontSize(9);
  labelValue(doc, "Method Statement Written by:", "Martin Whatmough", ML + 3, ry2); ry2 += rowGap;
  labelValue(doc, "Method Statement Approved by:", "Dale Booth", ML + 3, ry2);

  y = boxY + detailBoxH + 8;

  return { y, contractName, datePrepared, clientName, attendanceDate, siteLocation, engineerNames, operatives };
}

/* ─────────────────────────────────────── sign-off page ── */

export async function buildSignOffPage(
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  operatives: { name: string; sig: string; date: string }[],
  serviceTitle: string,
  pageNum: number,
  totalPages: number
): Promise<void> {
  newPage(doc);
  await pageHeader(doc, logoImg, "", 18);
  let y = 39;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(33, 61, 99);
  doc.text("Method Statement", PAGE_W / 2, y, { align: "center" }); y += 6;
  doc.setFontSize(10);
  doc.text(`VIVA Fire Protection Ltd – ${serviceTitle}`, PAGE_W / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0); y += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("1.3 Confirmation of operatives briefing.", ML, y); y += 4;
  y = para(doc,
    "The following operatives have read and understood this method statement and risk assessment and are approved to work to this method statement.",
    ML, y, CONTENT_W);
  y += 4;

  const sigCols = [CONTENT_W / 3, CONTENT_W / 3, CONTENT_W / 3];
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  let hx = ML;
  for (const [lbl, w] of [["Operative Name", sigCols[0]], ["Signature", sigCols[1]], ["Date", sigCols[2]]] as [string, number][]) {
    doc.setFillColor(230, 230, 230); doc.rect(hx, y, w, 7, "F"); doc.rect(hx, y, w, 7);
    doc.text(lbl, hx + 2, y + 4.5);
    hx += w;
  }
  y += 7;

  const numRows = Math.max(operatives.length, 8);
  for (let i = 0; i < numRows; i++) {
    const op = operatives[i];
    y = signatureRow(doc, op?.name || "", op?.sig || "", op?.date || "", y);
  }

  y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Checking, Reviewing and Updating:", ML, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  y = para(doc, "1.1 Work activities will be reviewed as programme.", ML, y, CONTENT_W); y += 2;
  para(doc, "1.2 Change requirements: Legislation, Work Area, Personnel, Task.", ML, y, CONTENT_W);
  pageFooter(doc, pageNum, totalPages);
}

/* ─────────────────────────────────────── risk page renderer ── */

export interface RiskPageData {
  title: string;
  operationTask: string;
  engineerNames: string;
  siteLocTrunc: string;
  rows: string[][];
}

export async function buildRiskPage(
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  data: RiskPageData,
  pageNum: number,
  totalPages: number,
  rC: number[]
): Promise<void> {
  // Reserve 18mm for colour legend + footer at bottom
  const RISK_SAFE_BOTTOM = PAGE_H - 26;

  const renderHeader = async (isNewPage: boolean) => {
    if (isNewPage) {
      pageFooter(doc, pageNum, totalPages);
      newPage(doc);
      await pageHeader(doc, logoImg, "", 18);
    } else {
      await pageHeader(doc, logoImg, "", 18);
    }
    let hy = 39;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
    doc.text(data.title, PAGE_W / 2, hy, { align: "center" }); doc.setTextColor(0, 0, 0); hy += 6;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    labelValue(doc, "Operation/Task:", data.operationTask, ML, hy, 28); hy += 4.5;
    labelValue(doc, "Employees at Risk:", data.engineerNames, ML, hy, 32); hy += 4.5;
    labelValue(doc, "Location/Area:", data.siteLocTrunc, ML, hy, 26); hy += 4.5;
    labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, hy, 36); hy += 4.5;
    labelValue(doc, "Assessor:", "Dale Booth", ML, hy, 18); hy += 4.5;
    labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, hy, 46); hy += 6;
    return riskTableHeader(doc, rC, hy);
  };

  newPage(doc);
  let y = await renderHeader(false);

  for (const row of data.rows) {
    // Estimate row height before drawing
    let rowH = RISK_LINE_H + RISK_PAD_V * 2;
    for (let i = 0; i < row.length; i++) {
      const h = cellHeight(doc, row[i], rC[i], false);
      if (h > rowH) rowH = h;
    }
    // If this row won't fit, start a new page with repeated header
    if (y + rowH > RISK_SAFE_BOTTOM) {
      riskColorLegend(doc, PAGE_H - 18);
      y = await renderHeader(true);
    }
    y = riskRow(doc, row, rC, y, 0, false);
  }

  riskColorLegend(doc, PAGE_H - 18);
  pageFooter(doc, pageNum, totalPages);
}

/* ─────────────────────────────────────── final detail block ── */

export async function buildDetailBlock(
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  datePrepared: string,
  clientName: string,
  attendanceDate: string,
  pageNum: number,
  totalPages: number
): Promise<void> {
  const detailBlockH = 5 * 8 + 35;
  let y = 0;

  // We add this block to the last risk page; ensure space
  newPage(doc);
  await pageHeader(doc, logoImg, "", 18);
  y = 39;

  const fieldRowH = 8;
  const labelColW = 55;
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  const detailFields: [string, string][] = [
    ["Assessment Date:", datePrepared],
    ["Review Date:", "12 monthly"],
    ["Client:", clientName],
    ["Attendance Date:", attendanceDate],
    ["Copies Issued To:", "(For Contract Specific Use)"],
  ];
  for (const [label, val] of detailFields) {
    doc.rect(ML, y, CONTENT_W, fieldRowH);
    doc.rect(ML, y, labelColW, fieldRowH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(label, ML + 1, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(val, ML + labelColW + 2, y + 5);
    y += fieldRowH;
  }
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, y); y += 4;
  y = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, y, CONTENT_W, 8); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, y); y += 4;
  para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  riskColorLegend(doc, PAGE_H - 18);
  pageFooter(doc, pageNum, totalPages);
}

/* ─────────────────────────────────────── shared method statement body sections ── */

export async function buildSharedMethodSections(
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  sections: {
    descriptionOfWork: string;
    sequenceOfOps: string[];
    taskSpecificOps: string[];
    location: string;
    resources: string;
    personnel: string;
    plantAndEquipment: string[];
    significantRisks: string[];
    specialTraining: string;
  },
  currentPageRef: { num: number },
  totalPages: number
): Promise<number> {
  const paraH = (text: string, maxW: number, size = 8.5): number => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW);
    return lines.length * (size * 0.352778 + 1.2);
  };

  let y = 39; // after header on page 1

  // ─── Section 1 Introduction ───
  y = await checkPageBreak(doc, y, 10, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("1 Introduction", ML, y); y += 5;
  y = para(doc,
    "This Method Statement describes the specific safe working methods which will be used to carry out the work. It gives details of how the work will be carried out and what health and safety issues and controls are involved. The content of this Method Statement reflects the finding of the relevant Risk Assessment(s).",
    ML, y, CONTENT_W);
  y += 4;

  // ─── Section 2 Description ───
  y = await checkPageBreak(doc, y, 10, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("2 Description of Work", ML, y); y += 5;
  y = para(doc, sections.descriptionOfWork, ML, y, CONTENT_W); y += 3;

  // ─── Site Working Hours ───
  y = await checkPageBreak(doc, y, 20, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Time", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Site Working Hours:", ML, y); y += 4;
  y = bulletList(doc, [
    "Monday to Friday: 6:00am to 8:00pm",
    "Saturday: 8:00am to 12:30pm",
    "Sunday: None (Inc. Bank Holidays)"
  ], ML + 3, y, CONTENT_W - 3);
  y = para(doc, "Any additional hours will need to be approved by main contractor.", ML, y + 1, CONTENT_W);
  y += 3;

  // ─── 2.1 Duration ───
  y = await checkPageBreak(doc, y, 25, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.1 Duration", ML, y); y += 5;
  y = para(doc,
    "All works will be supervised at every stage by a competent qualified supervisor. Martin Whatmough will be responsible for the day-to-day supervision of Viva Fire Protection personnel and sub-contractors on site.",
    ML, y, CONTENT_W);
  y += 2;
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.text("Name: Dale Booth   Mob: 07801269206   Email: sales@vivafire.co.uk", ML, y); y += 4.5;
  doc.text("Name: Martin Whatmough   Mob: 07989436509   Email: martin.whatmough@vivafire.co.uk", ML, y); y += 6;

  // ─── 2.2 Sequence ───
  y = await checkPageBreak(doc, y, 40, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.2 Sequence of Operations", ML, y); y += 5;
  y = numberedList(doc, sections.sequenceOfOps, ML + 2, y, CONTENT_W - 2);
  y += 3;

  // ─── 2.3 Task Specific ───
  y = await checkPageBreak(doc, y, 40, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.3 Task Specific Sequence of Operations", ML, y); y += 5;
  y = numberedList(doc, sections.taskSpecificOps, ML + 2, y, CONTENT_W - 2);
  y += 3;

  y = await checkPageBreak(doc, y, 20, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.4 Location", ML, y); y += 4;
  y = para(doc, sections.location, ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 20, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.5 Access and Egress", ML, y); y += 4;
  y = para(doc,
    "Access and egress must be kept open to site at all times for authorised personnel. All Principal Contractor rules regarding access and egress must be followed by Viva Fire operatives at all times.",
    ML, y, CONTENT_W);
  y += 4;

  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3 Resources", ML, y); y += 4;
  y = para(doc, sections.resources, ML, y, CONTENT_W); y += 2;

  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.1 Personnel", ML, y); y += 4;
  y = para(doc, sections.personnel, ML, y, CONTENT_W);
  pageFooter(doc, currentPageRef.num, totalPages);

  // ─── Continue on next page ───
  currentPageRef.num++;
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  y = await checkPageBreak(doc, y, 12, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.2 Supervision", ML, y); y += 4;
  y = para(doc, "NAME AND CONTACT: Mr Martin Whatmough (SSSTS), Tel: 07989436509", ML, y, CONTENT_W); y += 3;

  y = await checkPageBreak(doc, y, 20 + sections.plantAndEquipment.length * 6, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.3 Plant and Equipment", ML, y); y += 4;
  y = bulletList(doc, sections.plantAndEquipment, ML + 3, y, CONTENT_W - 3);
  y += 4;

  y = await checkPageBreak(doc, y, 20 + sections.significantRisks.length * 5, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4 Assessment of Significant Risks for all Tasks", ML, y); y += 4;
  y = numberedList(doc, sections.significantRisks, ML + 2, y, CONTENT_W / 2 - 2);
  y += 3;

  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.1 COSHH", ML, y); y += 4;
  y = para(doc, "N/A", ML, y, CONTENT_W); y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.2 Security", ML, y); y += 4;
  y = para(doc,
    "Site security will be Principal Contractor responsibility but all Viva Fire personnel and sub-contractors on site must play their part and cooperate fully.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 22, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.3 Special Training", ML, y); y += 4;
  y = para(doc, sections.specialTraining, ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "All Viva Fire on site personnel and sub-contractors have current CSCS cards and the necessary trade specific training to carry out their working tasks safely and professionally.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 35, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("5 PPE", ML, y); y += 4;
  y = bulletList(doc, [
    "Hard Hat EN397",
    "High Visibility Vest EN471",
    "Steel Toe Cap/Mid Sole Boots EN20345",
    "Gloves CE4131",
    "Glasses EN166",
    "Goggles EN166",
  ], ML + 3, y, CONTENT_W - 3);
  pageFooter(doc, currentPageRef.num, totalPages);

  // ─── Continue on next page ───
  currentPageRef.num++;
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6 Emergency Arrangements", ML, y); y += 4;
  y = para(doc,
    "All accidents must be recorded in the site accident book and reported to Principal Contractor and Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "Emergency arrangements will be as Principal Contractor site induction. In the event of an emergency, incident, or accident all employees must report it to Site manager.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.1 Special First Aid Requirements", ML, y); y += 4;
  y = para(doc,
    "No special first aid requirements are necessary, and the principal contractor will provide suitable first aid provision as per CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.2 Rescue", ML, y); y += 4;
  y = para(doc,
    "In the event of an incident requiring emergency rescue, all operatives are reminded not to put themselves at risk of harm. If a safe rescue cannot be completed, the emergency services must be informed.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("7 Temporary Amended Systems", ML, y); y += 4;
  y = para(doc,
    "No amendments are anticipated on site at this stage. Any changes to systems will be advised by Viva Fire in line with CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 30, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8 Responsibilities for Safety Control & Monitoring", ML, y); y += 4;
  y = para(doc, "Work activities will be monitored on a daily basis by site supervision.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.1 Persons Responsible", ML, y); y += 4;
  y = para(doc, "Dale Booth & Martin Whatmough.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.2 Duties", ML, y); y += 4;
  y = para(doc,
    "Dale Booth will be responsible for overseeing the safe implementation of all Viva Fire works and as well as regular visits to site will provide ongoing assistance and support to Martin Whatmough.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 22, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9 Environment Impacts", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.1 Waste Handling", ML, y); y += 4;
  y = para(doc, "All waste materials must be disposed of in the correct skips provided by Viva Fire.", ML, y, CONTENT_W);
  pageFooter(doc, currentPageRef.num, totalPages);

  // ─── Continue on next page ───
  currentPageRef.num++;
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  y = para(doc, "Viva Fire will manage Waste Streams of COSHH Materials and complete Principal Contractor Waste Management Form.", ML, y, CONTENT_W);
  y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.2 Water", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.3 Fuel Oils", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 25, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10 Briefing Arrangements", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.1 Person Responsible", ML, y); y += 4;
  y = para(doc, "Name Dale Booth. Mob 07801269206.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.2 Acknowledgement", ML, y); y += 4;
  y = para(doc, "See signatures below.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("11 Interfaces with Others", ML, y); y += 4;
  y = para(doc, "Ensure co-ordination with other trades at all times to ensure work areas are not congested.", ML, y, CONTENT_W); y += 4;
  y = await checkPageBreak(doc, y, 40, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("12. Health, Hygiene & Welfare", ML, y); y += 4;
  y = bulletList(doc, [
    "Wash hands regularly throughout the working day for a minimum of 20 seconds.",
    "RPE to be sourced and worn where required.",
    "Safety gloves to be either washed or disposed of after every working day.",
    "If any operative shows signs of illness, they must leave site and inform their supervisor.",
    "Government enforced social distancing rules must be adhered to by all.",
  ], ML + 3, y, CONTENT_W - 3);
  pageFooter(doc, currentPageRef.num, totalPages);

  currentPageRef.num++;
  return y;
}

/* ─────────────────────────────────────── full generator helper ── */

export async function finaliseAndReturn(

  y = await checkPageBreak(doc, y, 20 + sections.plantAndEquipment.length * 6, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.3 Plant and Equipment", ML, y); y += 4;
  y = bulletList(doc, sections.plantAndEquipment, ML + 3, y, CONTENT_W - 3);
  y += 4;

  y = await checkPageBreak(doc, y, 20 + sections.significantRisks.length * 5, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4 Assessment of Significant Risks for all Tasks", ML, y); y += 4;
  y = numberedList(doc, sections.significantRisks, ML + 2, y, CONTENT_W / 2 - 2);
  y += 3;

  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.1 COSHH", ML, y); y += 4;
  y = para(doc, "N/A", ML, y, CONTENT_W); y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.2 Security", ML, y); y += 4;
  y = para(doc,
    "Site security will be Principal Contractor responsibility but all Viva Fire personnel and sub-contractors on site must play their part and cooperate fully.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 22, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.3 Special Training", ML, y); y += 4;
  y = para(doc, sections.specialTraining, ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "All Viva Fire on site personnel and sub-contractors have current CSCS cards and the necessary trade specific training to carry out their working tasks safely and professionally.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 35, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("5 PPE", ML, y); y += 4;
  y = bulletList(doc, [
    "Hard Hat EN397",
    "High Visibility Vest EN471",
    "Steel Toe Cap/Mid Sole Boots EN20345",
    "Gloves CE4131",
    "Glasses EN166",
    "Goggles EN166",
  ], ML + 3, y, CONTENT_W - 3);
  pageFooter(doc, currentPageRef.num, totalPages);

  // ─── PAGE 4 ───
  currentPageRef.num++;
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6 Emergency Arrangements", ML, y); y += 4;
  y = para(doc,
    "All accidents must be recorded in the site accident book and reported to Principal Contractor and Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "Emergency arrangements will be as Principal Contractor site induction. In the event of an emergency, incident, or accident all employees must report it to Site manager.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.1 Special First Aid Requirements", ML, y); y += 4;
  y = para(doc,
    "No special first aid requirements are necessary, and the principal contractor will provide suitable first aid provision as per CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.2 Rescue", ML, y); y += 4;
  y = para(doc,
    "In the event of an incident requiring emergency rescue, all operatives are reminded not to put themselves at risk of harm. If a safe rescue cannot be completed, the emergency services must be informed.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 18, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("7 Temporary Amended Systems", ML, y); y += 4;
  y = para(doc,
    "No amendments are anticipated on site at this stage. Any changes to systems will be advised by Viva Fire in line with CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 30, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8 Responsibilities for Safety Control & Monitoring", ML, y); y += 4;
  y = para(doc, "Work activities will be monitored on a daily basis by site supervision.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.1 Persons Responsible", ML, y); y += 4;
  y = para(doc, "Dale Booth & Martin Whatmough.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.2 Duties", ML, y); y += 4;
  y = para(doc,
    "Dale Booth will be responsible for overseeing the safe implementation of all Viva Fire works and as well as regular visits to site will provide ongoing assistance and support to Martin Whatmough.",
    ML, y, CONTENT_W);
  y += 3;

  y = await checkPageBreak(doc, y, 22, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9 Environment Impacts", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.1 Waste Handling", ML, y); y += 4;
  y = para(doc, "All waste materials must be disposed of in the correct skips provided by Viva Fire.", ML, y, CONTENT_W);
  pageFooter(doc, currentPageRef.num, totalPages);

  // ─── PAGE 5 ───
  currentPageRef.num++;
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  y = para(doc, "Viva Fire will manage Waste Streams of COSHH Materials and complete Principal Contractor Waste Management Form.", ML, y, CONTENT_W);
  y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.2 Water", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.3 Fuel Oils", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 25, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10 Briefing Arrangements", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.1 Person Responsible", ML, y); y += 4;
  y = para(doc, "Name Dale Booth. Mob 07801269206.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.2 Acknowledgement", ML, y); y += 4;
  y = para(doc, "See signatures below.", ML, y, CONTENT_W); y += 3;
  y = await checkPageBreak(doc, y, 15, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("11 Interfaces with Others", ML, y); y += 4;
  y = para(doc, "Ensure co-ordination with other trades at all times to ensure work areas are not congested.", ML, y, CONTENT_W); y += 4;
  y = await checkPageBreak(doc, y, 40, logoImg, currentPageRef.num, totalPages);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("12. Health, Hygiene & Welfare", ML, y); y += 4;
  y = bulletList(doc, [
    "Wash hands regularly throughout the working day for a minimum of 20 seconds.",
    "RPE to be sourced and worn where required.",
    "Safety gloves to be either washed or disposed of after every working day.",
    "If any operative shows signs of illness, they must leave site and inform their supervisor.",
    "Government enforced social distancing rules must be adhered to by all.",
  ], ML + 3, y, CONTENT_W - 3);
  pageFooter(doc, currentPageRef.num, totalPages);

  currentPageRef.num++;
  return y;
}

/* ─────────────────────────────────────── full generator helper ── */

export async function finaliseAndReturn(
  doc: jsPDF,
  jobInfo: RamsJobInfo | null,
  suffix: string
): Promise<{ base64: string; fileName: string }> {
  const [watermark, accredLogos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(),
  ]);
  if (watermark) addWatermarkToAllPages(doc, watermark);
  addAccreditationLogosToAllPages(doc, accredLogos, 280, 14); // above page-number footer
  const ref = jobInfo?.reference_number || "rams";
  const fileName = `${ref}-${suffix}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1];
  return { base64, fileName };
}
