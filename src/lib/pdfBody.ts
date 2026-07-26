import jsPDF from "jspdf";
import { PDF_PALETTE } from "@/lib/pdfPalette";

export interface AutoPopulateJobInfo {
  address?: string | null;
  customer?: string | null;
  customers?: { name: string } | null;
  reference_number?: string;
  category?: string | null;
  categoryName?: string | null;
  name?: string | null;
  priority?: string | null;
  engineers?: string[];
  site?: {
    name: string;
    address: string | null;
    postcode?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    riser_location?: string | null;
  } | null;
}

/**
 * Detect British/European standard reference prefixes at the start of a label,
 * e.g. "BS 9990", "BS9990:2015", "EN 3", "EN137", "BS EN 671", "BSEN671".
 * Centralised so all PDF heuristics stay in sync — do not inline this regex.
 */
export function isStandardReference(label: string): boolean {
  return /^(bs\s?(en\s?)?|en\s?)\d/i.test(label.trim());
}

export function isYesNoOptions(options?: string[]): boolean {
  return Array.isArray(options)
    && options.length > 0
    && options.length <= 3
    && options.some((o) => o.toLowerCase() === "yes")
    && options.some((o) => o.toLowerCase() === "no");
}

const BLANK_YES_NO_INCOMPATIBLE_TYPES = new Set([
  "text",
  "number",
  "date",
  "textarea",
  "long_text",
  "signature",
  "photo",
  "image",
  "file",
]);

export function isQuestionStyleYesNoField(field: Pick<PdfTemplateField, "label" | "type">): boolean {
  const label = field.label.trim();
  return (
    (field.type === "yes_no" || label.endsWith("?") || isStandardReference(label))
    && !BLANK_YES_NO_INCOMPATIBLE_TYPES.has(field.type)
  );
}

/**
 * Auto-populate field values for a PDF export based on job/site data,
 * mirroring the online sheet logic.
 */
export function getAutoPopulatedValues(
  templateName: string,
  fields: PdfTemplateField[],
  jobInfo: AutoPopulateJobInfo | null | undefined
): Record<string, string> {
  const vals: Record<string, string> = {};
  if (!jobInfo) return vals;

  const customerName = jobInfo.customers?.name || jobInfo.customer || "";
  const siteName = jobInfo.site?.name || "";
  const siteAddress = jobInfo.site?.address || jobInfo.address || "";
  const sitePostcode = jobInfo.site?.postcode || "";
  const siteContact = jobInfo.site?.contact_name || "";
  const siteContactPhone = jobInfo.site?.contact_phone || "";
  const siteContactEmail = jobInfo.site?.contact_email || "";
  const engineerList = (jobInfo.engineers || []).join(", ");
  const refNumber = jobInfo.reference_number || "";
  const dateVal = new Date().toLocaleDateString("en-GB");

  fields.forEach((f) => {
    const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();

    if ((label.includes("site") && label.includes("detail")) || (label.includes("site") && label.includes("info"))) {
      vals[f.id] = [siteName, siteAddress, sitePostcode].filter(Boolean).join(", ");
    } else if (label === "site name" || label === "site") {
      vals[f.id] = siteName;
    } else if (label === "site address" || label === "address") {
      vals[f.id] = [siteAddress, sitePostcode].filter(Boolean).join(", ");
    } else if (label.includes("postcode") || label.includes("post code")) {
      vals[f.id] = sitePostcode;
    } else if (label.includes("site") && label.includes("contact") && label.includes("name")) {
      vals[f.id] = siteContact;
    } else if (label === "contact name" || label === "contact person") {
      vals[f.id] = siteContact;
    } else if ((label.includes("site") && label.includes("contact") && label.includes("phone")) || (label.includes("site") && label.includes("tel"))) {
      vals[f.id] = siteContactPhone;
    } else if (label === "contact phone" || label === "contact tel" || label === "contact number") {
      vals[f.id] = siteContactPhone;
    } else if (label.includes("site") && label.includes("email")) {
      vals[f.id] = siteContactEmail;
    } else if ((label.includes("customer") && label.includes("detail")) || (label.includes("client") && label.includes("detail"))) {
      vals[f.id] = customerName;
    } else if (label === "customer name" || label === "client name" || label === "customer" || label === "client") {
      vals[f.id] = customerName;
    } else if (label.includes("customer") && !label.includes("sign") && !label.includes("email") && !label.includes("phone")) {
      vals[f.id] = customerName;
    } else if (label.includes("po number") || label.includes("reference") || label.includes("ref no") || label.includes("job ref") || label.includes("order number")) {
      vals[f.id] = refNumber;
    } else if (label === "date" || label === "inspection date" || label === "service date" || label === "visit date") {
      vals[f.id] = dateVal;
    } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category")) {
      // For "Scope of Work" select fields on inspection templates, infer from template name
      if (f.options && f.options.some(o => o.toLowerCase() === "pressure test") && f.options.some(o => o.toLowerCase() === "visual")) {
        const tn = templateName.toLowerCase();
        if (tn.includes("pressure test") || tn.includes("pressure-test")) {
          vals[f.id] = "Pressure Test";
        } else if (tn.includes("visual")) {
          vals[f.id] = "Visual";
        }
      } else {
        const categoryName = jobInfo.categoryName
          || (jobInfo.category ? jobInfo.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "");
        vals[f.id] = categoryName;
      }
    } else if (label.includes("engineer") || label.includes("technician") || label.includes("operative") || label.includes("carried out by") || label.includes("completed by") || label.includes("attended by")) {
      vals[f.id] = engineerList;
    } else if (label === "job name" || label === "job title" || label === "job description") {
      vals[f.id] = jobInfo.name || "";
    } else if (label === "priority" || label === "job priority") {
      vals[f.id] = jobInfo.priority || "";
    } else if (label.includes("riser location") || label.includes("riser loc")) {
      vals[f.id] = jobInfo.site?.riser_location || "";
    }

    const isDrainField = label.includes("drain") || label.includes("drop leg");
    const isYesNoField =
      f.type === "yes_no" ||
      (f.options && f.options.length <= 3 && f.options.some((o) => o.toLowerCase() === "yes") && f.options.some((o) => o.toLowerCase() === "no"));

    // Default drain / drop leg fields to YES across checkbox and yes/no-style fields
    if (isDrainField && (f.type === "checkbox" || f.type === "select" || isYesNoField)) {
      vals[f.id] = "YES";
    }
  });

  return vals;
}

export type PdfTemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  allow_notes?: boolean;
  allow_na?: boolean;
};

const POSITIVE_RESULT_TOKENS = new Set(["yes", "pass", "true"]);
const NEGATIVE_RESULT_TOKENS = new Set(["no", "fail", "false"]);
const NA_RESULT_TOKENS = new Set(["n/a", "na"]);

const PASS_FAIL_TOKENS = new Set(["pass", "fail"]);

function normalizePdfText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getRawFieldText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value);
}

function hasRenderableValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * A field is "blank" (no answer given) when the value is undefined/null,
 * an empty/whitespace-only string, an explicit "omitted" marker, an empty
 * array, or an array/object whose entries are all themselves blank.
 *
 * IMPORTANT: an explicit "N/A" answer is NOT blank — it's a real answer.
 * Boolean values (including `false`) are treated as real answers too.
 */
export function isBlankAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return false;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return true;
    const low = t.toLowerCase();
    return low === "__omitted__" || low === "__omit__";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.every((row) => isBlankAnswer(row));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ((obj as any).__omitted__ === true || (obj as any).omitted === true) return true;
    const keys = Object.keys(obj).filter((k) => k !== "id");
    if (keys.length === 0) return true;
    return keys.every((k) => isBlankAnswer(obj[k]));
  }
  return false;
}

/**
 * Filter repeating-table rows to only those with at least one non-blank cell.
 * Individual empty cells within a rendered row are fine to display as "—".
 */
export function filterNonBlankRows(rows: unknown): any[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !isBlankAnswer(row));
}

/**
 * Render a repeating_table field as a compact bordered table with a header
 * row (Viva blue) and one data row per non-blank entry. Auto-wraps long text
 * and grows row height accordingly. Column widths are distributed evenly
 * across the printable width, with a slight bias toward the first column
 * (usually the row identifier — Zone/Level, Unit No., etc.).
 */
export function renderRepeatingTableBlock(
  doc: any,
  field: any,
  cols: any[],
  rows: any[],
  y: number,
  opts: { margin: number; maxWidth: number; footerReserve?: number },
): number {
  const { margin, maxWidth } = opts;
  // Defensive: guard against malformed templates so a bad column list can
  // never crash the whole PDF render (which would surface as an infinite
  // "Loading…" upstream in the comparison viewer).
  const safeCols: any[] = Array.isArray(cols) ? cols.filter(Boolean) : [];
  const safeRows: any[] = Array.isArray(rows) ? rows : [];
  if (safeCols.length === 0 || safeRows.length === 0) return y;

  const headerH = 5.5;
  const cellPadX = 1.2;
  const lineH = 3.2;
  const minRowH = 5;
  const BLUE: [number, number, number] = [31, 78, 121]; // brand dark blue
  const pageHeight = doc.internal.pageSize.getHeight();
  // Allow caller to specify its own footer reserve so page-break maths line
  // up with the outer layout (JobSheetPdfExport uses a variable footerSpace).
  const footerReserve = typeof opts.footerReserve === "number" ? opts.footerReserve : 22;

  const isWideCol = (c: any) => {
    const t = String(c?.type || "").toLowerCase();
    const label = String(c?.label || c?.id || "").toLowerCase();
    if (t === "textarea" || t === "long_text") return true;
    return /breakdown|comment|remark|note|observation|per[_ ]?room|room[_ ]?list|description/.test(label);
  };
  const shares = safeCols.map((c, i) => {
    if (isWideCol(c)) return 2.6;
    if (i === 0) return 1.4;
    return 1;
  });
  const totalShare = shares.reduce((a, b) => a + b, 0) || 1;
  const colWs = shares.map((s) => (maxWidth * s) / totalShare);
  const colXs: number[] = [];
  let acc = margin;
  for (const w of colWs) { colXs.push(acc); acc += w; }

  const renderHeader = () => {
    doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
    doc.rect(margin, y, maxWidth, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    safeCols.forEach((c, i) => {
      const label = String(c?.label || c?.id || "");
      const wrapped = doc.splitTextToSize(label, Math.max(1, colWs[i] - cellPadX * 2));
      doc.text(wrapped[0] || label, colXs[i] + cellPadX, y + 3.7);
    });
    y += headerH;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
  };

  try {
    renderHeader();

    for (const row of safeRows) {
      const wrappedCells: string[][] = safeCols.map((c, i) => {
        const raw = row?.[c?.id];
        const text = raw == null || raw === "" ? "—" : String(raw);
        return doc.splitTextToSize(text, Math.max(1, colWs[i] - cellPadX * 2));
      });
      const tallest = Math.max(1, ...wrappedCells.map((w) => w.length));
      const rowH = Math.max(minRowH, tallest * lineH + 1.5);

      if (y + rowH > pageHeight - footerReserve) {
        doc.addPage();
        y = margin;
        renderHeader();
      }

      safeCols.forEach((_, i) => {
        doc.rect(colXs[i], y, colWs[i], rowH);
      });
      wrappedCells.forEach((lines, i) => {
        const col = safeCols[i];
        const raw = row?.[col?.id];
        const text = raw == null || raw === "" ? "—" : String(raw);
        const lower = text.toLowerCase().trim();
        if (col?.type === "yn_na" || /^(yes|no|n\/?a|pass|fail)$/i.test(text)) {
          if (/^(yes|pass)$/i.test(text)) doc.setTextColor(0, 128, 0);
          else if (/^(no|fail)$/i.test(text)) doc.setTextColor(200, 0, 0);
          else if (/^n\/?a$/i.test(lower)) doc.setTextColor(100, 100, 100);
          doc.setFont("helvetica", "bold");
        }
        lines.forEach((ln: string, li: number) => {
          doc.text(ln, colXs[i] + cellPadX, y + 3.3 + li * lineH);
        });
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
      });
      y += rowH;
    }
  } catch (err) {
    // Never let a bad table crash the whole PDF — log, drop a small marker
    // in the report, and let the rest of the sheet render.
    console.error("[renderRepeatingTableBlock] render failed", err);
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(8);
    doc.text("(Table could not be rendered — see original scan)", margin, y + 4);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }
  return y + 1;
}


function renderBlankYesNoBoxes(doc: jsPDF, x: number, y: number, autoVal?: string, includeNa?: boolean): void {
  doc.setFontSize(7);
  doc.rect(x, y + 1, 3, 3);
  doc.text("YES", x + 4, y + 3.5);
  doc.rect(x + 14, y + 1, 3, 3);
  doc.text("NO", x + 18, y + 3.5);
  if (includeNa) {
    doc.rect(x + 26, y + 1, 3, 3);
    doc.text("N/A", x + 30, y + 3.5);
  }

  if (autoVal === "YES") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("✓", x + 0.5, y + 3.8);
    doc.setFont("helvetica", "normal");
  }

  doc.setFontSize(9.5);
}

function truncateToWidth(doc: jsPDF, value: string, maxWidth: number): string {
  if (maxWidth <= 0 || doc.getTextWidth(value) <= maxWidth) return value;

  let result = value;
  while (result.length > 1 && doc.getTextWidth(`${result}…`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function renderBlankSelectOptions(
  doc: jsPDF,
  x: number,
  y: number,
  options: string[],
  maxX: number,
  autoVal?: string,
  appendNa?: boolean,
  rowH: number = 6,
): void {
  const normalizedAutoVal = getRawFieldText(autoVal).toLowerCase();
  const upperCaseOptions = isYesNoOptions(options);

  // Append an N/A pseudo-option when the field is flagged allow_na and the
  // option list does not already include it.
  const hasNaInOptions = options.some((o) => NA_RESULT_TOKENS.has(o.toLowerCase()));
  const renderedOptions = appendNa && !hasNaInOptions ? [...options, "N/A"] : options;

  doc.setFontSize(7);
  const startX = x;
  let optionX = x;
  let currentY = y;

  for (const opt of renderedOptions) {
    const label = upperCaseOptions ? opt.toUpperCase() : opt;
    const labelW = doc.getTextWidth(label);
    // Full slot: 3mm checkbox + 1mm gap + label + 3mm trailing gap for pen tick clearance
    const slotW = 3 + 1 + labelW + 3;
    if (optionX + slotW > maxX && optionX > startX) {
      // Wrap onto the next line within the cell
      optionX = startX;
      currentY += rowH;
    }

    doc.rect(optionX, currentY + 1, 3, 3);

    if (normalizedAutoVal && normalizedAutoVal === opt.toLowerCase()) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("✓", optionX + 0.5, currentY + 3.8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }

    doc.text(label, optionX + 4, currentY + 3.5);
    optionX += slotW;
  }

  doc.setFontSize(9.5);
}

/**
 * Estimate how many wrapped rows a blank select-option group needs to fit
 * within `availableWidth`. Row growth means the calling row rectangle can
 * expand vertically so no option is clipped.
 */
export function estimateBlankSelectOptionRows(
  doc: jsPDF,
  options: string[],
  availableWidth: number,
  allowNa: boolean,
): number {
  const hasNa = options.some((o) => NA_RESULT_TOKENS.has(o.toLowerCase()));
  const rendered = allowNa && !hasNa ? [...options, "N/A"] : options;
  const upperCaseOptions = isYesNoOptions(options);
  const prevSize = (doc as any).internal.getFontSize?.() ?? 9.5;
  doc.setFontSize(7);
  let x = 0;
  let rows = 1;
  for (const opt of rendered) {
    const label = upperCaseOptions ? opt.toUpperCase() : opt;
    const slotW = 3 + 1 + doc.getTextWidth(label) + 3;
    if (x + slotW > availableWidth && x > 0) {
      rows++;
      x = 0;
    }
    x += slotW;
  }
  doc.setFontSize(prevSize);
  return rows;
}

/**
 * Total height a blank field row will occupy on the printed sheet. Select
 * fields with many/long options wrap onto multiple lines; the row grows to
 * match so options are never clipped.
 */
export function estimateBlankFieldRowH(
  doc: jsPDF,
  field: PdfTemplateField,
  rowH: number,
  resultCellWidth: number,
): number {
  if (field.type === "signature") return Math.max(rowH * 2, 12);
  if (field.type === "select" && field.options && field.options.length > 0) {
    const rows = estimateBlankSelectOptionRows(doc, field.options, resultCellWidth, !!field.allow_na);
    return rowH * rows;
  }
  return rowH;
}


function renderBlankUnderline(doc: jsPDF, x: number, y: number, width: number): void {
  doc.line(x, y + 3.5, x + Math.max(width, 8), y + 3.5);
}

function getSimpleResultKind(value: unknown): "positive" | "negative" | "na" | "custom" | "empty" {
  const rawValue = getRawFieldText(value);
  const normalizedValue = rawValue.toLowerCase();

  if (!rawValue) return "empty";
  if (POSITIVE_RESULT_TOKENS.has(normalizedValue)) return "positive";
  if (NEGATIVE_RESULT_TOKENS.has(normalizedValue)) return "negative";
  if (NA_RESULT_TOKENS.has(normalizedValue)) return "na";
  return "custom";
}

export function getYesNoFieldDisplayValue(field: PdfTemplateField, value: unknown): string {
  const label = field.label.toLowerCase();
  const isDrainField = label.includes("drain") || label.includes("drop leg");
  const rawValue = getRawFieldText(value);
  const resultKind = getSimpleResultKind(value);

  if (resultKind === "custom") return rawValue;
  if (isDrainField) return resultKind === "negative" ? "NO" : "YES";
  if (resultKind === "positive") return "YES";
  if (resultKind === "negative") return "NO";
  if (resultKind === "na") return "N/A";

  return hasRenderableValue(value) ? rawValue : "—";
}

/**
 * Build the set of field IDs that should be skipped in the PDF body
 * because they are already rendered in the header or footer areas.
 */
export function buildSkipIds(fields: PdfTemplateField[]): Set<string> {
  const skipIds = new Set<string>();
  const normalizedSections = new Set(fields.map((field) => normalizePdfText(field.section || "General")).filter(Boolean));

  fields.forEach((f) => {
    const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
    const normalizedLabel = normalizePdfText(f.label);

    if (normalizedSections.has(normalizedLabel)) {
      skipIds.add(f.id);
      return;
    }

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
  return fields.filter((f) => {
    if ((f.section || "General") !== section) return false;
    if (skipIds.has(f.id)) return false;
    // Skip fields whose label is just the section name (ghost rows from OCR section headers)
    const normLabel = normalizePdfText(f.label);
    const normSection = normalizePdfText(section);
    if (normLabel === normSection) return false;
    return true;
  });
}

/**
 * Like getSectionFields but ALSO drops:
 *   • fields whose answer is blank (undefined/null/""/"__omitted__"/empty array)
 *   • fields in a section listed under formData.__omitted_sections__
 * Used by the customer-facing PDF/Word so unanswered fields simply disappear
 * instead of printing a "—" placeholder row.
 */
export function getRenderableSectionFields(
  fields: PdfTemplateField[],
  section: string,
  skipIds: Set<string>,
  values: Record<string, unknown> | null | undefined,
  omittedSections?: string[] | null,
): PdfTemplateField[] {
  if (omittedSections && omittedSections.includes(section)) return [];
  const base = getSectionFields(fields, section, skipIds);
  if (!values) return base;
  return base.filter((f) => {
    // For repeating tables, use the row-level filter so tables with zero
    // real rows disappear entirely.
    if (f.type === "repeating_table") {
      const rowsVal = values[f.id];
      const parsed = typeof rowsVal === "string" && rowsVal.trim().startsWith("[")
        ? (() => { try { return JSON.parse(rowsVal as string); } catch { return []; } })()
        : rowsVal;
      return filterNonBlankRows(parsed).length > 0;
    }
    return !isBlankAnswer(values[f.id]);
  });
}

/**
 * Return only the section names that will actually render at least one field
 * once blank/omitted filtering is applied.
 */
export function getRenderableSections(
  fields: PdfTemplateField[],
  skipIds: Set<string>,
  values: Record<string, unknown> | null | undefined,
  omittedSections?: string[] | null,
): string[] {
  return getSections(fields).filter(
    (sec) => getRenderableSectionFields(fields, sec, skipIds, values, omittedSections).length > 0,
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
    // Signature fields need at least 10mm height — count them as 2 rows each
    for (const f of sf) {
      totalFieldRows += f.type === "signature" ? 2 : 1;
    }
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
  opts: { margin?: number; maxWidth?: number; colSplit?: number; sectionHeaderH?: number; showResultLabel?: boolean; handfill?: boolean } = {}
): number {
  const margin = opts.margin ?? 10;
  const maxWidth = opts.maxWidth ?? (doc.internal.pageSize.getWidth() - margin * 2);
  const colSplit = opts.colSplit ?? maxWidth * 0.68;
  const sectionHeaderH = opts.sectionHeaderH ?? 6;
  const showResultLabel = opts.showResultLabel ?? true;
  const handfill = opts.handfill ?? false;

  if (handfill) {
    // Lightweight section band: subtle grey fill + thin border so the heading
    // visually anchors the rows beneath it without overpowering the print.
    doc.setFillColor(...PDF_PALETTE.headerSoft);
    doc.rect(margin, y, maxWidth, sectionHeaderH, "F");
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, maxWidth, sectionHeaderH);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(section.toUpperCase(), margin + 2, y + 4.3);
    return y + sectionHeaderH;
  }

  // Light grey section header bar with black bold text (matches reference DOCX layout)
  doc.setFillColor(...PDF_PALETTE.headerStrip);
  doc.rect(margin, y, maxWidth, sectionHeaderH, "F");
  doc.setDrawColor(...PDF_PALETTE.border);
  doc.rect(margin, y, colSplit, sectionHeaderH);
  doc.rect(margin + colSplit, y, maxWidth - colSplit, sectionHeaderH);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(section.toUpperCase(), margin + 2, y + 4.3);
  if (showResultLabel) {
    doc.text("RESULT", margin + colSplit + 2, y + 4.3);
  }

  return y + sectionHeaderH;
}

export interface RenderFieldRowOpts {
  margin?: number;
  maxWidth?: number;
  colSplit?: number;
  rowH: number;
  handfill?: boolean;
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
  // Repeating tables (grids like zone-valve-checks per floor, flow &
  // pressure test rows). Rendered as a bordered table with column headers.
  // Photo-gallery tables (dwelling access log) are skipped here — a dedicated
  // renderer in JobSheetPdfExport draws them with photos below the main body.
  if (field.type === "repeating_table" && Array.isArray((field as any).columns)) {
    const cols: any[] = (field as any).columns;
    const hasGallery = cols.some((c: any) => c?.type === "photo_gallery" || c?.type === "photo");
    if (hasGallery) return y; // handled elsewhere
    let rows: any[] = [];
    if (Array.isArray(value)) rows = value;
    else if (typeof value === "string" && value.trim().startsWith("[")) {
      try { rows = JSON.parse(value); } catch { rows = []; }
    }
    rows = filterNonBlankRows(rows);
    if (rows.length === 0) return y;
    return renderRepeatingTableBlock(doc, field, cols, rows, y, { margin, maxWidth });
  }

  const baseRowH = field.type === "signature" ? Math.max(opts.rowH * 2, 10) : opts.rowH;
  const resultCellWidth = maxWidth - colSplit - 2;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9.5);
  const labelLines = doc.splitTextToSize(field.label, colSplit - 3);

  // ── Descriptive-text early exit ──
  // If the value is a multi-word string (contains a space or dash beyond simple tokens
  // like "yes", "no", "pass", "fail", "n/a"), render it verbatim regardless of field type.
  const SIMPLE_TOKENS = new Set(["yes", "no", "pass", "fail", "n/a", "na", "true", "false", ""]);
  const rawTextForCheck = getRawFieldText(value);
  const isDescriptiveText =
    typeof value === "string" &&
    rawTextForCheck.length > 0 &&
    !SIMPLE_TOKENS.has(rawTextForCheck.toLowerCase());

  // Pre-compute wrapped value lines for descriptive text so we can grow the
  // row height to fit — nothing must ever clip past the right edge of the cell.
  let descriptiveLines: string[] | null = null;
  if (isDescriptiveText) {
    descriptiveLines = doc.splitTextToSize(rawTextForCheck, resultCellWidth);
  } else if (
    field.type !== "pass_fail" &&
    field.type !== "checkbox" &&
    field.type !== "yes_no" &&
    field.type !== "photo" &&
    field.type !== "signature" &&
    !(field.options && field.options.length <= 3 && field.options.some((o) => o.toLowerCase() === "yes")) &&
    hasRenderableValue(value)
  ) {
    // Long plain text values also wrap in the RESULT cell.
    descriptiveLines = doc.splitTextToSize(String(value), resultCellWidth);
  }

  const lineH = 3.5;
  const contentLines = Math.max(labelLines.length, descriptiveLines?.length || 1);
  const rowH = Math.max(baseRowH, contentLines * lineH + 2);

  doc.setDrawColor(180);
  doc.rect(margin, y, colSplit, rowH);
  doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

  // Label (wrap onto multiple lines when needed)
  labelLines.forEach((ln: string, i: number) => {
    doc.text(ln, margin + 1, y + 3 + i * lineH);
  });

  if (descriptiveLines) {
    descriptiveLines.forEach((ln, i) => {
      doc.text(ln, margin + colSplit + 1, y + 3 + i * lineH);
    });
  }
  // Value (typed fields)
  else if (field.type === "pass_fail") {
    const rawValue = getRawFieldText(value);
    const resultKind = getSimpleResultKind(value);
    const displayVal = resultKind === "positive"
      ? "PASS"
      : resultKind === "negative"
      ? "FAIL"
      : resultKind === "na"
      ? "N/A"
      : resultKind === "custom"
      ? rawValue
      : "—";
    if (displayVal === "PASS") { doc.setTextColor(0, 128, 0); doc.setFont("helvetica", "bold"); }
    else if (displayVal === "FAIL") { doc.setTextColor(200, 0, 0); doc.setFont("helvetica", "bold"); }
    else if (displayVal === "N/A") { doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold"); }
    doc.text(displayVal, margin + colSplit + 1, y + 3);
  } else if (field.type === "checkbox") {
    // Default drain / drop-leg checkboxes to YES when value is missing/falsy
    const lbl = field.label.toLowerCase();
    const isDrainField = lbl.includes("drain") || lbl.includes("drop leg");
    const rawValue = getRawFieldText(value);
    const resultKind = getSimpleResultKind(value);

    if (resultKind === "custom") {
      doc.text(rawValue, margin + colSplit + 1, y + 3);
    } else if (resultKind === "na") {
      doc.text("N/A", margin + colSplit + 1, y + 3);
    } else if (resultKind === "empty" && !isDrainField) {
      // If no value was captured at all (undefined/null), show dash not "NO"
      doc.text("—", margin + colSplit + 1, y + 3);
    } else {
      const resolved = resultKind === "positive"
        ? true
        : resultKind === "negative"
        ? false
        : isDrainField
        ? (value === false ? false : true)
        : !!value;
      doc.text(resolved ? "YES" : "NO", margin + colSplit + 1, y + 3);
    }
  } else if (field.type === "yes_no" || (field.options && field.options.length <= 3 && field.options.some((o) => o.toLowerCase() === "yes"))) {
    const displayVal = getYesNoFieldDisplayValue(field, value);
    if (displayVal === "NO") { doc.setTextColor(200, 0, 0); doc.setFont("helvetica", "bold"); }
    doc.text(displayVal, margin + colSplit + 1, y + 3);
  } else if (field.type === "photo") {
    doc.text(value ? "✓ Captured" : "—", margin + colSplit + 1, y + 3);
  } else if (field.type === "signature") {
    if (value && typeof value === "string" && value.startsWith("data:image")) {
      try {
        const sigH = Math.min(rowH - 1, 8);
        const sigW = sigH * 3; // ~3:1 aspect ratio for signature canvas
        doc.addImage(value, "PNG", margin + colSplit + 1, y + 0.5, sigW, sigH);
      } catch {
        doc.text("✓ Signed", margin + colSplit + 1, y + 3);
      }
    } else {
      doc.text("—", margin + colSplit + 1, y + 3);
    }
  } else {
    const raw = hasRenderableValue(value) ? String(value) : "—";
    doc.text(raw, margin + colSplit + 1, y + 3);
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  let extraY = 0;
  // Inline note — placed in the result column, immediately after the YES/NO answer
  if (noteValue) {
    // Find roughly where the answer text ended in the result column
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    const answerWidths: Record<string, number> = {
      YES: doc.getTextWidth("YES"),
      NO: doc.getTextWidth("NO"),
      "N/A": doc.getTextWidth("N/A"),
      "—": doc.getTextWidth("—"),
    };
    // Approximate: assume the rendered answer was YES/NO/N/A — leave a small gap
    const startX = margin + colSplit + 1 + (answerWidths.YES + 2);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    const maxNoteW = (margin + maxWidth) - startX - 1;
    const lines = doc.splitTextToSize(`(${noteValue})`, Math.max(20, maxNoteW));
    doc.text(lines[0], startX, y + 3);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
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
  const handfill = opts.handfill ?? false;

  // Compute the actual row height — select fields with many/long options
  // wrap onto multiple lines and grow the row so nothing is clipped.
  const resultCellWidth = maxWidth - colSplit - 4;
  const actualRowH = estimateBlankFieldRowH(doc, field, rowH, resultCellWidth);

  // Always draw the row borders so each field reads as a discrete box on the
  // printed sheet. Use a lighter grey for the handfill version so the lines
  // stay subtle on a printed/photocopied page.
  doc.setDrawColor(handfill ? 200 : 180);
  doc.rect(margin, y, colSplit, actualRowH);
  doc.rect(margin + colSplit, y, maxWidth - colSplit, actualRowH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
  doc.text(label, margin + 2, y + 3.5);
  doc.setFont("helvetica", "normal");

  const labelLower = field.label.toLowerCase();
  const isDateField = field.type === "date" || /\bdate\b/.test(labelLower);

  if (field.type === "pass_fail") {
    const bx = margin + colSplit + 2;
    doc.setFontSize(8.5);
    doc.rect(bx, y + 1, 3, 3); doc.text("P", bx + 4, y + 3.5);
    doc.rect(bx + 10, y + 1, 3, 3); doc.text("F", bx + 14, y + 3.5);
    doc.rect(bx + 20, y + 1, 3, 3); doc.text("N/A", bx + 24, y + 3.5);
    doc.setFontSize(9.5);
  } else if (field.type === "checkbox") {
    renderBlankYesNoBoxes(doc, margin + colSplit + 2, y, autoVal, !!field.allow_na);
  } else if (field.type === "select" && field.options && isYesNoOptions(field.options)) {
    renderBlankSelectOptions(doc, margin + colSplit + 2, y, field.options, margin + maxWidth - 2, autoVal, !!field.allow_na, rowH);
  } else if (field.type === "select" && field.options && field.options.length > 0) {
    renderBlankSelectOptions(doc, margin + colSplit + 2, y, field.options, margin + maxWidth - 2, autoVal, !!field.allow_na, rowH);
  } else if (isQuestionStyleYesNoField(field)) {
    renderBlankYesNoBoxes(doc, margin + colSplit + 2, y, autoVal, !!field.allow_na);
  } else if (field.type === "signature" || field.type === "photo" || field.type === "file") {
    // Capture-style fields: leave the cell blank for the engineer to fill in,
    // but render an N/A tickbox on the right edge when allow_na is enabled so
    // the field can be marked as not applicable on the printed sheet.
    if (field.allow_na) renderBlankNaBox(doc, margin + maxWidth - 12, y);
  } else if (autoVal) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const truncVal = doc.splitTextToSize(autoVal, maxWidth - colSplit - 4).slice(0, 1).join("");
    doc.text(truncVal, margin + colSplit + 2, y + 3.5);
    doc.setFontSize(9.5);
    if (field.allow_na) renderBlankNaBox(doc, margin + maxWidth - 12, y);
  } else if (isDateField) {
    // Render an underscored date placeholder: _______ / _______ / _______
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("_______ / _______ / _______", margin + colSplit + 2, y + 3.5);
    if (field.allow_na) renderBlankNaBox(doc, margin + maxWidth - 12, y);
  } else {
    // Plain writable text / number / textarea / short_text field. Draw a
    // ruled writing line (like the Comments block) inside the result cell
    // so it's obviously a write-here space. Textareas get multiple lines
    // stacked within the taller row.
    const naReserve = field.allow_na ? 14 : 2;
    const lineStartX = margin + colSplit + 2;
    const lineEndX = margin + maxWidth - naReserve;
    doc.setDrawColor(handfill ? 180 : 150);
    doc.setLineWidth(0.2);
    const isMultiline = field.type === "textarea" || field.type === "long_text";
    const lineSpacing = 5;
    // First writing line sits near the baseline so it reads as a rule to
    // write ON (not a strike-through above the text).
    const firstLineY = y + actualRowH - 1.5;
    doc.line(lineStartX, firstLineY, lineEndX, firstLineY);
    if (isMultiline) {
      // Stack additional lines going upward until we run out of row height.
      let ly = firstLineY - lineSpacing;
      while (ly > y + 2) {
        doc.line(lineStartX, ly, lineEndX, ly);
        ly -= lineSpacing;
      }
    }
    if (field.allow_na) renderBlankNaBox(doc, margin + maxWidth - 12, y);
  }
  // For text/number/textarea/short_text fields the ruled writing line above
  // ensures the answer cell is obviously a write-here space.

  return y + actualRowH;
}


function renderBlankNaBox(doc: jsPDF, x: number, y: number): void {
  const prevSize = (doc as any).internal.getFontSize?.() ?? 9.5;
  doc.setFontSize(7);
  doc.rect(x, y + 1, 3, 3);
  doc.text("N/A", x + 4, y + 3.5);
  doc.setFontSize(prevSize);
}
