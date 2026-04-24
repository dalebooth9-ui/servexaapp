import jsPDF from "jspdf";

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
  // Signature fields get double-height rows so the image renders clearly
  const rowH = field.type === "signature" ? Math.max(opts.rowH * 2, 10) : opts.rowH;

  doc.setDrawColor(180);
  doc.rect(margin, y, colSplit, rowH);
  doc.rect(margin + colSplit, y, maxWidth - colSplit, rowH);

  // Label
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8.5);
  const label = doc.splitTextToSize(field.label, colSplit - 3).slice(0, 1)[0];
  doc.text(label, margin + 1, y + 3);

  // ── Descriptive-text early exit ──
  // If the value is a multi-word string (contains a space or dash beyond simple tokens
  // like "yes", "no", "pass", "fail", "n/a"), render it verbatim regardless of field type.
  const SIMPLE_TOKENS = new Set(["yes", "no", "pass", "fail", "n/a", "na", "true", "false", ""]);
  const rawTextForCheck = getRawFieldText(value);
  const isDescriptiveText =
    typeof value === "string" &&
    rawTextForCheck.length > 0 &&
    !SIMPLE_TOKENS.has(rawTextForCheck.toLowerCase());

  // DEBUG: log every field value so we can trace what reaches the PDF renderer
  console.log(`[PDF-RENDER] field="${field.label}" type="${field.type}" value=`, JSON.stringify(value), `typeof=${typeof value} isDescriptive=${isDescriptiveText}`);

  if (isDescriptiveText) {
    const truncated = rawTextForCheck.substring(0, 60);
    doc.text(truncated, margin + colSplit + 1, y + 3);
  }
  // Value
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
    const raw = hasRenderableValue(value) ? String(value).substring(0, 50) : "—";
    doc.text(raw, margin + colSplit + 1, y + 3);
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  let extraY = 0;
  // Inline note — placed in the result column, immediately after the YES/NO answer
  if (noteValue) {
    // Find roughly where the answer text ended in the result column
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    const answerWidths: Record<string, number> = {
      YES: doc.getTextWidth("YES"),
      NO: doc.getTextWidth("NO"),
      "N/A": doc.getTextWidth("N/A"),
      "—": doc.getTextWidth("—"),
    };
    // Approximate: assume the rendered answer was YES/NO/N/A — leave a small gap
    const startX = margin + colSplit + 1 + (answerWidths.YES + 2);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    const maxNoteW = (margin + maxWidth) - startX - 1;
    const lines = doc.splitTextToSize(`(${noteValue})`, Math.max(20, maxNoteW));
    doc.text(lines[0], startX, y + 3);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8.5);
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
    // If auto-value is YES, draw a tick in the YES box
    if (autoVal === "YES") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("✓", bx + 0.5, y + 3.8);
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(8.5);
  } else if (field.type === "select" && field.options && field.options.some(o => o.toLowerCase() === "yes") && field.options.some(o => o.toLowerCase() === "no")) {
    const bx = margin + colSplit + 2;
    doc.setFontSize(6);
    let ox = bx;
    for (const opt of field.options) {
      doc.rect(ox, y + 1, 3, 3);
      // If auto-value matches this option, draw a tick
      if (autoVal && autoVal.toLowerCase() === opt.toLowerCase()) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("✓", ox + 0.5, y + 3.8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
      }
      doc.text(opt.toUpperCase(), ox + 4, y + 3.5);
      ox += 4 + doc.getTextWidth(opt.toUpperCase()) + 3;
    }
    doc.setFontSize(8.5);
  } else {
    const lbl = field.label.trim();
    const isYesNoQuestion =
      field.type === "yes_no" ||
      lbl.endsWith("?") ||
      /^(bs|en)\s*\d/i.test(lbl);
    const incompatibleType =
      field.type === "text" || field.type === "number" || field.type === "date" ||
      field.type === "textarea" || field.type === "long_text" ||
      field.type === "signature" || field.type === "photo" ||
      field.type === "image" || field.type === "file";

    if (isYesNoQuestion && !incompatibleType) {
      const bx = margin + colSplit + 2;
      doc.setFontSize(6);
      doc.rect(bx, y + 1, 3, 3); doc.text("YES", bx + 4, y + 3.5);
      doc.rect(bx + 14, y + 1, 3, 3); doc.text("NO", bx + 18, y + 3.5);
      if (autoVal === "YES") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("✓", bx + 0.5, y + 3.8);
        doc.setFont("helvetica", "normal");
      }
      doc.setFontSize(8.5);
    } else if (autoVal) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const truncVal = doc.splitTextToSize(autoVal, maxWidth - colSplit - 4).slice(0, 1).join("");
      doc.text(truncVal, margin + colSplit + 2, y + 3.5);
      doc.setFontSize(8.5);
    }
  }

  return y + rowH;
}
