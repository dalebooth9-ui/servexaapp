import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";

export type RamsFormData = Record<string, any>;

interface RamsJobInfo {
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

/* ─────────────────────────────────────────────────────────── helpers ── */

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 14;
const MR = 14;
const CONTENT_W = PAGE_W - ML - MR;

/** Add a new page and return y=top-of-content */
function newPage(doc: jsPDF): number {
  doc.addPage();
  return 18;
}

/** Thin horizontal rule */
function hr(doc: jsPDF, y: number, color = 180): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.2);
  doc.line(ML, y, PAGE_W - MR, y);
}

/** Bold label + normal value on same line */
function labelValue(doc: jsPDF, label: string, value: string, x: number, y: number, labelW = 52): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(value, x + labelW, y);
}

/** Wrapped paragraph */
function para(doc: jsPDF, text: string, x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.352778 + 1.2);
}

/** Section heading – bold, slight colour */
function sectionHeading(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(33, 61, 99);
  doc.text(text, ML, y);
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 1.5, 100);
  return y + 6;
}

/** Numbered list */
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

/** Bullet list */
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

/** Page footer – page number */
function pageFooter(doc: jsPDF, pageNum: number, total: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Page ${pageNum} of ${total}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

/** Render the Vivafire logo header used on every page */
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
  // right-side subtitle stack
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(33, 61, 99);
  doc.text("Pressure Testing Pipework and Associated Fittings", PAGE_W - MR, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Method Statement & Risk Assessment", PAGE_W - MR, y + 10, { align: "right" });
  doc.text("Fire Protection Ltd", PAGE_W - MR, y + 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 17, 60);
  return y + 21;
}

const RISK_FONT_SIZE = 6.5;
// 6.5pt in mm ≈ 2.29mm; add 1.6mm leading
const RISK_LINE_H = 3.9; // fixed mm per line
const RISK_PAD_H = 1.2; // horizontal inner padding mm
const RISK_PAD_V = 1.2; // vertical inner padding mm

/** Split text for a cell using correct font weight so line-count matches render. */
function splitCell(doc: jsPDF, text: string, cw: number, bold = false): string[] {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(RISK_FONT_SIZE);
  return doc.splitTextToSize(text || "", cw - RISK_PAD_H * 2);
}

/** Calculate minimum cell height for text to fit without clipping. */
function cellHeight(doc: jsPDF, text: string, cw: number, bold = false): number {
  const lines = splitCell(doc, text, cw, bold);
  return lines.length * RISK_LINE_H + RISK_PAD_V * 2;
}

/** Draw a single cell: optional fill, border, wrapped text. */
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
    // Place baseline of first line: pad from top + ~75% of line height for ascender
    const textY = cy + RISK_PAD_V + RISK_LINE_H * 0.75;
    doc.text(lines, textX, textY, opts.center ? { align: "center" } : {});
  }
}

/** Risk table data row – auto-height. Pre-R (index 5) and Post-R (index 9) are colour-coded. */
function riskRow(doc: jsPDF, cols: string[], widths: number[], y: number, _rowH: number, bold = false): number {
  // Determine row height from the tallest cell
  let rowH = RISK_LINE_H + RISK_PAD_V * 2;
  for (let i = 0; i < cols.length; i++) {
    const h = cellHeight(doc, cols[i], widths[i], bold);
    if (h > rowH) rowH = h;
  }
  // Minimum: one line + padding
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

/**
 * Two-row merged header for the risk table.
 * Row 1: Activity | Hazard | Risks/Persons | [Pre Control Risk Rating] | Control Measures | [Post Control Risk Rating] | Comments
 * Row 2: (spans)  | (spans)| (spans)       | L | S | R                 | (spans)          | L | S | R                  | (spans)
 * widths: [22, 20, 30, 8, 8, 10, 44, 8, 8, 10, 14]
 */
function riskTableHeader(doc: jsPDF, widths: number[], y: number): number {
  const NAVY: [number,number,number] = [33, 61, 99];
  const WHITE: [number,number,number] = [255, 255, 255];

  // Row 1 height: enough for 2-line labels
  const row1H = RISK_LINE_H * 2 + RISK_PAD_V * 2;
  // Row 2 height: single line
  const row2H = RISK_LINE_H + RISK_PAD_V * 2;

  // Pre group spans cols 3,4,5 — Post group spans cols 7,8,9
  const x0 = ML;
  const x1 = x0 + widths[0];
  const x2 = x1 + widths[1];
  const x3 = x2 + widths[2];  // pre start
  const x4 = x3 + widths[3];
  const x5 = x4 + widths[4];
  const x6 = x5 + widths[5];  // control start
  const x7 = x6 + widths[6];  // post start
  const x8 = x7 + widths[7];
  const x9 = x8 + widths[8];
  const x10 = x9 + widths[9]; // comments start

  const preW = widths[3] + widths[4] + widths[5];
  const postW = widths[7] + widths[8] + widths[9];

  // — Row 1 cells —
  // Spanning cells draw full row1H + row2H height (they span both rows)
  const spanH = row1H + row2H;
  drawCell(doc, "Activity",                x0, y, widths[0], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Hazard",                  x1, y, widths[1], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Risks / Persons at Risk", x2, y, widths[2], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Pre Control\nRisk Rating",x3, y, preW,      row1H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "Control Measures",        x6, y, widths[6], spanH, { fill: NAVY, textColor: WHITE, bold: true });
  drawCell(doc, "Post Control\nRisk Rating",x7, y, postW,    row1H, { fill: NAVY, textColor: WHITE, bold: true, center: true });
  drawCell(doc, "Comments",                x10, y, widths[10], spanH, { fill: NAVY, textColor: WHITE, bold: true });

  // — Row 2 sub-columns (L, S, R under Pre and Post) —
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

/** Render a colour key legend for the risk rating rows */
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

/** Signature line: name, sig image or blank line, date */
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

  // Name cell
  doc.rect(ML, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Name:", ML + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(name || "____________________", ML + 12, y + 4);

  // Signature cell
  doc.rect(ML + colW, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Signature:", ML + colW + 1, y + 4); doc.setFont("helvetica", "normal");
  if (sigData && sigData.startsWith("data:image")) {
    try {
      doc.addImage(sigData, "PNG", ML + colW + 22, y + 1, 25, 9);
    } catch { /* skip */ }
  }

  // Date cell
  doc.rect(ML + colW * 2, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Date:", ML + colW * 2 + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(date || "____________________", ML + colW * 2 + 12, y + 4);

  return y + 14;
}

/* ══════════════════════════════════════════════════════════ main export ══ */

export async function generateRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  assignedEngineers?: { name: string; sig: string; date: string }[]
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Load logo
  let logoImg: HTMLImageElement | null = null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej();
      img.src = "/images/vivafire-logo-new.jpg";
    });
    logoImg = img;
  } catch { /* no logo */ }

  // Extract variable fields from form data
  const contractName = formData["rams_contract_job_name"] || jobInfo?.name || "";
  const datePrepared = formData["rams_assessment_date"] || new Date().toLocaleDateString("en-GB");
  const clientName = formData["rams_client"] || jobInfo?.customers?.name || jobInfo?.customer || "";
  const attendanceDate = formData["rams_attendance_date"] || "";
  const siteLocation = jobInfo?.site?.name
    ? `${jobInfo.site.name}${jobInfo.site.address ? ", " + jobInfo.site.address : ""}`
    : jobInfo?.address || "All areas / locations";

  // Build operatives list: prefer assigned engineers, then fall back to form data
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

  // Build engineer name string for risk table info blocks
  const engineerNames = operatives.length > 0
    ? operatives.map((o) => o.name).filter(Boolean).join(", ")
    : "Viva Fire Operatives";

  /* ───────────────────────────────────────────── PAGE 1 – Cover ───── */
  let y = 20;

  // Big title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(33, 61, 99);
  doc.text("Pressure testing Pipework and associated fittings", PAGE_W / 2, y, { align: "center" });
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
  doc.text("Dry riser Pressure Testing", PAGE_W / 2, y, { align: "center" });
  y += 12;
  doc.setTextColor(0, 0, 0);
  hr(doc, y, 60);
  y += 8;

  // Key details box – measure content first, then draw box to fit exactly
  const rowGap = 7;

  // Build service scope string
  const scopeParts = [
    (jobInfo?.pressure_test_qty ?? 0) > 0 ? `Pressure Test x${jobInfo!.pressure_test_qty}` : null,
    (jobInfo?.visual_qty ?? 0) > 0 ? `Visual x${jobInfo!.visual_qty}` : null,
    (jobInfo?.other_qty ?? 0) > 0 ? `${jobInfo!.other_service_type || "Other"} x${jobInfo!.other_qty}` : null,
  ].filter(Boolean).join("  |  ");

  // Pre-compute review note lines
  doc.setFontSize(8.5);
  const reviewText = "Review date: This method statement and its associated risk assessments will be reviewed on an on-going basis for the duration of the works.";
  const reviewLines = doc.splitTextToSize(reviewText, CONTENT_W - 6);

  // Compute box height by simulating the layout
  const boxY = y;
  let ry = boxY + 7;
  ry += rowGap; // Operation / Task
  // Contract / Job Name — may wrap if long
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const contractLabel = "Contract / Job Name:";
  const contractVal = contractName + (jobInfo?.reference_number ? `  [${jobInfo.reference_number}]` : "");
  const contractLines = doc.splitTextToSize(contractVal, CONTENT_W - 3 - 52);
  ry += Math.max(rowGap, contractLines.length * (9 * 0.352778 + 1.2));
  // Customer row (if present)
  const customerVal = jobInfo?.customers?.name || jobInfo?.customer || "";
  if (customerVal) ry += rowGap;
  ry += rowGap; // Client
  // Address row (if present)
  const addressVal = jobInfo?.site?.address || jobInfo?.address || "";
  if (addressVal) {
    const addrLines = doc.splitTextToSize(addressVal, CONTENT_W - 3 - 52);
    ry += Math.max(rowGap, addrLines.length * (9 * 0.352778 + 1.2));
  }
  if (siteLocation && siteLocation !== "All areas / locations") {
    const siteLines = doc.splitTextToSize(siteLocation, CONTENT_W - 55);
    ry += Math.max(rowGap, siteLines.length * (9 * 0.352778 + 1.2));
  }
  ry += rowGap; // Date Prepared
  if (scopeParts) ry += rowGap; // Service Scope
  if (engineerNames && engineerNames !== "Viva Fire Operatives") {
    const engLines = doc.splitTextToSize(engineerNames, CONTENT_W - 3 - 52);
    ry += Math.max(rowGap, engLines.length * (9 * 0.352778 + 1.2));
  }
  ry += reviewLines.length * (8.5 * 0.352778 + 1.2) + 2; // Review text
  ry += rowGap; // Written by
  ry += rowGap; // Approved by
  const detailBoxH = ry - boxY + 3;

  // Draw the box
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(ML, boxY, CONTENT_W, detailBoxH);

  // Now render the content
  doc.setFontSize(9);
  let ry2 = boxY + 7;
  labelValue(doc, "Operation / Task:", "Pressure testing Pipework and associated fittings.", ML + 3, ry2); ry2 += rowGap;
  // Contract / Job Name with wrapping
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(contractLabel, ML + 3, ry2);
  doc.setFont("helvetica", "normal");
  doc.text(contractLines, ML + 3 + 52, ry2);
  ry2 += Math.max(rowGap, contractLines.length * (9 * 0.352778 + 1.2));
  // Customer (if present)
  if (customerVal) {
    labelValue(doc, "Customer:", customerVal, ML + 3, ry2); ry2 += rowGap;
  }
  labelValue(doc, "Client:", clientName, ML + 3, ry2); ry2 += rowGap;
  // Address (if present)
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
  labelValue(doc, "Method Statement Written by:", "Martin Whatmough", ML + 3, ry2); ry2 += rowGap;
  labelValue(doc, "Method Statement Approved by:", "Dale Booth", ML + 3, ry2);

  y = boxY + detailBoxH + 8;

  y = await sectionH1(doc, y, logoImg, "1 Introduction");
  y = para(doc,
    "This Method Statement describes the specific safe working methods which will be used to carry out the work. It gives details of how the work will be carried out and what health and safety issues and controls are involved. The content of this Method Statement reflects the finding of the relevant Risk Assessment(s).",
    ML, y, CONTENT_W);
  y += 4;

  y = await sectionH1(doc, y, logoImg, "2 Description of Work");
  y = para(doc, "Commissioning tests of Dry Riser systems", ML, y, CONTENT_W);
  y += 3;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Time", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Site Working Hours:", ML, y); y += 4;
  y = bulletList(doc, [
    "Monday to Friday: 6:00am to 8:00pm",
    "Saturday: 8:00am to 12:30pm",
    "Sunday: None (Inc. Bank Holidays)"
  ], ML + 3, y, CONTENT_W - 3);
  y = para(doc, "Any additional hours will need to be approved by main contractor.", ML, y + 1, CONTENT_W);
  y += 3;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.1 Duration", ML, y); y += 5;
  y = para(doc,
    "All works will be supervised at every stage by a competent qualified supervisor. Martin Whatmough will be responsible for the day-to-day supervision of Viva Fire Protection personnel and sub-contractors on site.",
    ML, y, CONTENT_W);
  y += 2;
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.text("Name: Dale Booth   Mob: 07801269206   Email: sales@vivafire.co.uk", ML, y); y += 4.5;
  doc.text("Name: Martin Whatmough   Mob: 07989436509   Email: martin.whatmough@vivafire.co.uk", ML, y); y += 6;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.2 Sequence of Operations", ML, y); y += 5;
  y = numberedList(doc, [
    "All working personnel must have received site Induction from Principal Contractor and Viva Fire the first day of attending, the operatives will also receive a RAMs briefing from the Viva Fire site supervisor following the site induction from Principal Contractor before works commence.",
    "Personnel will be required to sign in via main security. Then into the Viva Fire Daily Sign in register.",
    "All working personnel must be able to demonstrate they have the correct skill set/certification before works commence.",
    "A common appreciation of plant and pedestrians (who retain priority) must be observed and followed before moving about site.",
    "All deliveries of materials must be pre booked with Principal Contractor with 48 hours' notice given.",
  ], ML + 2, y, CONTENT_W - 2);

  pageFooter(doc, 1, 10);

  /* ───────────────────────────────────────────── PAGE 2 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.3 Task Specific Sequence of Operations", ML, y); y += 5;
  y = numberedList(doc, [
    "Check available timeslots for deliveries in the site office, with assessment of what is being delivered, what it weights, how will it be unloaded, what kind of materials are being delivered, how will it be stored, where will it be stored, do any special precautions need to be taken, will mechanical lifting aids need to be used. All deliveries will be supervised by main contractor Competent Banksman, and the delivery drivers must remain in vehicle if they do not have suitable PPE.",
    "The delivery vehicle must deploy hazard lights/flashing beacon and any audible warning system if fitted. Extra care must be taken at this time and a suitable safe zone placed around the delivery vehicle/delivery area.",
    "All personnel must be familiar and competent with manual handling techniques and never lift beyond personnel capability. If in doubt, ask and refer to risk assessment included on page 14/15. The materials being used on this job are not envisaged to require mechanical lifting assistance.",
    "Proceed to the work area and carry out a site safety check with regards the working area. Remove any debris or obstructions with the express permission of Viva Fire.",
    "Set up working area in an agreed and safe position after consultation with Viva Fire site supervisor/manager.",
    "Testing of the systems will be in accordance with BS9990 2006.",
    "Hydraulic testing/commissioning will be applied on all pipework for a period of 15 minutes at a pressure of 12 Bar, water to be made freely available by the main contractor.",
    "Access for a vehicle carrying tank and all testing equipment will be needed close to the dry riser inlet locations.",
    "Operative to agree with site supervisor testing parameters and testing durations before test begins.",
    "Operative and supervisor to check calibration certification of tester to be used.",
    "Operatives to visually check all pipework, joints and brackets before testing begins.",
    "Operative to monitor the test from a safe area.",
    "Pressure tests to be witnessed by client's representative and/or main contractors' representative and upon satisfactory completion, a test/commissioning report and certificate will be issued.",
    "Pressure to be removed from system after agreed time and witnessed by a third party.",
    "Test water to be drained off into suitable location determined by supervisor.",
    "Leave work area clean and tidy.",
    "Move to next area.",
    "Repeat Process.",
  ], ML + 2, y, CONTENT_W - 2);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.4 Location", ML, y); y += 4;
  y = para(doc, "Block's / Stair cores / Dry Risers", ML, y, CONTENT_W); y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.5 Access and Egress", ML, y); y += 4;
  y = para(doc,
    "Access and egress must be kept open to site at all times for authorised personnel. All Principal Contractor rules regarding access and egress must be followed by Viva Fire operatives and sub-contractors at all times whilst on site with no deviation being permitted. All Viva Fire personnel and sub-contractors must make themselves familiar with site rules and entrance/exit points at induction and ensure they sign in and out at all times, whilst always being vigilant and report any potential problems immediately to site management.",
    ML, y, CONTENT_W);
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3 Resources", ML, y); y += 4;
  y = para(doc, "Minimum of: 2 Operatives", ML, y, CONTENT_W); y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.1 Personnel", ML, y); y += 4;
  y = para(doc, "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith, James Ogg", ML, y, CONTENT_W);
  pageFooter(doc, 2, 10);

  /* ───────────────────────────────────────────── PAGE 3 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.2 Supervision", ML, y); y += 4;
  y = para(doc, "NAME AND CONTACT: Mr Martin Whatmough (SSSTS), Tel: 07989436509", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.3 Plant and Equipment", ML, y); y += 4;
  y = bulletList(doc, [
    "Hand Tools",
    "65mm hoses.",
    "Portable ex-fire service pump, petrol.",
    "1000L water tank.",
    "Hydrant stand pipe and hydrant key.",
    "16 bar Pressure gauge test arrangement.",
  ], ML + 3, y, CONTENT_W - 3);
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4 Assessment of Significant Risks for all Tasks", ML, y); y += 4;
  y = numberedList(doc, [
    "High Pressure", "Water", "Bursting", "Manual Handling", "Collisions",
    "Cuts to hands", "Noise", "Slips/trips/falls", "Other Trades", "Deliveries to site"
  ], ML + 2, y, CONTENT_W / 2 - 2);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.1 COSHH", ML, y); y += 4;
  y = para(doc, "N/A", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.2 Security", ML, y); y += 4;
  y = para(doc,
    "Site security will be Principal Contractor responsibility but all Viva Fire personnel and sub-contractors on site must play their part and cooperate fully. They must also keep all equipment/tools safe and secure.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.3 Special Training", ML, y); y += 4;
  y = para(doc, "SSSTS - Martin Whatmough", ML, y, CONTENT_W); y += 1;
  y = para(doc, "All operatives have current JIB (CSCS) working safely (inclusive of behavioural safety Module)", ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "All Viva Fire on site personnel and Sub-contractors have current CSCS cards and the necessary trade specific training to carry out their working tasks safely and professionally.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "When Viva Fire on site personnel have been allocated for the works, all operatives will produce CSCS card at the time of the induction on site.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.4 References to Environmental Aspects and Impacts Register control measures.", ML, y); y += 4;
  y = para(doc, "N/A.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("5 PPE", ML, y); y += 4;
  y = bulletList(doc, [
    "Hard Hat EN397",
    "High Visibility Vest EN471",
    "Steel Toe Cap/Mid Sole Boots EN20345",
    "Gloves CE4131",
    "Glasses EN166",
    "Goggles EN166",
  ], ML + 3, y, CONTENT_W - 3);
  pageFooter(doc, 3, 10);

  /* ───────────────────────────────────────────── PAGE 4 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6 Emergency Arrangements", ML, y); y += 4;
  y = para(doc,
    "All accidents must be recorded in the site accident book and reported to Principal Contractor and Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "Emergency arrangements will be as Principal Contractor site induction. In the event of an emergency, incident, or accident all employees must report it to Site manager of Principal Contractor management team along with Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.1 Special First Aid Requirements", ML, y); y += 4;
  y = para(doc,
    "No special first aid requirements are necessary, and the principal contractor will provide suitable first aid provision as per CDM regulations 2015. Information about this will be provided at induction.",
    ML, y, CONTENT_W);
  y += 3;
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
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("7 Temporary Amended Systems", ML, y); y += 4;
  y = para(doc,
    "No amendments are anticipated on site at this stage, but provisions will be made should this become necessary, and the possibility will be at the forefront of our onsite management teams thinking. Any changes to systems will be advised accordingly by Viva Fire in line with the CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8 Responsibilities for Safety Control & Monitoring", ML, y); y += 4;
  y = para(doc, "Work activities will be monitored on a daily basis by site supervision and reviewed accordingly.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.1 Persons Responsible", ML, y); y += 4;
  y = para(doc, "Dale Booth & Martin Whatmough.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.2 Duties", ML, y); y += 4;
  y = para(doc,
    "Dale Booth will be responsible for overseeing the safe implementation of all Viva Fireworks and as well as regular visits to site will provide ongoing assistance and support to Martin Whatmough, Viva Fire supervisor.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc, "He will carry out safety inspections of Viva Fire on site activities and approve all safe systems of work if they need to change. To monitor work activities on a daily basis.", ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9 Environment Impacts", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.1 Waste Handling", ML, y); y += 4;
  y = para(doc, "All waste materials must be disposed of in the correct skips provided by Viva Fire.", ML, y, CONTENT_W); y += 1;
  y = para(doc, "Special care and attention must be taken regarding our environmental impact. If in doubt, ask.", ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "Full cooperation with principal contractor on any environmental issue must be stringently followed at all times in line with Viva Fire environmental policy.",
    ML, y, CONTENT_W);
  pageFooter(doc, 4, 10);

  /* ───────────────────────────────────────────── PAGE 5 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y = para(doc, "Viva Fire will manage Waste Streams of COSHH Materials and will complete Principal Contractor Waste Management Form.", ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.2 Water", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.3 Fuel Oils", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.4 Risks of Environmental Contamination", ML, y); y += 4;
  y = para(doc, "None anticipated.", ML, y, CONTENT_W); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10 Briefing Arrangements", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.1 Person Responsible", ML, y); y += 4;
  y = para(doc, "Name Dale Booth. Mob 07801269206.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.2 Acknowledgement", ML, y); y += 4;
  y = para(doc, "See signatures below.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("11 Interfaces with Others", ML, y); y += 4;
  y = para(doc, "Ensure co-ordination with other trades at all times to ensure work areas are not congested.", ML, y, CONTENT_W); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("12. Coronavirus/COVID 19", ML, y); y += 4;
  const covidItems = [
    "Extra hygiene measures to be taken into consideration e.g. wash hands regularly throughout the working day for a minimum of 20 seconds at a time.",
    "RPE to be sourced/worn.",
    "Safety gloves to be either washed or disposed of after every working day.",
    "Isolated travel arrangements, if possible, to mitigate the risk of using public transport and potential spread of virus.",
    "Operatives to ensure they have recently signed up to company health declaration.",
    "If any operative shows coronavirus symptoms (dry persistent coughing, high temperature, sweating etc) then they must leave site immediately informing their supervisor via telephone, go home and self-isolate.",
    "Government enforced social distancing rule of 2 metres between all operatives must be adhered to by all.",
  ];
  for (let i = 0; i < covidItems.length; i++) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`12.${i + 1}`, ML, y); y += 4;
    y = para(doc, covidItems[i], ML + 8, y - 1, CONTENT_W - 8);
    y += 1;
  }
  pageFooter(doc, 5, 10);

  /* ───────────────────────────────────────────── PAGE 6 – Risk Table 1 ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 2;

  const riskTitle = "Risk Assessment for Pressure testing Pipework and associated fittings";
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, PAGE_W / 2, y, { align: "center" }); doc.setTextColor(0,0,0); y += 6;

  // Info block
  const infoColW = CONTENT_W / 2;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  const siteLocTrunc = doc.splitTextToSize(siteLocation, CONTENT_W - 30).slice(0, 1).join("") + (doc.splitTextToSize(siteLocation, CONTENT_W - 30).length > 1 ? "…" : "");
  labelValue(doc, "Operation/Task:", "Riser Testing & Commissioning", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;

  // Column widths summing to CONTENT_W (182mm):
  // Activity(22) Hazard(20) Risks(28) PreL(6) PreS(6) PreR(8) Controls(42) PostL(6) PostS(6) PostR(8) Comments(30) = 182
  const rC = [22, 20, 28, 6, 6, 8, 42, 6, 6, 8, 30];
  y = riskTableHeader(doc, rC, y);

  // Page 6 rows — [Activity, Hazard, Risks, PreL, PreS, PreR, Controls, PostL, PostS, PostR, Comments]
  y = riskRow(doc, [
    "Pressure pipework testing",
    "Burst pipework",
    "Operatives being injured by flying materials and fixings. Operatives or bystanders being injured by pressure from water burst. Abrasive particles causing eye injuries. Health hazards from exposure to water and associated particles.",
    "1","2","2",
    "Only trained and competent operative to use pressure test gauge - gauge to be calibrated and cert checked. HES site supervisor to witness test procedure and HES operative to check all pipework connections and joints before test.",
    "2","5","10",
    ""
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "Main BCW from riser to clusters 16bar",
    "Operatives being injured by flying materials and fixings",
    "Operatives being injured by flying materials and fixings. Operatives or bystanders being injured by pressure from water burst. Abrasive particles causing eye injuries. Health hazards from exposure to water and associated particles.",
    "5","5","25",
    "Only trained and competent operative to use pressure test gauge - gauge to be calibrated and cert checked. HES site supervisor to witness test procedure and HES operative to check all pipework connections and joints before test.",
    "2","5","10",
    ""
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "All tasks",
    "Lone Working",
    "Potential to suffer injury and be isolated/left unaided with injuries",
    "5","6","30",
    "Employees to work in pairs where possible. There will be no lone working for work at higher levels. If an operative is left alone they will not carry out any high risk activity until their work partner returns.",
    "2","5","10",
    "Whilst lone working is not envisaged, if this should occur an individual activity related risk assessment must be carried out."
  ], rC, y, 0, false);

  riskColorLegend(doc, PAGE_H - 18);
  pageFooter(doc, 6, 10);

  /* ───────────────────────────────────────────── PAGE 7 – Risk Table 2 ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, PAGE_W / 2, y, { align: "center" }); doc.setTextColor(0,0,0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Riser Testing & Commissioning", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;

  y = riskTableHeader(doc, rC, y);

  y = riskRow(doc, [
    "All tasks",
    "Incompetence/Wrong use of tool/defective tool",
    "Eye Injury/Lacerations to hands/Various",
    "1","2","2",
    "Tools must be visually inspected prior to use, tools must be fit for the purpose, tools must be entered on the PUWER register.",
    "1","2","2",
    "Correct PPE must be worn: Safety goggles and Gloves. Power tools must be PAT tested, and used in conjunction with a HAV assessment."
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "Noise emitted from work activities, such as running the portable fire engine.",
    "Noise",
    "Damage to hearing, deafness, tinnitus.",
    "4","5","20",
    "Noise shall be reduced to lowest level possible. All operatives must wear hearing defenders for operating the engine and if any associated contractors are working nearby that are generating any significant noise.",
    "2","3","6",
    "Lower exposure action value is 80dB(A) LEPd. Upper 85dB(A) LEPd. Limit 87dB(A) LEPd. Any significant noises must be reported to principal contractor immediately."
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "All tasks",
    "Incompetence/poor housekeeping",
    "Various including slips/trips/falls",
    "4","6","24",
    "All site personnel to be competent to perform the tasks they are asked to do. Compliance with Site/Managers' Rules. Skills/competencies as per Company Health & Safety Policy.",
    "1","5","5",
    "Good housekeeping helps keep safe sites. Never walk on by if you see materials or tools in your walkway, if it is safe to move do so."
  ], rC, y, 0, false);

  riskColorLegend(doc, PAGE_H - 18);
  pageFooter(doc, 7, 10);

  /* ───────────────────────────────────────────── PAGE 8 – Risk Table 3 ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, PAGE_W / 2, y, { align: "center" }); doc.setTextColor(0,0,0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Riser Testing & Commissioning", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;

  y = riskTableHeader(doc, rC, y);

  y = riskRow(doc, [
    "All tasks",
    "Handling materials/tools with sharp edges",
    "Cuts/lacerations to hands and body and potential back injuries",
    "5","7","35",
    "All operatives to wear necessary PPE whilst handling materials or tools with sharp edges. Always read method statement and never deviate from safe system of work. Supervisor to inspect work areas. Attention should be paid to contractors leaving sharp edges or materials inadequately protected. Deploy good manual handling.",
    "2","7","14",
    ""
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "All tasks",
    "Moving plant/traffic/pedestrians",
    "Collision with plant/vehicles. Struck by moving materials.",
    "5","7","35",
    "Traffic/pedestrian routes to be clearly defined and followed. Short cuts must never be taken. Vehicles/plant should all have Banksmen on site. Never load/unload vehicles unless trained to do so. Operatives to have had full site induction. All site rules to be followed at all times.",
    "2","7","14",
    "All operatives to keep up to date with site changes regarding pedestrian routes."
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "All tasks",
    "Working adjacent other trades",
    "Contact with/being struck by electrical operations, manual handling, vehicle movements, working at height etc.",
    "5","7","35",
    "Close liaison with other contractors. Daily project briefs between contractors. Particular attention must be paid to noise, dust, delivery schedules, common PPE standards. Co-ordination of activities to ensure the safety of all persons. Control of jointly managed access routes. Adherence to Site Rules. Site Inductions.",
    "2","5","10",
    ""
  ], rC, y, 0, false);

  riskColorLegend(doc, PAGE_H - 18);
  pageFooter(doc, 8, 10);

  /* ───────────────────────────────────────────── PAGE 9 – Risk Table 4 (Human Factors + Manual Handling) ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, PAGE_W / 2, y, { align: "center" }); doc.setTextColor(0,0,0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Riser Testing & Commissioning", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Other nearby contractors", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;

  y = riskTableHeader(doc, rC, y);

  y = riskRow(doc, [
    "Human Factors: Capabilities and Behavioural Safety",
    "Inappropriate behaviour",
    "Activity may exceed capability of personnel.",
    "1","2","2",
    "Site induction for management team to reinforce safe site behaviour/conduct. Competent Supervisor (SSSTS) to be highly visible, observing behaviour and activities undertaken by personnel and identify and control higher risk operations as appropriate to individual physical and psychological capability.",
    "2","2","4",
    "All working personnel to embrace change and are encouraged to re-evaluate working practices as per IOSH behavioural safety training."
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "Activity exceeds capability of personnel",
    "Lack of competency",
    "Inappropriate equipment for personnel, over familiarisation and complacency. Young workers lacking correct perception of hazard and risk; older workers not embracing change regarding safe systems of work.",
    "3","5","15",
    "Daily inspections by foremen. Method systems of working established and reconciled with programme to minimise conflict of activities. Always clear your own mess up, and if a contractor has left you a messy work area report it. All PPE provided shall be of appropriate size and fitting for the individual.",
    "2","2","4",
    "Prior to commencement of work on site all employees to have CSCS Cards, trade specific training, IOSH working safely (Behavioural Safety Module)."
  ], rC, y, 0, false);

  y = riskRow(doc, [
    "Manual handling / Ergonomic operations",
    "Moving, pulling, pushing of tools, equipment and materials",
    "Musculoskeletal disorders and other injuries.",
    "1","2","2",
    "All operatives must have manual handling training and deploy good manual handling techniques at all times. Never lift beyond personal capability. If a mechanical aid is required, a suitable lifting plan should be put together. Consider: task, load shape/size/weight, individual capabilities, and environment. Appropriate PPE to be worn including gloves and kneepads.",
    "2","5","10",
    "Additional information can be found on Handling Assessment Charts (MAC) on the HSE website www.hse.gov.uk/msd."
  ], rC, y, 0, false);

  y += 4;
  y = para(doc,
    "Tasks and activities will be undertaken in accordance with ergonomic principles and individual characteristics such as age, strength, personality traits e.g. maturity. Higher complex tasks shall be proportionately led by, and distributed to, more experienced operatives.",
    ML, y, CONTENT_W, 8);
  y += 5;

  // Assessment detail fields — ensure enough space (5 rows × 8mm + ~30mm for ratings)
  const detailBlockH = 5 * 8 + 35;
  if (y + detailBlockH > PAGE_H - 22) {
    pageFooter(doc, 9, 10);
    y = newPage(doc);
    y = await pageHeader(doc, logoImg, "", y);
  }

  doc.setDrawColor(180); doc.setLineWidth(0.3);
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
  y = para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  riskColorLegend(doc, PAGE_H - 18);
  pageFooter(doc, 9, 10);

  /* ───────────────────────────────────────────── PAGE 10 – Sign Off ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(33, 61, 99);
  doc.text("Method Statement", PAGE_W / 2, y, { align: "center" }); y += 6;
  doc.setFontSize(10);
  doc.text("VIVA Fire Protection Ltd – Wet and Dry Riser Specialist", PAGE_W / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0); y += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("1.3 Confirmation of operatives briefing.", ML, y); y += 4;
  y = para(doc,
    "The following operatives have read and understood this method statement and risk assessment and are approved to work to this method statement.",
    ML, y, CONTENT_W);
  y += 4;

  // Table header
  const sigCols = [CONTENT_W / 3, CONTENT_W / 3, CONTENT_W / 3];
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  let hx = ML;
  for (const [lbl, w] of [["Operative Name", sigCols[0]], ["Signature", sigCols[1]], ["Date", sigCols[2]]] as [string, number][]) {
    doc.rect(hx, y, w, 7);
    doc.setFillColor(230, 230, 230); doc.rect(hx, y, w, 7, "F"); doc.rect(hx, y, w, 7);
    doc.text(lbl, hx + 2, y + 4.5);
    hx += w;
  }
  y += 7;

  // Filled operative rows or blank rows
  const minRows = 8;
  const numRows = Math.max(operatives.length, minRows);
  for (let i = 0; i < numRows; i++) {
    const op = operatives[i];
    y = signatureRow(doc, op?.name || "", op?.sig || "", op?.date || "", y);
  }

  y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Checking, Reviewing and Updating:", ML, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  y = para(doc, "1.1 Work activities will be reviewed as programme.", ML, y, CONTENT_W); y += 2;
  y = para(doc, "1.2 Change requirements: Legislation, Work Area, Personnel, Task.", ML, y, CONTENT_W);
  pageFooter(doc, 10, 10);

  // Watermark
  const watermark = await loadWatermarkImage();
  if (watermark) addWatermarkToAllPages(doc, watermark);

  const ref = jobInfo?.reference_number || "rams";
  const fileName = `${ref}-rams-method-statement.pdf`;
  const base64 = doc.output("datauristring").split(",")[1];
  return { base64, fileName };
}

/** Helper shim so pages can call a consistent "section heading" function */
async function sectionH1(doc: jsPDF, y: number, _logo: HTMLImageElement | null, text: string): Promise<number> {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(text, ML, y);
  y += 5;
  return y;
}
