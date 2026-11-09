/**
 * Viva paper-form renderer for blank Dry/Wet Riser, Hydrant and Sprinkler
 * inspection sheets.
 *
 * Faithfully replicates Viva's long-standing paper site sheet — dense
 * two-column question/answer table, full BS-referenced question text
 * (labels printed verbatim, never shortened), sectioned bold header rows,
 * left-hand Customer/Site block with right-hand stacked details, and a
 * fixed footer stack (ISSUES/RECOMMENDATION/PRIORITY writing space,
 * dual signature strips, compliance sentence, accreditation logos).
 *
 * Used INSTEAD of the generic blank-template renderer for the templates
 * matched by `isPaperFormTemplate`. Everything else falls back to the
 * generic path in `blankTemplatePdf.worker.ts`.
 */
import jsPDF from "jspdf";
import {fitAccessLines} from '@/lib/siteAccessPdf';
import type { PdfTemplateField } from "@/lib/pdfBody";
import { drawQr, stickerUrl } from '@/lib/riserStickers';
import { printName, printInspectionDate, printInspectionType, printInspectionResult } from '@/lib/printText';
import { siteDetailLines } from '@/lib/siteDetailsPrint';

export type LoadedImage = {
  dataUrl: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG";
  /** Visible ink bounds as image-height ratios; transparent padding is excluded. */
  visibleTop?: number;
  visibleBottom?: number;
};

export type PaperFormJobInfo = {
  engineerAccess?:import('@/lib/siteAccessPdf').EngineerAccessPrint|null;
  customers?: { name: string } | null;
  customer?: string | null;
  reference_number?: string;
  customer_po?: string | null;
  engineers?: string[];
  due_date?: string | null;
  address?: string | null;
  printNotes?: string | null;
  riserVisit?: Record<string, any> | null;
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

export type PaperFormRenderOpts = {
  template: {
    name: string;
    fields: PdfTemplateField[];
    branding?: { company_subtitle?: string };
  };
  jobInfo: PaperFormJobInfo | null | undefined;
  logo: LoadedImage | null;
  accreditationLogos: LoadedImage[];
  /** Print without any pre-filled data (blank stock). */
  handfill: boolean;
  brandColor?:[number,number,number];
};

/** Templates that render with the paper-form layout. */
export function isPaperFormTemplate(name: string): boolean {
  const n = (name || "").toLowerCase();
  return (
    /dry\s*riser/.test(n)
    || /wet\s*riser/.test(n)
    || /hydrant/.test(n)
    || /sprinkler/.test(n)
  );
}

/** Field IDs to skip from the body because they render in the header/footer. */
function skipInBody(field: PdfTemplateField): boolean {
  const label = field.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
  const id = field.id.toLowerCase();
  if (label === "customer" || label === "customer name" || label === "client name" || label.includes("customer details") || label === "customer name") return true;
  if (label === "site" || label === "site name" || label === "site address" || label === "address" || label.includes("site details") || label.includes("site info")) return true;
  if (label.includes("postcode") || label.includes("post code")) return true;
  if (label === "po number" || label.includes("po/ref") || label.includes("reference") || label.includes("job ref") || label.includes("order number")) return true;
  if (label === "date" || label.includes("inspection date") || label.includes("service date") || label.includes("visit date")) return true;
  if (label.includes("engineer") || label.includes("technician name") || label.includes("operative")) return true;
  if (label.includes("riser location") || label.includes("riser loc")) return true;
  if (label.includes("cabinet key")) return true;
  if (label.includes("scope of work") || label === "scope") return true;
  if (label === "comments" || label.includes("comments") || label.includes("defects") || label.includes("issues found") || label.includes("recommendation") || label === "priority") return true;
  if (label.includes("customer signature") || label.includes("engineer signature") || label.includes("technician signature")) return true;
  if (field.type === "signature") return true;
  // Note: "number of outlets" used to be inlined into the landing valve row.
  // It now renders as its own dedicated body row (paper form parity request).
  return false;
}

/** Best-effort match for the "landing valve condition" row so we can inline
 *  the NO OF OUTLETS: ____ callout alongside it, exactly as the paper form. */
function isLandingValveRow(f: PdfTemplateField): boolean {
  const l = f.label.toLowerCase();
  return l.includes("landing valve") && (l.includes("condition") || l.includes("good"));
}

function isCleanTidyRow(f: PdfTemplateField): boolean {
  const l = f.label.toLowerCase();
  return l.includes("clean") && (l.includes("tidy") || l.includes("condition"));
}

function isDropLegRow(f: PdfTemplateField): boolean {
  const l = f.label.toLowerCase();
  return l.includes("drop leg") || (l.includes("drain") && l.includes("valve"));
}

function derivedScopeLine(templateName: string): string {
  const n = templateName.toLowerCase();
  if (/dry\s*riser/.test(n)) {
    if (/pressure\s*test/.test(n)) return "SCOPE OF WORK: ANNUAL PRESSURE TEST";
    if (/visual/.test(n)) return "SCOPE OF WORK: 6 MONTHLY VISUAL INSPECTION";
    if (/commission/.test(n)) return "SCOPE OF WORK: COMMISSIONING";
    return `SCOPE OF WORK: ${templateName.toUpperCase()}`;
  }
  if (/wet\s*riser/.test(n)) {
    if (/pressure\s*test/.test(n)) return "SCOPE OF WORK: ANNUAL PRESSURE TEST";
    if (/visual/.test(n)) return "SCOPE OF WORK: 6 MONTHLY VISUAL INSPECTION";
    return `SCOPE OF WORK: ${templateName.toUpperCase()}`;
  }
  if (/hydrant/.test(n)) {
    if (/flow/.test(n)) return "SCOPE OF WORK: ANNUAL FLOW TEST";
    return "SCOPE OF WORK: FIRE HYDRANT INSPECTION";
  }
  if (/sprinkler/.test(n)) {
    if (/annual/.test(n)) return "SCOPE OF WORK: ANNUAL SPRINKLER INSPECTION (BS EN 12845)";
    if (/weekly/.test(n)) return "SCOPE OF WORK: WEEKLY SPRINKLER CHECK";
    if (/monthly/.test(n)) return "SCOPE OF WORK: MONTHLY SPRINKLER CHECK";
    if (/quarterly/.test(n)) return "SCOPE OF WORK: QUARTERLY SPRINKLER CHECK";
    return `SCOPE OF WORK: ${templateName.toUpperCase()}`;
  }
  return `SCOPE OF WORK: ${templateName.toUpperCase()}`;
}

function complianceSentence(templateName: string): string {
  const n = templateName.toLowerCase();
  // Dry riser sheets use exact declaration wording per job type. Visual
  // sheets must never mention pressure, bar or minutes.
  if (/dry\s*riser/.test(n)) {
    if (/pressure\s*test/.test(n)) {
      return "We have, today, carried out a dry riser pressure test to the requirements of BS 9990:2015 at 12 bar for 15 minutes.";
    }
    if (/visual/.test(n)) {
      return "We have, today, carried out a dry riser visual inspection to the requirements of BS 9990:2015.";
    }
  }
  const asset = /dry\s*riser/.test(n)
    ? "dry riser"
    : /wet\s*riser/.test(n)
    ? "wet riser"
    : /hydrant/.test(n)
    ? "fire hydrant"
    : /sprinkler/.test(n)
    ? "sprinkler system"
    : "system";
  const activity = /pressure\s*test/.test(n)
    ? "pressure test"
    : /flow/.test(n)
    ? "flow test"
    : /commission/.test(n)
    ? "commissioning"
    : "visual inspection";
  const standard = /sprinkler/.test(n) ? "BS EN 12845" : "BS 9990:2015";
  return `We have, today, carried out a ${asset} ${activity} to the requirements of ${standard}`;
}

/** Draw multi-line text inside a box, top-aligned. Returns lines drawn. */
function drawWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH: number,
  maxLines: number,
): number {
  const lines = (doc.splitTextToSize(text || "", maxWidth) as string[]).slice(0, maxLines);
  lines.forEach((ln, i) => doc.text(ln, x, y + i * lineH));
  return lines.length;
}

type Row = {
  field: PdfTemplateField;
  attachOutlets?: boolean;
};

/** Options rendering for the answer cell. Prints options separated by " / "
 *  for the engineer to circle, following the paper-form convention. Handles
 *  every option-carrying field type shape seen across org templates —
 *  including custom types (radio/single_choice/multi_choice/dropdown) and
 *  templates that store options under `choices`/`values` instead of
 *  `options`. Returns "" for free-text/number/date fields — the renderer
 *  draws a ruled writing line for those instead. */
function answerCellText(field: PdfTemplateField): string {
  const type = (field.type || "").toLowerCase().replace(/[-\s]+/g, "_");
  if (type === "pass_fail" || type === "passfail") return "PASS / FAIL / N/A";
  if (type === "yes_no" || type === "yesno" || type === "boolean" || type === "toggle") {
    return "YES / NO / N/A";
  }
  // Checkboxes on legacy templates are actually YES/NO questions.
  if (type === "checkbox") return "YES / NO / N/A";
  const anyF = field as any;
  const rawOpts: unknown = anyF.options ?? anyF.choices ?? anyF.values ?? anyF.answer_options;
  if (Array.isArray(rawOpts) && rawOpts.length > 0) {
    const upper = rawOpts
      .map((o) => (typeof o === "string" ? o : o?.label ?? o?.value ?? String(o ?? "")).toString().trim().toUpperCase())
      .filter(Boolean);
    if (upper.length > 0) {
      const hasNa = upper.some((o) => o === "N/A" || o === "NA");
      const withNa = field.allow_na && !hasNa ? [...upper, "N/A"] : upper;
      return withNa.join(" / ");
    }
  }
  return "";
}

/** Free-text-style fields render as a ruled writing line in the answer cell
 *  rather than option text — engineers write directly on the sheet. */
function isWritingLineField(field: PdfTemplateField): boolean {
  const t = (field.type || "").toLowerCase().replace(/[-\s]+/g, "_");
  return [
    "text",
    "short_text",
    "textarea",
    "long_text",
    "number",
    "integer",
    "decimal",
    "date",
    "date_picker",
    "datetime",
    "time",
    "email",
    "phone",
  ].includes(t);
}

/**
 * Render one full paper-form page (single template instance). Content is
 * fitted to a single A4 page by adaptive row sizing. Riser sheets retain
 * a readable 8pt body minimum; no sheet adds a continuation page.
 */
export function renderPaperFormPage(
  doc: jsPDF,
  opts: PaperFormRenderOpts,
): void {
  const { template, jobInfo, logo, accreditationLogos, handfill } = opts;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // Long templates get tighter margins so the sheet stays on one A4 page.
  const bodyCount = template.fields.filter((f) => !skipInBody(f)).length;
  const isRiserInspection = /(?:dry|wet)\s*riser/i.test(template.name) && /pressure\s*test|visual/i.test(template.name);
  const isRiserPressure = isRiserInspection && /pressure\s*test/i.test(template.name);
  // Print-only omission: leave template definitions and recorded readings intact.
  const bodyFields = template.fields.filter((f) => !skipInBody(f) && !(isRiserPressure && (
    ['test_pressure_bar', 'hold_time_minutes'].includes(f.id.toLowerCase()) ||
    /^(?:test pressure\s*\(bar\)|hold time\s*\(minutes\))\s*:?$/i.test(f.label.trim())
  )) && !(isRiserInspection && /^\s*general\s*$/i.test(f.section || "General")));
  const margin = bodyCount > 30 ? 6 : bodyCount > 24 ? 8 : 10;
  const maxWidth = pageWidth - margin * 2;
  const visit = jobInfo?.riserVisit;

  // ─── HEADER ────────────────────────────────────────────────────────
  // Keep the logo's drawn dimensions unchanged. Its visible ink starts 5mm
  // from the top on riser sheets, excluding transparent source-image padding.
  const logoTop = isRiserInspection ? 5 : margin;
  const logoScale = isRiserInspection ? 2.5 : 1;
  const logoMaxH = (bodyCount > 30 ? 16 : bodyCount > 24 ? 19 : 22) * logoScale;
  // Centred logo stops before the right-hand QR, even with wide company logos.
  const logoMaxW = isRiserInspection ? Math.min(70 * logoScale, pageWidth - 2 * (margin + 26)) : 70;
  let cursorY = logoTop;
  let riserLogoVisibleBottom: number | null = null;
  if (logo) {
    const aspect = logo.width / logo.height;
    let lw = logoMaxH * aspect;
    let lh = logoMaxH;
    if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
    const visibleTop = isRiserInspection ? (logo.visibleTop ?? 0) : 0;
    const visibleBottom = isRiserInspection ? (logo.visibleBottom ?? 1) : 1;
    const imageTop = logoTop - lh * visibleTop;
    doc.addImage(logo.dataUrl, logo.format, (pageWidth - lw) / 2, imageTop, lw, lh);
    riserLogoVisibleBottom = imageTop + lh * visibleBottom;
    cursorY = isRiserInspection ? riserLogoVisibleBottom : logoTop + lh + 2;
  } else {
    cursorY = logoTop + 12;
  }
  // Keep room above the details box for the riser QR + "Riser ID" caption.
  if (visit?.asset_tag && !isRiserInspection) cursorY = Math.max(cursorY, 28);

  // Bold underlined SCOPE OF WORK line.
  const scopeText = derivedScopeLine(template.name);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  const scopeW = doc.getTextWidth(scopeText);
  const scopeX = (pageWidth - scopeW) / 2;
  // 12pt Helvetica cap height puts the visible title 3.5mm below the logo ink.
  const riserScopeBaselineOffset = riserLogoVisibleBottom !== null ? 3.5 + 12 * 0.352777778 * 0.72 : 3.5;
  const scopeY = cursorY + (isRiserInspection ? riserScopeBaselineOffset : 5);
  doc.text(scopeText, scopeX, scopeY);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(scopeX, scopeY + 1.2, scopeX + scopeW, scopeY + 1.2);
  cursorY = scopeY + (isRiserInspection ? 2.5 : 4);

  // ─── DETAILS TABLE ─────────────────────────────────────────────────
  // LEFT: Customer/Site Details (multi-line, ~55% wide)
  // RIGHT stacked: [DATE | PO NUMBER], [RISER LOCATION], [CABINET KEYS]
  const detailsTop = cursorY;
  const leftW = maxWidth * 0.55;
  const rightW = maxWidth - leftW;
  const rightX = margin + leftW;
  const detailRowH = 7;
  const rightRowCount = isRiserInspection ? 2 : 3;
  // CABINET KEYS row grows to hold access info (priority order), max ~24mm,
  // shrinking to 7pt then trimming with "(see site record)". Never fails.
  const accessLinesIn = (jobInfo?.engineerAccess?.lines || []).filter(line =>
    !isRiserInspection || !/^cabinet\s+keys?\s*:/i.test(line));
  const accessFit = accessLinesIn.length ? fitAccessLines(doc, accessLinesIn, rightW - 4, 24 - 5) : null;
  const keysH = accessFit ? Math.max(detailRowH, 5 + accessFit.lines.length * accessFit.lineH + 1) : detailRowH;
  const rightBlockH = (rightRowCount - 1) * detailRowH + keysH;


  const custName = printName(jobInfo?.customers?.name || jobInfo?.customer);
  const siteName = printName(jobInfo?.site?.name);
  const siteAddr = printName(jobInfo?.site?.address || jobInfo?.address);
  const sitePc = jobInfo?.site?.postcode || "";
  // Customer, then site name, then site address — a line that only repeats
  // something already printed is skipped, and the postcode prints once.
  const detailLines = siteDetailLines({ customer: custName, siteName, address: siteAddr, postcode: sitePc });
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  const contentLines = detailLines.flatMap(text=>doc.splitTextToSize(text,leftW-4) as string[]);
  const leftBlockH = Math.max(rightBlockH, isRiserInspection ? 14 : visit ? 30 : 26, 10 + contentLines.length*4.2);

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  // Outer + dividers
  doc.rect(margin, detailsTop, maxWidth, leftBlockH);
  doc.line(rightX, detailsTop, rightX, detailsTop + leftBlockH);
  for (let r = 1; r < rightRowCount; r++) {
    doc.line(rightX, detailsTop + r * detailRowH, margin + maxWidth, detailsTop + r * detailRowH);
  }
  // DATE | PO split inside top-right row
  const rightSplitX = rightX + rightW * 0.42;
  doc.line(rightSplitX, detailsTop, rightSplitX, detailsTop + detailRowH);

  doc.setTextColor(0,0,0);
  // LEFT — Customer/Site Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Customer/Site Details:", margin + 2, detailsTop + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const detailY = detailsTop + 9;
  const detailX = margin + 2;
  contentLines.forEach((ln, i) => doc.text(ln, detailX, detailY + i * 4.2));

  // RIGHT top row: DATE | PO NUMBER (or REF when there is no customer PO)
  // Print the label honestly: the internal VFP-/TM- reference must never
  // masquerade as a customer PO number.
  const custPoRaw = (jobInfo?.customer_po || "").toString().trim();
  const intRefRaw = (jobInfo?.reference_number || "").toString().trim();
  const showAsPo = !!custPoRaw;
  const poLabel = showAsPo ? "PO NUMBER:" : "REF:";
  const poVal = showAsPo ? custPoRaw : intRefRaw;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DATE:", rightX + 2, detailsTop + 3.2);
  doc.text(poLabel, rightSplitX + 2, detailsTop + 3.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const dateStr = (() => {
    const iso = jobInfo?.due_date;
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return String(iso); }
  })();
  doc.text(dateStr, rightX + 2, detailsTop + 6.2);
  doc.text(doc.splitTextToSize(poVal, rightW * 0.58 - 4).slice(0, 1)[0] || "", rightSplitX + 2, detailsTop + 6.2);

  // RIGHT row 2: RISER LOCATION
  const riserY = detailsTop + detailRowH;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RISER LOCATION:", rightX + 2, riserY + 3.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const riserLoc = printName(jobInfo?.site?.riser_location);
  doc.text(doc.splitTextToSize(riserLoc, rightW - 4).slice(0, 1)[0] || "", rightX + 2, riserY + 6.2);

  // Riser location fills the remaining right-hand cell. Keep engineer access
  // below the location, but Cabinet keys itself is a blank body answer row.
  if (isRiserInspection) {
    const locationAccess = accessLinesIn.length
      ? fitAccessLines(doc, accessLinesIn, rightW - 4, leftBlockH - detailRowH - 9)
      : null;
    if (locationAccess) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(locationAccess.pt);
      locationAccess.lines.forEach((line, i) => doc.text(line, rightX + 2, riserY + 8 + locationAccess.lineH * 0.8 + i * locationAccess.lineH));
      doc.setFontSize(9);
    }
  } else {
    const keysY = detailsTop + detailRowH * 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("CABINET KEYS:", rightX + 2, keysY + 3.2);
    if(accessFit){doc.setFont('helvetica','normal');doc.setFontSize(accessFit.pt);accessFit.lines.forEach((ln,i)=>doc.text(ln,rightX+2,keysY+5+accessFit.lineH*0.8+i*accessFit.lineH));doc.setFontSize(9);}
  }

  cursorY = detailsTop + leftBlockH + 1;
  if (visit) {
    if (visit.asset_tag) {
      const qrTop = isRiserInspection ? logoTop : 10;
      drawQr(doc, stickerUrl(visit.asset_tag), pageWidth - margin - 23, qrTop, 20);
      doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica','bold');
      doc.text(`Riser ID ${visit.asset_tag}`, pageWidth-margin-13, qrTop + 24, {align:'center'});
    }
    doc.setTextColor(0); doc.setFontSize(9); doc.setFont('helvetica','normal');
    const previous = printInspectionDate(visit.last_inspection_at);
    // One combined line; anything not recorded is simply left out.
    const riserName = printName(visit.riser_name || visit.riser_location);
    const ctx = [
      riserName && `Riser: ${riserName}`,
      visit.outlets_count != null && `Outlets: ${visit.outlets_count}`,
      visit.job_reference && `Job: ${visit.job_reference}`,
      !isRiserInspection && visit.last_inspection_at && `Last inspection: ${previous}`,
      !isRiserInspection && visit.last_inspection_type && printInspectionType(visit.last_inspection_type),
      !isRiserInspection && visit.last_inspection_result && `Result: ${printInspectionResult(visit.last_inspection_result)}`,
    ].filter(Boolean).join(' | ');
    const contextLines = [ctx, ...(visit.remedial_notes ? [`Open remedial work from last visit: ${visit.remedial_notes}`] : [])].filter(Boolean);
    for (const text of contextLines) {
      const lines = (doc.splitTextToSize(text,maxWidth-4) as string[]).slice(0,2);
      doc.text(lines,margin+2,cursorY+3); cursorY += lines.length*3.6;
    }
    cursorY += 2;
  }

  // ─── OPTIONAL SITE NOTES STRIP ─────────────────────────────────────
  const notesText = (jobInfo?.printNotes || "").trim();
  if (notesText) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const labelW = doc.getTextWidth("SITE NOTES: ") + 2;
    doc.setFont("helvetica", "normal");
    const wrapW = maxWidth - labelW - 3;
    const wrapped = (doc.splitTextToSize(notesText, wrapW) as string[]).slice(0, 2);
    const lineH = 3.6;
    const boxH = Math.max(6.5, wrapped.length * lineH + 2);
    doc.rect(margin, cursorY, maxWidth, boxH);
    doc.setFont("helvetica", "bold");
    doc.text("SITE NOTES:", margin + 2, cursorY + 4);
    doc.setFont("helvetica", "normal");
    wrapped.forEach((ln, i) => doc.text(ln, margin + labelW, cursorY + 4 + i * lineH));
    doc.setFont("helvetica", "normal");
    cursorY += boxH + 1;
  }

  // ─── FOOTER ANCHOR (reserve bottom stack before body) ──────────────
  // Stack (bottom up):
  //   [accreditation logos ~10mm] − margin
  //   [compliance sentence ~7mm]
  //   [customer signature row ~9mm]
  //   [technician signature row ~9mm]
  //   [issues/recommendation/priority writing block ~28mm]
  const LOGO_STRIP_H = accreditationLogos.length > 0 ? 10 : 0;
  const LOGO_STRIP_GAP = accreditationLogos.length > 0 ? 2 : 0;
  const COMPLIANCE_H = 7;
  const SIG_ROW_H = 9;
  const ISSUES_MIN_H = 24;

  const logoStripBottom = pageHeight - margin;
  const logoStripTop = logoStripBottom - LOGO_STRIP_H;
  const complianceBottom = logoStripTop - LOGO_STRIP_GAP;
  const complianceTop = complianceBottom - COMPLIANCE_H;
  const custSigBottom = complianceTop - 1;
  const custSigTop = custSigBottom - SIG_ROW_H;
  const techSigBottom = custSigTop;
  const techSigTop = techSigBottom - SIG_ROW_H;
  const issuesBottom = techSigTop - 1;
  const bodyBottom = issuesBottom - ISSUES_MIN_H - 1;

  // ─── BODY ──────────────────────────────────────────────────────────
  // Group fields by section, preserving order. Skip fields already
  // rendered in the header/footer.
  const sectionOrder: string[] = [];
  const bySection = new Map<string, PdfTemplateField[]>();
  for (const f of bodyFields) {
    const sec = f.section || "General";
    if (!bySection.has(sec)) { bySection.set(sec, []); sectionOrder.push(sec); }
    bySection.get(sec)?.push(f);
  }
  if (isRiserInspection) {
    const external = sectionOrder.find(section => /^external equipment\b/i.test(section)) ?? 'External Equipment';
    if (!bySection.has(external)) { bySection.set(external, []); sectionOrder.unshift(external); }
    bySection.get(external)?.unshift({ id: 'cabinet_keys', label: 'Cabinet keys:', type: 'text', section: external, required: true });
    {
      const ext = bySection.get(external)!;
      const records = { id: 'inspection_records_complete', label: 'BS9990:2015 7.4.6 Have all inspection and test records been filled in?', type: 'select', options: ['YES', 'NO'], section: external, _printText: 'YES / NO' } as PdfTemplateField;
      const summaryIdx = ext.findIndex(f => /^\s*external\s+equipment\s*:?\s*$/i.test(f.label));
      ext.splice(summaryIdx >= 0 ? summaryIdx : ext.length, 0, records);
    }
    // Internal equipment: outlet valve type choices under Number of outlets,
    // GOOD/FAIR/POOR outlet cabinets with a CABINET KEYS write-in line.
    for (const sec of sectionOrder) {
      const list = bySection.get(sec)!;
      const isValveType = (f: PdfTemplateField) => /valve\s*type/i.test(f.label);
      const hadValve = list.some(isValveType);
      const cleaned = list.filter(f => !isValveType(f));
      const out: PdfTemplateField[] = [];
      let valveAdded = false;
      for (const f of cleaned) {
        if (/outlet\s+cabinets?\s+in\s+good\s+condition/i.test(f.label)) {
          out.push({ ...f, type: 'select', options: ['GOOD', 'FAIR', 'POOR'], _printOptions: true } as PdfTemplateField);
          out.push({ id: 'outlet_cabinet_keys', label: 'Cabinet keys:', type: 'text', section: sec } as PdfTemplateField);
          continue;
        }
        out.push(f);
        if (!valveAdded && /number\s+of\s+outlets|no\.?\s+of\s+outlets/i.test(f.label)) {
          out.push({ id: 'outlet_valve_type', label: 'Outlet valve type:', type: 'valve_choice', section: sec } as PdfTemplateField);
          valveAdded = true;
        }
      }
      if (hadValve && !valveAdded) out.unshift({ id: 'outlet_valve_type', label: 'Outlet valve type:', type: 'valve_choice', section: sec } as PdfTemplateField);
      bySection.set(sec, out);
    }
  }
  const VALVE_CHOICES = ['PN16 FLANGE', 'TABLE D FLANGE', 'MALE THREAD', 'FEMALE THREAD'];

  // Build render list of section-header + field rows so the fitter can
  // count everything up-front.
  type BodyItem =
    | { kind: "section"; label: string }
    | { kind: "row"; field: PdfTemplateField };
  const items: BodyItem[] = [];

  for (const sec of sectionOrder) {
    const fields = bySection.get(sec) || [];
    if (fields.length === 0) continue;
    // Uppercase, formatted section header (e.g. "EXTERNAL EQUIPMENT: VISUAL").
    const secLabel = sec.toUpperCase() + (/visual|pressure test|test/i.test(template.name) && !/:/.test(sec) ? `: ${/pressure/i.test(template.name) ? "PRESSURE TEST" : "VISUAL"}` : "");
    items.push({ kind: "section", label: secLabel });
    for (const f of fields) {
      items.push({ kind: "row", field: f });
    }
  }

  const colSplit = margin + maxWidth * (isRiserInspection ? 0.63 : 0.70);
  const availH = bodyBottom - cursorY;

  // Adaptive fit — always one A4 page per sheet. Try the largest row
  // height and font that fit; shrink font/rows/spacing; last resort divides
  // the space evenly and clips labels to the lines that fit.
  const rowCandidates = isRiserInspection
    ? Array.from({ length: 56 }, (_, i) => +(9 - i * 0.1).toFixed(1))
    : [7, 6.5, 6, 5.5, 5, 4.6, 4.2, 3.8, 3.5];
  // Riser sheets keep only a small gap (~2mm) above ISSUES FOUND.
  const fitH = isRiserInspection ? availH - 2 : availH;
  const ptCandidates = isRiserInspection ? [11, 10.5, 10, 9.5, 9, 8.5, 8] : [9, 8.5, 8, 7.5, 7, 6.5, 6];
  const itemHeightAt = (it: BodyItem, rowH: number, secH: number, pt: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(pt);
    const text = it.kind === 'section' ? it.label : it.field.label;
    const width = it.kind === 'section' ? maxWidth - 4 : colSplit - margin - 4;
    const lines = doc.splitTextToSize(text, width) as string[];
    if (it.kind === 'row' && it.field.id === 'outlet_valve_type') return Math.max(rowH * 1.6, 2 * (pt * 0.4 + 1.6));
    return Math.max(it.kind === 'section' ? secH : rowH, lines.length * pt * 0.4 + 1.2);
  };
  const minBodyPt = isRiserInspection ? 8 : 6;
  let fit = { rowH: 3.5, secH: 3.5, font: { label: minBodyPt, ans: minBodyPt, sec: minBodyPt }, forced: 0 };
  outer: for (const pt of ptCandidates) {
    for (const rowH of rowCandidates) {
      const secH = isRiserInspection ? Math.max(4.5, Math.min(6.5, rowH)) : Math.max(rowH, Math.min(6.5, rowH + 0.5));
      if (items.reduce((sum, it) => sum + itemHeightAt(it, rowH, secH, pt), 0) <= fitH) {
        fit = { rowH, secH, font: { label: pt, ans: pt, sec: isRiserInspection ? Math.min(pt, 10) : pt }, forced: 0 }; break outer;
      }
    }
  }
  if (!fit.forced && items.reduce((sum, it) => sum + itemHeightAt(it, fit.rowH, fit.secH, fit.font.label), 0) > availH) {
    fit.forced = Math.max(2.5, availH / Math.max(1, items.length));
    fit.rowH = fit.secH = fit.forced;
  }
  // Riser sheets: spread any leftover space over the checklist rows so only a small gap remains above ISSUES FOUND.
  const rowCount = items.filter(it => it.kind === 'row').length;
  const usedH = items.reduce((sum, it) => sum + itemHeightAt(it, fit.rowH, fit.secH, fit.font.label), 0);
  const rowExtra = isRiserInspection && !fit.forced && rowCount ? Math.max(0, fitH - usedH) / rowCount : 0;
  const itemHeight = (it: BodyItem, rowH: number, secH: number) =>
    fit.forced ? fit.forced : itemHeightAt(it, rowH, secH, fit.font.label) + (it.kind === 'row' ? rowExtra : 0);

  // Render body table.
  const tableTop = cursorY;
  let y = tableTop;
  doc.setDrawColor(120);
  doc.setLineWidth(0.2);

  const drawCell = (
    label: string,
    ans: string,
    yy: number,
    rowH: number,
    isSection: boolean,
    field?: PdfTemplateField,
  ) => {
    if (isSection) {
      // Full-width bold shaded band.
      doc.setFillColor(...(opts.brandColor?opts.brandColor.map(c=>Math.round(230+c*0.1)):[224,224,224]) as [number,number,number]);
      doc.rect(margin, yy, maxWidth, rowH, "F");
      doc.setDrawColor(...(opts.brandColor||[90,90,90]) as [number,number,number]);
      doc.rect(margin, yy, maxWidth, rowH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fit.font.sec);
      doc.setTextColor(0, 0, 0);
      const sLineH = fit.font.sec * 0.4;
      (doc.splitTextToSize(label,maxWidth-4) as string[]).slice(0, Math.max(1, Math.floor((rowH - 0.6) / sLineH))).forEach((ln,i)=>doc.text(ln,margin+2,yy+sLineH*(i+0.85)+0.2));
    } else {
      // Body cells — transparent (no white fill) so the watermark shows
      // through uniformly per the current z-order/transparent-cells rules.
      doc.setDrawColor(120);
      doc.rect(margin, yy, colSplit - margin, rowH);
      doc.rect(colSplit, yy, margin + maxWidth - colSplit, rowH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fit.font.label);
      doc.setTextColor(0, 0, 0);
      // Full question text — clip to first two visible lines within cell height.
      const labelMaxW = colSplit - margin - 4;
      const lineH = fit.font.label * 0.4;
      const maxLines = Math.max(1, Math.floor((rowH - 1) / lineH));
      const lines = (doc.splitTextToSize(label, labelMaxW) as string[]).slice(0, maxLines);
      lines.forEach((ln, i) => doc.text(ln, margin + 2, yy + lineH * (i + 0.85)));
      // Answer cell — options to circle, or a ruled writing line for
      // free-text/number/date fields. Never leave the cell blank; an empty
      // answer cell is unusable on site.
      const ansX = colSplit + 2;
      const ansMaxW = margin + maxWidth - colSplit - 4;
      if (field?.id === 'outlet_valve_type') {
        doc.setFont("helvetica", "normal");
        const colW = ansMaxW / 2;
        let fs = fit.font.ans;
        doc.setFontSize(fs);
        // Same size as other answers where it fits; shrink only if a choice would overflow its half.
        while (fs > 7 && Math.max(...VALVE_CHOICES.map(c => doc.getTextWidth(c))) + fs * 0.33 + 1.5 > colW) { fs -= 0.25; doc.setFontSize(fs); }
        const half = rowH / 2;
        VALVE_CHOICES.forEach((c, i) => {
          const cx = ansX + (i % 2) * colW;
          const cy = yy + Math.floor(i / 2) * half;
          const box = Math.min(fs * 0.33, half - 0.8);
          doc.setDrawColor(0); doc.rect(cx, cy + (half - box) / 2, box, box);
          doc.text(c, cx + box + 1, cy + half / 2 + fs * 0.14);
        });
        doc.setDrawColor(120);
      } else if (ans) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fit.font.ans);
        const aLineH = fit.font.ans * 0.4;
        const answerLines = (doc.splitTextToSize(ans, ansMaxW) as string[]).slice(0, maxLines);
        answerLines.forEach((ln,i)=>doc.text(ln, ansX, yy + aLineH * (i + 0.85)));
      }
    }
  };


  for (const it of items) {
    if (it.kind === "section") {
      // Continuation to next page if we've run out.
      const sectionH = itemHeight(it,fit.rowH,fit.secH);
      drawCell(it.label, "", y, sectionH, true);
      y += sectionH;
    } else {
      const fieldH = itemHeight(it,fit.rowH,fit.secH);
      const label = it.field.label;
      const ans = visit && /outlet/i.test(it.field.label) && it.field.type === 'number'
        ? String(visit.outlets_count ?? '') : (it.field as any)._printText ? (it.field as any)._printText : (it.field as any)._printOptions ? 'GOOD / FAIR / POOR' : handfill ? "" : answerCellText(it.field);
      drawCell(label, ans, y, fieldH, false, it.field);
      y += fieldH;
    }
  }

  // ─── ISSUES / RECOMMENDATION / PRIORITY WRITING BLOCK ─────────────
  const issuesTop = techSigTop - 1 - ISSUES_MIN_H;
  const issuesBoxH = issuesBottom - issuesTop;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(margin, issuesTop, maxWidth, issuesBoxH);
  const labelW = maxWidth * 0.24;
  // horizontal divider between each labelled section
  const thirds = issuesBoxH / 3;
  doc.line(margin, issuesTop + thirds, margin + maxWidth, issuesTop + thirds);
  doc.line(margin, issuesTop + thirds * 2, margin + maxWidth, issuesTop + thirds * 2);
  doc.line(margin + labelW, issuesTop, margin + labelW, issuesTop + issuesBoxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("ISSUES FOUND:", margin + 2, issuesTop + thirds * 0.55);
  doc.text("RECOMMENDATION:", margin + 2, issuesTop + thirds * 1.55);
  doc.text("PRIORITY:", margin + 2, issuesTop + thirds * 2.55);
  // Answer boxes intentionally have no internal rules; retain borders and signing lines.

  // ─── SIGNATURE ROWS ────────────────────────────────────────────────
  const drawSigRow = (yy: number, hh: number, who: "Technician Name" | "Customer Name") => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, yy, maxWidth, hh);
    // Three cells: Date | Name | Signature
    const cellDateW = maxWidth * 0.20;
    const cellNameW = maxWidth * 0.35;
    doc.line(margin + cellDateW, yy, margin + cellDateW, yy + hh);
    doc.line(margin + cellDateW + cellNameW, yy, margin + cellDateW + cellNameW, yy + hh);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Date:", margin + 2, yy + 3.5);
    doc.text(`${who}:`, margin + cellDateW + 2, yy + 3.5);
    doc.text("Signature:", margin + cellDateW + cellNameW + 2, yy + 3.5);
    // Ruled write-lines in each cell
    doc.setDrawColor(180);
    doc.setLineWidth(0.15);
    const ly = yy + hh - 2;
    doc.line(margin + 2, ly, margin + cellDateW - 2, ly);
    doc.line(margin + cellDateW + 2, ly, margin + cellDateW + cellNameW - 2, ly);
    doc.line(margin + cellDateW + cellNameW + 2, ly, margin + maxWidth - 2, ly);
  };
  drawSigRow(techSigTop, SIG_ROW_H, "Technician Name");
  drawSigRow(custSigTop, SIG_ROW_H, "Customer Name");

  // ─── COMPLIANCE SENTENCE ───────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  const compText = complianceSentence(template.name);
  doc.text(compText, pageWidth / 2, complianceTop + COMPLIANCE_H * 0.7, { align: "center" });

  // ─── ACCREDITATION LOGO STRIP ──────────────────────────────────────
  if (accreditationLogos.length > 0) {
    const gap = 5;
    const dims = accreditationLogos.map((img) => ({ img, w: (img.width / img.height) * LOGO_STRIP_H }));
    const totalW = dims.reduce((s, d) => s + d.w, 0) + gap * (dims.length - 1);
    let x = (pageWidth - totalW) / 2;
    for (const { img, w } of dims) {
      doc.addImage(img.dataUrl, img.format, x, logoStripTop, w, LOGO_STRIP_H);
      x += w + gap;
    }
  }
}
