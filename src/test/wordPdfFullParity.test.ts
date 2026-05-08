/**
 * Full Word ↔ PDF parity check.
 *
 * `wordPdfParity.test.ts` proves that the body sections + fields appear in
 * the same order. This file goes further: it derives the **complete** set of
 * text tokens and table-spacing dimensions the PDF would render for a given
 * template, then flags ANY difference in the Word export — extra rows,
 * missing labels, mismatched column splits, mismatched row heights.
 *
 * Anything that diverges between the two generators (header detail labels,
 * Comments box, sign-off labels, footer declaration, table column widths,
 * standard row heights) will fail this test with a precise diagnostic.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import {
  buildBlankTemplateDoc,
  TABLE_W,
  LABEL_COL,
  VALUE_COL,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";
import {
  buildSkipIds,
  getSections,
  getSectionFields,
  type PdfTemplateField,
} from "@/lib/pdfBody";
import { getDefaultFooterText } from "@/lib/pdfFooter";

// ---------------------------------------------------------------------------
// JSDOM/node stubs (mirrors wordPdfParity.test.ts).
// ---------------------------------------------------------------------------
const PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
  new Response(PNG_1x1, { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
class StubImage {
  naturalWidth = 16;
  naturalHeight = 16;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

// ---------------------------------------------------------------------------
// Fixtures — exercise header dedupe, ghost rows, all value-cell flavours, and
// the footer declaration mapping.
// ---------------------------------------------------------------------------
const FIXTURES: WordTemplateInput[] = [
  {
    name: "Dry Riser Visual Inspection",
    fields: [
      { id: "f_customer", label: "Customer", type: "text", section: "Site Details" },
      { id: "f_date", label: "Date", type: "date", section: "Site Details" },
      { id: "f_site", label: "Site", type: "text", section: "Site Details" },
      { id: "f_riser", label: "Riser Location", type: "text", section: "Site Details" },
      { id: "f_sec_outlet", label: "Outlet hardware", type: "section", section: "Outlet hardware" },
      { id: "f_outlet_cabinets", label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?", type: "yes_no", section: "Outlet hardware" },
      { id: "f_outlet_pf", label: "Outlet caps fitted?", type: "pass_fail", section: "Outlet hardware" },
      { id: "f_inlet_ghost", label: "Inlet", type: "text", section: "Inlet" },
      { id: "f_inlet_drain", label: "Drain valve fitted?", type: "yes_no", section: "Inlet" },
      { id: "f_inlet_select", label: "Coupling type", type: "select", options: ["BS336", "Storz"], section: "Inlet" },
      { id: "f_inlet_note", label: "Engineer notes", type: "textarea", section: "Inlet" },
      { id: "f_inlet_sig", label: "Witness signature", type: "signature", section: "Inlet" },
    ],
  },
  {
    name: "Fire Extinguisher Service Sheet",
    fields: [
      { id: "g_ref", label: "Job Ref", type: "text", section: "Details" },
      { id: "g_pressure", label: "Pressure (bar)", type: "number", section: "Cylinder" },
      { id: "g_status", label: "Status", type: "select", options: ["Yes", "No"], section: "Cylinder" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
async function unpackDocx(template: WordTemplateInput) {
  const doc = await buildBlankTemplateDoc(template);
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const out: Record<string, string> = {};
  for (const f of ["word/document.xml", "word/header1.xml", "word/footer1.xml"]) {
    const file = zip.file(f);
    out[f] = file ? await file.async("string") : "";
  }
  return out;
}

function textNodes(xml: string): string[] {
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const t = m[1];
    if (t.trim().length > 0) out.push(t);
  }
  return out;
}

/** Extract every <w:gridCol w:w="N"/> width per containing <w:tbl>. */
function tableGrids(xml: string): number[][] {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  return tbls.map((tbl) => {
    const widths: number[] = [];
    const re = /<w:gridCol[^/]*w:w="(\d+)"\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tbl)) !== null) widths.push(Number(m[1]));
    return widths;
  });
}

/** Extract <w:trHeight w:val="N"/> values for every row in document order. */
function rowHeights(xml: string): number[] {
  const out: number[] = [];
  const re = /<w:trHeight\s+w:val="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(Number(m[1]));
  return out;
}

/**
 * Canonical PDF token list — exactly what the PDF generator renders for a
 * blank template (header detail labels, sections, field labels, Comments
 * label, sign-off labels, footer declaration).
 *
 * If the PDF generator changes (e.g. renames a sign-off label), update this
 * model AND the matching Word builder — the parity test will keep them
 * aligned.
 */
function expectedPdfTokens(template: WordTemplateInput): {
  headerDetailLabels: string[];
  sections: { name: string; fieldLabels: string[] }[];
  commentsLabel: string;
  signOffLabels: string[];
  footer: string | null;
} {
  const pdfFields = template.fields as unknown as PdfTemplateField[];
  const skipIds = buildSkipIds(pdfFields);
  const sections = getSections(pdfFields)
    .map((s) => ({
      name: s,
      fieldLabels: getSectionFields(pdfFields, s, skipIds).map((f) => f.label),
    }))
    .filter((s) => s.fieldLabels.length > 0);
  return {
    headerDetailLabels: ["Customer:", "DATE:", "Site:", "PO/REF:", "Riser Location:"],
    sections,
    commentsLabel: "Comments:",
    // PDF renderPdfSignatures (blank mode) emits Date / Technician / Signature
    // on the left and Date / Customer / Signature on the right.
    signOffLabels: ["Date:", "Technician:", "Signature:", "Date:", "Customer:", "Signature:"],
    footer: getDefaultFooterText(template.name, undefined, null),
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------
describe.each(FIXTURES)("Word ↔ PDF full parity — $name", (template) => {
  const expected = expectedPdfTokens(template);

  it("emits every header detail label the PDF emits", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);
    for (const label of expected.headerDetailLabels) {
      expect(tokens, `Missing header detail label "${label}"`).toContain(label);
    }
  });

  it("emits the Comments label and full sign-off label set", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);
    expect(tokens).toContain(expected.commentsLabel);
    // Sign-off block has each label exactly twice (Date / Signature) or once
    // per column (Technician / Customer). Count occurrences and check minima.
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    expect(counts.get("Date:") ?? 0).toBeGreaterThanOrEqual(2);
    expect(counts.get("Signature:") ?? 0).toBeGreaterThanOrEqual(2);
    expect(counts.get("Technician:") ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts.get("Customer:") ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("renders the same footer declaration the PDF would render", async () => {
    const { "word/footer1.xml": footerXml } = await unpackDocx(template);
    if (expected.footer) {
      expect(textNodes(footerXml)).toContain(expected.footer);
    }
  });

  it("never includes text the PDF would not render (no spurious body labels)", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);
    const allowed = new Set<string>([
      ...expected.headerDetailLabels,
      ...expected.sections.flatMap((s) => [s.name.toUpperCase(), ...s.fieldLabels]),
      expected.commentsLabel,
      "RESULT", // section value-column header
      "Date:", "Technician:", "Customer:", "Signature:",
    ]);
    // Any value-cell glyph (checkbox, underline, option label) is ignored —
    // we only care about bold, label-class strings. Filter to tokens that
    // look like proper labels (contain a letter and don't start with the
    // checkbox glyph) and aren't in the value-cell allowlist.
    const VALUE_CELL_ALLOW = new Set([
      "P", "F", "N/A", "YES", "NO", "BS336", "Storz", "Yes", "No",
      "Photo attached",
    ]);
    const offending = tokens.filter((t) => {
      if (allowed.has(t)) return false;
      if (VALUE_CELL_ALLOW.has(t)) return false;
      // Strip leading checkbox + space for "☐ YES" style runs.
      const stripped = t.replace(/^[\u2610\u2611]\s*/, "").trim();
      if (!stripped) return false;
      // Single letters / option labels rendered next to checkboxes.
      if (VALUE_CELL_ALLOW.has(stripped)) return false;
      // Underline placeholders are runs of underscores or spaces only.
      if (/^[_\s/]+$/.test(stripped)) return false;
      // "Signature: ___" placeholder line for signature value cells.
      if (stripped.startsWith("Signature:")) return false;
      // Anything else is a body label — must be in allowed set.
      return true;
    });
    expect(
      offending,
      `Word body contains text the PDF would not render: ${JSON.stringify(offending)}`,
    ).toEqual([]);
  });

  it("uses the same table column splits as the PDF (header grid, body, sign-off)", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const grids = tableGrids(docXml);
    // 1) Header detail grid — 4 cols summing to TABLE_W (Customer/DATE,
    //    Site/PO-REF, Riser Location).
    const headerGrid = grids[0];
    expect(headerGrid).toHaveLength(4);
    expect(headerGrid.reduce((a, b) => a + b, 0)).toBeCloseTo(TABLE_W, -1);

    // 2) Each body section table — 2 cols [LABEL_COL, VALUE_COL].
    const bodyGrids = grids.slice(1, 1 + expected.sections.length);
    expect(bodyGrids.length).toBe(expected.sections.length);
    for (const g of bodyGrids) {
      expect(g).toEqual([LABEL_COL, VALUE_COL]);
    }

    // 3) Comments table — single column spanning TABLE_W.
    const commentsGrid = grids[1 + expected.sections.length];
    expect(commentsGrid).toEqual([TABLE_W]);

    // 4) Sign-off grid — 4 cols summing to TABLE_W (Label/Value × 2).
    const signOffGrid = grids[2 + expected.sections.length];
    expect(signOffGrid).toHaveLength(4);
    expect(signOffGrid.reduce((a, b) => a + b, 0)).toBeCloseTo(TABLE_W, -1);
  });

  it("uses standard PDF row heights (no spurious tall rows)", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const heights = rowHeights(docXml);
    // Every declared row height must be one of the documented values used by
    // the Word builder (mirrors PDF row footprint). If a future change
    // introduces a different row height, this list must be updated and the
    // PDF generator's matching dimension reviewed.
    const ALLOWED = new Set([200, 220, 240, 260, 300, 320, 420, 520]);
    const offending = heights.filter((h) => !ALLOWED.has(h));
    expect(
      offending,
      `Unexpected row heights ${JSON.stringify(offending)} — keep PDF/Word row footprint in sync`,
    ).toEqual([]);
  });

  it("preserves the order of sections and fields end-to-end", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);
    let cursor = 0;
    for (const section of expected.sections) {
      const sIdx = tokens.indexOf(section.name.toUpperCase(), cursor);
      expect(sIdx, `Section "${section.name}" out of order`).toBeGreaterThanOrEqual(cursor);
      cursor = sIdx + 1;
      for (const label of section.fieldLabels) {
        const fIdx = tokens.indexOf(label, cursor);
        expect(fIdx, `Field "${label}" out of order under "${section.name}"`).toBeGreaterThanOrEqual(cursor);
        cursor = fIdx + 1;
      }
    }
    // Sign-off block sits AFTER every section.
    const commentsIdx = tokens.indexOf("Comments:", cursor);
    expect(commentsIdx, "Comments label must follow all body sections").toBeGreaterThanOrEqual(cursor);
  });
});
