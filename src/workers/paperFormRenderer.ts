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
import type { PdfTemplateField } from "@/lib/pdfBody";

export type LoadedImage = {
  dataUrl: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG";
};

export type PaperFormJobInfo = {
  customers?: { name: string } | null;
  customer?: string | null;
  reference_number?: string;
  customer_po?: string | null;
  engineers?: string[];
  due_date?: string | null;
  address?: string | null;
  printNotes?: string | null;
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
  if (id === "no_of_outlets" || /number\s+of\s+outlets/i.test(label)) return true; // inline in landing valve row
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
 *  for the engineer to circle, following the paper-form convention. */
function answerCellText(field: PdfTemplateField): string {
  if (field.type === "pass_fail") return "PASS / FAIL / N/A";
  if (field.type === "yes_no") return field.allow_na ? "YES / NO / N/A" : "YES / NO";
  if (field.type === "select" && field.options && field.options.length > 0) {
    const upper = field.options.map((o) => o.toUpperCase());
    const withNa = field.allow_na && !upper.some((o) => o === "N/A" || o === "NA") ? [...upper, "N/A"] : upper;
    return withNa.join(" / ");
  }
  if (field.type === "checkbox") return "YES / NO";
  return "";
}

/**
 * Render one full paper-form page (single template instance). Content is
 * fitted to a single A4 page by adaptive font/row sizing when the template
 * has ≤ ~24 body rows (typical Dry Riser sheets). Larger templates
 * (Sprinkler Annual, etc.) allow additional pages that flow naturally.
 */
export function renderPaperFormPage(
  doc: jsPDF,
  opts: PaperFormRenderOpts,
): void {
  const { template, jobInfo, logo, accreditationLogos, handfill } = opts;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const maxWidth = pageWidth - margin * 2;

  // ─── HEADER ────────────────────────────────────────────────────────
  // Logo centred; the Viva logo image already carries the strapline.
  const logoTop = margin;
  const logoMaxH = 22;
  const logoMaxW = 70;
  let cursorY = logoTop;
  if (logo) {
    const aspect = logo.width / logo.height;
    let lw = logoMaxH * aspect;
    let lh = logoMaxH;
    if (lw > logoMaxW) { lw = logoMaxW; lh = lw / aspect; }
    doc.addImage(logo.dataUrl, logo.format, (pageWidth - lw) / 2, logoTop, lw, lh);
    cursorY = logoTop + lh + 2;
  } else {
    cursorY = logoTop + 12;
  }

  // Bold underlined SCOPE OF WORK line.
  const scopeText = derivedScopeLine(template.name);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  const scopeW = doc.getTextWidth(scopeText);
  const scopeX = (pageWidth - scopeW) / 2;
  const scopeY = cursorY + 5;
  doc.text(scopeText, scopeX, scopeY);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(scopeX, scopeY + 1.2, scopeX + scopeW, scopeY + 1.2);
  cursorY = scopeY + 4;

  // ─── DETAILS TABLE ─────────────────────────────────────────────────
  // LEFT: Customer/Site Details (multi-line, ~55% wide)
  // RIGHT stacked: [DATE | PO NUMBER], [RISER LOCATION], [CABINET KEYS]
  const detailsTop = cursorY;
  const leftW = maxWidth * 0.55;
  const rightW = maxWidth - leftW;
  const rightX = margin + leftW;
  const detailRowH = 7;
  const rightRowCount = 3; // date/po, riser, keys
  const rightBlockH = rightRowCount * detailRowH;
  const leftBlockH = Math.max(rightBlockH, 26);

  const custName = jobInfo?.customers?.name || jobInfo?.customer || "";
  const siteName = jobInfo?.site?.name || "";
  const siteAddr = jobInfo?.site?.address || jobInfo?.address || "";
  const sitePc = jobInfo?.site?.postcode || "";
  const siteLines = [siteName, siteAddr, sitePc].filter(Boolean);

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

  // LEFT — Customer/Site Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Customer/Site Details:", margin + 2, detailsTop + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const detailY = detailsTop + 9;
  const detailX = margin + 2;
  const contentLines = [custName, ...siteLines].filter(Boolean);
  contentLines.slice(0, 4).forEach((ln, i) => {
    const clipped = doc.splitTextToSize(ln, leftW - 4).slice(0, 1)[0] || "";
    doc.text(clipped, detailX, detailY + i * 4.2);
  });

  // RIGHT top row: DATE | PO NUMBER
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DATE:", rightX + 2, detailsTop + 3.2);
  doc.text("PO NUMBER:", rightSplitX + 2, detailsTop + 3.2);
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
  const poVal = jobInfo?.reference_number || "";
  doc.text(doc.splitTextToSize(poVal, rightW * 0.58 - 4).slice(0, 1)[0] || "", rightSplitX + 2, detailsTop + 6.2);

  // RIGHT row 2: RISER LOCATION
  const riserY = detailsTop + detailRowH;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("RISER LOCATION:", rightX + 2, riserY + 3.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const riserLoc = jobInfo?.site?.riser_location || "";
  doc.text(doc.splitTextToSize(riserLoc, rightW - 4).slice(0, 1)[0] || "", rightX + 2, riserY + 6.2);

  // RIGHT row 3: CABINET KEYS (blank line to write on)
  const keysY = detailsTop + detailRowH * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CABINET KEYS:", rightX + 2, keysY + 3.2);
  // ruled writing line
  doc.setDrawColor(140);
  doc.setLineWidth(0.2);
  doc.line(rightX + 2, keysY + 6.2, margin + maxWidth - 2, keysY + 6.2);

  cursorY = detailsTop + leftBlockH + 1;

  // ─── OPTIONAL SITE NOTES STRIP ─────────────────────────────────────
  const notesText = (jobInfo?.printNotes || "").trim();
  if (notesText) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const labelW = doc.getTextWidth("SITE NOTES: ") + 2;
    doc.setFont("helvetica", "italic");
    const wrapW = maxWidth - labelW - 3;
    const wrapped = (doc.splitTextToSize(notesText, wrapW) as string[]).slice(0, 2);
    const lineH = 3.6;
    const boxH = Math.max(6.5, wrapped.length * lineH + 2);
    doc.rect(margin, cursorY, maxWidth, boxH);
    doc.setFont("helvetica", "bold");
    doc.text("SITE NOTES:", margin + 2, cursorY + 4);
    doc.setFont("helvetica", "italic");
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
  const bodyFields = template.fields.filter((f) => !skipInBody(f));
  const sectionOrder: string[] = [];
  const bySection = new Map<string, PdfTemplateField[]>();
  for (const f of bodyFields) {
    const sec = f.section || "General";
    if (!bySection.has(sec)) { bySection.set(sec, []); sectionOrder.push(sec); }
    bySection.get(sec)!.push(f);
  }

  // Build render list of section-header + field rows so the fitter can
  // count everything up-front.
  type BodyItem =
    | { kind: "section"; label: string }
    | { kind: "row"; field: PdfTemplateField; attachOutlets: boolean };
  const items: BodyItem[] = [];
  // Detect the outlets field on this template so we can inline it into the
  // landing-valve row (paper-form convention).
  const outletsField = template.fields.find(
    (f) => f.id.toLowerCase() === "no_of_outlets" || /number\s+of\s+outlets/i.test(f.label),
  );

  for (const sec of sectionOrder) {
    const fields = bySection.get(sec)!;
    if (fields.length === 0) continue;
    // Uppercase, formatted section header (e.g. "EXTERNAL EQUIPMENT: VISUAL").
    const secLabel = sec.toUpperCase() + (/visual|pressure test|test/i.test(template.name) && !/:/.test(sec) ? `: ${/pressure/i.test(template.name) ? "PRESSURE TEST" : "VISUAL"}` : "");
    items.push({ kind: "section", label: secLabel });
    for (const f of fields) {
      items.push({ kind: "row", field: f, attachOutlets: !!outletsField && isLandingValveRow(f) });
    }
  }

  const colSplit = margin + maxWidth * 0.70;
  const availH = bodyBottom - cursorY;

  // Adaptive fit — search largest row height that lets all items fit,
  // also probing shrunk section header height.
  const rowCandidates = [7, 6.5, 6, 5.5, 5, 4.6];
  const secCandidates = [6.5, 6, 5.5, 5];
  const fontCandidates: Array<{ label: number; ans: number; sec: number }> = [
    { label: 9.5, ans: 9.5, sec: 9.5 },
    { label: 9, ans: 9, sec: 9 },
    { label: 8.5, ans: 8.5, sec: 9 },
    { label: 8, ans: 8, sec: 8.5 },
    { label: 7.5, ans: 7.5, sec: 8 },
  ];
  const measure = (rowH: number, secH: number) => {
    let total = 0;
    for (const it of items) total += it.kind === "section" ? secH : rowH;
    return total;
  };
  let fit = { rowH: 4.6, secH: 5, font: fontCandidates[fontCandidates.length - 1] };
  outer: for (const font of fontCandidates) {
    for (const rowH of rowCandidates) {
      for (const secH of secCandidates) {
        if (secH < rowH - 0.5) continue; // section shouldn't be shorter than a row
        if (measure(rowH, secH) <= availH) {
          fit = { rowH, secH, font };
          break outer;
        }
      }
    }
  }

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
  ) => {
    if (isSection) {
      // Full-width bold shaded band.
      doc.setFillColor(224, 224, 224);
      doc.rect(margin, yy, maxWidth, rowH, "F");
      doc.setDrawColor(90);
      doc.rect(margin, yy, maxWidth, rowH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fit.font.sec);
      doc.setTextColor(0, 0, 0);
      doc.text(label, margin + 2, yy + rowH * 0.7);
    } else {
      doc.setDrawColor(120);
      doc.rect(margin, yy, colSplit - margin, rowH);
      doc.rect(colSplit, yy, margin + maxWidth - colSplit, rowH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fit.font.label);
      doc.setTextColor(0, 0, 0);
      // Full question text — clip to first two visible lines within cell height.
      const labelMaxW = colSplit - margin - 4;
      const lineH = fit.font.label * 0.4;
      const maxLines = Math.max(1, Math.floor((rowH - 1) / lineH));
      const lines = (doc.splitTextToSize(label, labelMaxW) as string[]).slice(0, maxLines);
      lines.forEach((ln, i) => doc.text(ln, margin + 2, yy + lineH * (i + 0.85)));
      // Answer cell text
      if (ans) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fit.font.ans);
        doc.text(ans, colSplit + 2, yy + rowH * 0.7);
      }
    }
  };

  for (const it of items) {
    if (it.kind === "section") {
      // Continuation to next page if we've run out.
      if (y + fit.secH > bodyBottom) {
        doc.addPage();
        y = margin;
      }
      drawCell(it.label, "", y, fit.secH, true);
      y += fit.secH;
    } else {
      if (y + fit.rowH > bodyBottom) {
        doc.addPage();
        y = margin;
      }
      const label = it.field.label;
      let ans = handfill ? "" : answerCellText(it.field);
      if (it.attachOutlets && outletsField) {
        // Inline "NO OF OUTLETS: ____" callout in the answer cell.
        const suffix = "   NO OF OUTLETS: ______";
        ans = ans ? ans + suffix : suffix.trimStart();
      }
      drawCell(label, ans, y, fit.rowH, false);
      y += fit.rowH;
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
  // Ruled writing lines inside the right side of each row.
  doc.setDrawColor(180);
  doc.setLineWidth(0.15);
  const rulX1 = margin + labelW + 2;
  const rulX2 = margin + maxWidth - 2;
  for (let band = 0; band < 3; band++) {
    const bandTop = issuesTop + thirds * band;
    const bandBottom = issuesTop + thirds * (band + 1);
    const rules = Math.max(1, Math.floor((bandBottom - bandTop - 2) / 4));
    for (let r = 1; r <= rules; r++) {
      const ly = bandTop + (bandBottom - bandTop) * (r / (rules + 1));
      doc.line(rulX1, ly, rulX2, ly);
    }
  }

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
    doc.setFontSize(8);
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
