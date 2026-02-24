import jsPDF from "jspdf";

export type PdfTemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  allow_notes?: boolean;
};

/**
 * Build the set of field IDs that should be skipped in the PDF body
 * because they are already rendered in the header or footer areas.
 */
export function buildSkipIds(fields: PdfTemplateField[]): Set<string> {
  const skipIds = new Set<string>();
  fields.forEach((f) => {
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
  return skipIds;
}

/**
 * Get ordered unique section names from template fields.
 */
export function getSections(fields: PdfTemplateField[]): string[] {
  return [...new Set(fields.map((f) => f.section || "General"))];
}

/**
 * Filter fields for a given section, excluding skipped IDs.
 */
export function getSectionFields(
  fields: PdfTemplateField[],
  section: string,
  skipIds: Set<string>
): PdfTemplateField[] {
  return fields.filter(
    (f) => (f.section || "General") === section && !skipIds.has(f.id)
  );
}

export interface SectionLayout {
  totalFieldRows: number;
  totalSectionHeaders: number;
  rowH: number;
  sectionHeaderH: number;
}

/**
 * Compute dynamic row heights so all sections fit within the available space.
 */
export function computeSectionLayout(
  fields: PdfTemplateField[],
  sections: string[],
  skipIds: Set<string>,
  availableH: number,
  opts: { sectionHeaderH?: number; extraSpaceUsed?: number; minRowH?: number; maxRowH?: number } = {}
): SectionLayout {
  const sectionHeaderH = opts.sectionHeaderH ?? 6;
  const extraSpaceUsed = opts.extraSpaceUsed ?? 0;
  const minRowH = opts.minRowH ?? 4;
  const maxRowH = opts.maxRowH ?? 7;

  let totalFieldRows = 0;
  let totalSectionHeaders = 0;

  for (const sec of sections) {
    const sf = getSectionFields(fields, sec, skipIds);
    if (sf.length === 0) continue;
    totalSectionHeaders++;
    totalFieldRows += sf.length;
  }

  const usedByHeaders = totalSectionHeaders * sectionHeaderH + totalSectionHeaders;
  const spaceForRows = availableH - usedByHeaders - extraSpaceUsed;
  const rowH = Math.max(minRowH, Math.min(maxRowH, spaceForRows / Math.max(totalFieldRows, 1)));

  return { totalFieldRows, totalSectionHeaders, rowH, sectionHeaderH };
}

/**
 * Render a section header bar with grey background.
 * Returns the new y position after the header.
 */
export function renderSectionHeader(
  doc: jsPDF,
  section: string,
  y: number,
  opts: { margin?: number; maxWidth?: number; colSplit?: number; sectionHeaderH?: number; showResultLabel?: boolean } = {}
): number {
  const margin = opts.margin ?? 10;
  const maxWidth = opts.maxWidth ?? (doc.internal.pageSize.getWidth() - margin * 2);
  const colSplit = opts.colSplit ?? maxWidth * 0.68;
  const sectionHeaderH = opts.sectionHeaderH ?? 6;
  const showResultLabel = opts.showResultLabel ?? true;

  doc.setFillColor(230, 230, 230);
  doc.rect(margin, y, maxWidth, sectionHeaderH, "F");
  doc.setDrawColor(0);
  doc.rect(margin, y, maxWidth, sectionHeaderH);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(section.toUpperCase(), margin + 1, y + 4.5);
  if (showResultLabel) {
    doc.text("RESULT", margin + colSplit + 1, y + 4.5);
  }

  return y + sectionHeaderH;
}

export interface RenderFieldRowOpts {
  margin?: number;
  maxWidth?: number;
  colSplit?: number;
  rowH: number;
}

/**
 * Render a single filled field row (label + value) used by the completed-sheet PDF.
 * Returns the new y position after the row.
 */
export function renderFilledFieldRow(
  doc: jsPDF,
  field: PdfTemplateField,
  value: any,
  noteValue: string | undefined,
  y: number,
  opts: RenderFieldRowOpts
): number {
  const margin = opts.margin ?? 10;
  const maxWidth = opts.maxWidth ?? (doc.internal.pageSize.getWidth() - margin * 2);
  const colSplit = opts.colSplit ?? maxWidth * 0.68;
  const rowH = opts.rowH;

  doc.setDrawColor(180);
  doc.rect(margin, y, colSplit, rowH);
  doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

  // Label
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8.5);
  const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
  doc.text(label, margin + 1, y + 3);

  // Value
  if (field.type === "pass_fail") {
    const displayVal = value === "pass" ? "PASS" : value === "fail" ? "FAIL" : value === "n/a" ? "N/A" : "—";
    if (value === "pass") { doc.setTextColor(0, 128, 0); doc.setFont("helvetica", "bold"); }
    else if (value === "fail") { doc.setTextColor(200, 0, 0); doc.setFont("helvetica", "bold"); }
    doc.text(displayVal, margin + colSplit + 1, y + 3);
  } else if (field.type === "checkbox") {
    doc.text(value ? "YES" : "NO", margin + colSplit + 1, y + 3);
  } else if (field.type === "yes_no" || (field.options && field.options.length <= 3 && field.options.some((o) => o.toLowerCase() === "yes"))) {
    const strVal = String(value || "").toLowerCase();
    const displayVal = strVal === "yes" ? "YES" : strVal === "no" ? "NO" : strVal === "n/a" ? "N/A" : value ? String(value).toUpperCase() : "—";
    if (strVal === "yes") { doc.setTextColor(0, 128, 0); doc.setFont("helvetica", "bold"); }
    else if (strVal === "no") { doc.setTextColor(200, 0, 0); doc.setFont("helvetica", "bold"); }
    doc.text(displayVal, margin + colSplit + 1, y + 3);
  } else if (field.type === "photo") {
    doc.text(value ? "✓ Captured" : "—", margin + colSplit + 1, y + 3);
  } else {
    const raw = value ? String(value).substring(0, 50) : "—";
    doc.text(raw.charAt(0).toUpperCase() + raw.slice(1), margin + colSplit + 1, y + 3);
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  let extraY = 0;
  // Inline note
  if (field.allow_notes && noteValue) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text(`Note: ${noteValue}`.substring(0, 80), margin + 2, y + rowH + 2.5);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    extraY = 3;
  }

  return y + rowH + extraY;
}

/**
 * Render a single blank field row (label + empty result checkboxes/lines)
 * used by the blank-template PDF.
 * Returns the new y position after the row.
 */
export function renderBlankFieldRow(
  doc: jsPDF,
  field: PdfTemplateField,
  autoVal: string | undefined,
  y: number,
  opts: RenderFieldRowOpts
): number {
  const margin = opts.margin ?? 10;
  const maxWidth = opts.maxWidth ?? (doc.internal.pageSize.getWidth() - margin * 2);
  const colSplit = opts.colSplit ?? maxWidth * 0.68;
  const rowH = opts.rowH;

  doc.setDrawColor(180);
  doc.rect(margin, y, colSplit, rowH);
  doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
  doc.text(label, margin + 1, y + 3.5);

  if (field.type === "pass_fail") {
    const bx = margin + colSplit + 2;
    doc.setFontSize(7.5);
    doc.rect(bx, y + 1, 3, 3); doc.text("P", bx + 4, y + 3.5);
    doc.rect(bx + 10, y + 1, 3, 3); doc.text("F", bx + 14, y + 3.5);
    doc.rect(bx + 20, y + 1, 3, 3); doc.text("N/A", bx + 24, y + 3.5);
    doc.setFontSize(8.5);
  } else if (field.type === "checkbox") {
    const bx = margin + colSplit + 2;
    doc.setFontSize(6);
    doc.rect(bx, y + 1, 3, 3); doc.text("YES", bx + 4, y + 3.5);
    doc.rect(bx + 14, y + 1, 3, 3); doc.text("NO", bx + 18, y + 3.5);
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

  return y + rowH;
}
