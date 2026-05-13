/**
 * Word ↔ PDF layout parity regression test.
 *
 * The PDF (jsPDF) and Word (docx-js) blank-template exports must always
 * present the same logical document: the same sections, the same field rows
 * in the same order, the same Comments box, the same two-column Date /
 * Technician / Customer / Signature sign-off block, the same footer
 * declaration, and the same A4 page geometry.
 *
 * Both generators must therefore agree on:
 *   1. which fields are skipped (rendered in the header instead of the body)
 *   2. the order of sections
 *   3. the order of fields within each section
 *   4. which footer declaration applies to a given template name
 *
 * The PDF helpers in `src/lib/pdfBody.ts` are the single source of truth for
 * (1) – (3); the Word builder consumes them directly. The test below proves
 * the resulting .docx mirrors that model so a regression in either generator
 * (e.g. someone reverts the Word builder back to its old bespoke filter)
 * is caught immediately.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import {
  buildBlankTemplateDoc,
  type WordTemplateInput,
  type TemplateField,
} from "@/lib/wordTemplateBuilder";
import {
  buildSkipIds,
  getSections,
  getSectionFields,
  type PdfTemplateField,
} from "@/lib/pdfBody";
import { getDefaultFooterText } from "@/lib/pdfFooter";

// ---------------------------------------------------------------------------
// Small JSDOM-friendly stub for the image fetch the Word builder performs.
// We don't need real bytes — we just need fetch() not to throw so the doc
// builds in node.
// ---------------------------------------------------------------------------
const PNG_1x1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
  new Response(PNG_1x1, {
    status: 200,
    headers: { "content-type": "image/png" },
  })) as unknown as typeof fetch;

// jsdom doesn't decode <img>; resolve immediately so fetchImageBytes doesn't
// hang on a never-firing onload.
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
// Test fixtures — representative shapes that exercise the parity contract:
//   • a header field that should be skipped from the body
//   • a section-header ghost row (label === section name)
//   • a "section" type that should be filtered out
//   • a value-cell type per supported flavour (yes_no / pass_fail / select /
//     date / number / signature / textarea / text)
// ---------------------------------------------------------------------------
const FIXTURES: WordTemplateInput[] = [
  {
    name: "Dry Riser Visual Inspection",
    fields: [
      // Header-only fields — must be skipped from body in BOTH generators.
      { id: "f_customer", label: "Customer", type: "text", section: "Site Details" },
      { id: "f_date", label: "Date", type: "date", section: "Site Details" },
      { id: "f_site", label: "Site", type: "text", section: "Site Details" },
      { id: "f_riser", label: "Riser Location", type: "text", section: "Site Details" },
      // Body sections.
      { id: "f_sec_outlet", label: "Outlet hardware", type: "section", section: "Outlet hardware" },
      {
        id: "f_outlet_cabinets",
        label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?",
        type: "yes_no",
        section: "Outlet hardware",
      },
      { id: "f_outlet_pf", label: "Outlet caps fitted?", type: "pass_fail", section: "Outlet hardware" },
      // Section ghost row — same label as section name; must drop in both.
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
// Helper: extract the Word doc XML contents (document/header/footer).
// ---------------------------------------------------------------------------
async function unpackDocx(template: WordTemplateInput) {
  const doc = await buildBlankTemplateDoc(template);
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const files = ["word/document.xml", "word/header1.xml", "word/footer1.xml"];
  const out: Record<string, string> = {};
  for (const f of files) {
    const file = zip.file(f);
    out[f] = file ? await file.async("string") : "";
  }
  return out;
}

/** All <w:t>…</w:t> text nodes from an XML string, in document order. */
function textNodes(xml: string): string[] {
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe.each(FIXTURES)("Word ↔ PDF parity — $name", (template) => {
  const pdfFields = template.fields as unknown as PdfTemplateField[];
  const skipIds = buildSkipIds(pdfFields);
  const expectedSections = getSections(pdfFields)
    .map((s) => ({
      name: s,
      fields: getSectionFields(pdfFields, s, skipIds),
    }))
    .filter((s) => s.fields.length > 0);
  const expectedFooter = getDefaultFooterText(template.name, undefined, null);

  it("renders the same ordered sections as the PDF", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);

    let cursor = 0;
    for (const section of expectedSections) {
      const sectionUpper = section.name.toUpperCase();
      const idx = tokens.indexOf(sectionUpper, cursor);
      expect(
        idx,
        `Section header "${sectionUpper}" missing or out of order from cursor=${cursor}`,
      ).toBeGreaterThanOrEqual(cursor);
      cursor = idx + 1;
      for (const field of section.fields as TemplateField[]) {
        const fieldIdx = tokens.indexOf(field.label, cursor);
        expect(
          fieldIdx,
          `Field "${field.label}" must appear under section "${section.name}" after cursor=${cursor}`,
        ).toBeGreaterThanOrEqual(cursor);
        cursor = fieldIdx + 1;
      }
    }
  });

  it("never renders fields the PDF would skip (header dedupe)", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);
    const skipped = (template.fields as TemplateField[]).filter((f) => skipIds.has(f.id));
    for (const f of skipped) {
      // The header grid uses fixed labels ("Customer:", "DATE:", "Site:",
      // "PO/REF:", "Riser Location:") — those are deliberately present.
      // We're checking the BODY tables don't re-render the field's label.
      // A label like "Customer" (no colon) appearing as a body row would be
      // a regression; the header uses "Customer:" with a colon.
      const offending = tokens.filter((t) => t === f.label);
      expect(
        offending.length,
        `Field "${f.label}" should be skipped from body (rendered in header).`,
      ).toBe(0);
    }
  });

  it("includes the Comments box and two-column sign-off block", async () => {
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const tokens = textNodes(docXml);
    expect(tokens).toContain("Comments:");
    // Sign-off rows: Date / Technician / Customer / Signature, with Date and
    // Signature appearing twice (left + right column).
    expect(tokens.filter((t) => t === "Date:").length).toBeGreaterThanOrEqual(2);
    expect(tokens.filter((t) => t === "Signature:").length).toBeGreaterThanOrEqual(2);
    expect(tokens).toContain("Technician:");
    expect(tokens).toContain("Customer:");
  });

  it("protects the Comments + sign-off block from page-2 overflow", async () => {
    // Word natively splits table rows across pages. For the sign-off block
    // we need every row marked unsplittable (`<w:cantSplit/>`) so a single
    // row never breaks across page 1/2. There are exactly 4 such rows:
    // 1× Comments cell + 3× sign-off (Date / Name / Signature). Allow >=4
    // so future extra rows added with the same protection are OK.
    const { "word/document.xml": docXml } = await unpackDocx(template);
    const cantSplitMatches = docXml.match(/<w:cantSplit\s*\/>/g) || [];
    expect(
      cantSplitMatches.length,
      "Comments + every sign-off row must set <w:cantSplit/> to prevent mid-row page breaks",
    ).toBeGreaterThanOrEqual(4);

    // The "Comments:" label paragraph must use <w:keepNext/> so it stays
    // glued to the box that follows it (otherwise the label could end up
    // alone at the bottom of page 1 with the box on page 2).
    expect(docXml).toMatch(/<w:keepNext\s*\/>/);
  });

  it("renders the same footer declaration the PDF would render", async () => {
    const { "word/footer1.xml": footerXml } = await unpackDocx(template);
    if (expectedFooter) {
      expect(textNodes(footerXml)).toContain(expectedFooter);
    }
  });

  it("uses A4 page size with the correct margins per template", async () => {
    // Post-refactor: Dry Riser uses the SHARED dryRiserLayout (12mm L/R,
    // 10mm T/B) so Word + PDF page geometry match exactly. Other templates
    // keep the legacy auto-scaled geometry (top/bottom 720, L/R 567).
    const { DRY_RISER_LAYOUT, isDryRiserName } = await import("@/lib/dryRiserLayout");
    const { "word/document.xml": docXml } = await unpackDocx(template);
    expect(docXml).toMatch(/w:pgSz[^/]*w:w="11906"/);
    expect(docXml).toMatch(/w:pgSz[^/]*w:h="16838"/);
    const isDryRiser = isDryRiserName(template.name);
    const expTop = isDryRiser ? DRY_RISER_LAYOUT.page.marginTopDxa : 720;
    const expBottom = isDryRiser ? DRY_RISER_LAYOUT.page.marginBottomDxa : 720;
    const expLeft = isDryRiser ? DRY_RISER_LAYOUT.page.marginLeftDxa : 567;
    const expRight = isDryRiser ? DRY_RISER_LAYOUT.page.marginRightDxa : 567;
    expect(docXml).toMatch(new RegExp(`w:pgMar[^/]*w:top="${expTop}"`));
    expect(docXml).toMatch(new RegExp(`w:pgMar[^/]*w:bottom="${expBottom}"`));
    expect(docXml).toMatch(new RegExp(`w:pgMar[^/]*w:left="${expLeft}"`));
    expect(docXml).toMatch(new RegExp(`w:pgMar[^/]*w:right="${expRight}"`));
  });

  it("uses the same ~68 / 32 label/value column split as the PDF", async () => {
    // Body tables declare [labelCol, valueCol] computed from the template's
    // resolved page width. Dry Riser ⇒ tableW=10546 (12mm margins) ⇒
    // 7171/3375. Default ⇒ tableW=10772 ⇒ 7325/3447.
    const { computeTableLayout } = await import("@/lib/wordTemplateBuilder");
    const { DRY_RISER_LAYOUT, isDryRiserName } = await import("@/lib/dryRiserLayout");
    const isDryRiser = isDryRiserName(template.name);
    const layout = isDryRiser
      ? computeTableLayout({
          pageWidth: DRY_RISER_LAYOUT.page.widthDxa,
          pageMargin: DRY_RISER_LAYOUT.page.marginLeftDxa,
        })
      : computeTableLayout();
    const { "word/document.xml": docXml } = await unpackDocx(template);
    expect(docXml).toMatch(
      new RegExp(`<w:gridCol[^/]*w:w="${layout.labelCol}"\\s*/>\\s*<w:gridCol[^/]*w:w="${layout.valueCol}"\\s*/>`),
    );
  });
});
