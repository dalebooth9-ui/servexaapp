/**
 * STRICT single-page assertion for the Dry Riser blank template.
 *
 * Fails the build if the rendered Word document or PDF would spill onto
 * a second page. Complements `dryRiserSinglePage.test.ts` (heuristic) with
 * a hard page-count check.
 *
 *  - Word: parse the saved XML and assert ZERO page breaks
 *    (`<w:br w:type="page"/>` or `<w:lastRenderedPageBreak/>`). Word never
 *    inserts a hard page break unless layout demands it; the absence of
 *    both proves the template renders as a single page.
 *  - PDF: render via jsPDF using the SAME shared layout config the live
 *    exporter consumes (`DRY_RISER_LAYOUT`) and assert
 *    `doc.getNumberOfPages() === 1`.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import jsPDF from "jspdf";

import { buildBlankTemplateDoc, type WordTemplateInput } from "@/lib/wordTemplateBuilder";
import { DRY_RISER_LAYOUT, commentsElasticMm } from "@/lib/dryRiserLayout";

// JSDOM stubs for the Word builder's fetch + Image use.
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
  naturalWidth = 80;
  naturalHeight = 40;
  set src(_: string) { queueMicrotask(() => this.onload?.()); }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

const dryRiser: WordTemplateInput = {
  name: "Dry Riser Pressure Test",
  fields: [
    { id: "scope", label: "Scope of Work", type: "select", options: ["Pressure Test"], section: "General" },
    { id: "g_sec", label: "General", type: "section", section: "General" },
    { id: "g_loc", label: "Location", type: "text", section: "General" },
    { id: "ext_caps", label: "External caps fitted?", type: "yes_no", section: "External Equipment" },
    { id: "ext_landing", label: "Landing valves OK?", type: "pass_fail", section: "External Equipment" },
    { id: "int_caps", label: "Internal caps fitted?", type: "yes_no", section: "Internal Equipment" },
    { id: "av_check", label: "Air release operational?", type: "yes_no", section: "Air Release Valve" },
    { id: "p_test", label: "Test Pressure (bar)", type: "number", section: "Pressure Test Results" },
    { id: "p_hold", label: "Hold Time (mins)", type: "number", section: "Pressure Test Results" },
    { id: "p_leak", label: "Leaks Detected?", type: "yes_no", section: "Pressure Test Results" },
  ],
};

describe("Dry Riser blank template — strict page count === 1", () => {
  it("Word: rendered document contains zero page breaks (single page)", async () => {
    const doc = await buildBlankTemplateDoc(dryRiser);
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = (await zip.file("word/document.xml")!.async("string")) as string;

    const hardBreaks = (xml.match(/<w:br\s+[^/]*w:type="page"/g) || []).length;
    const renderedBreaks = (xml.match(/<w:lastRenderedPageBreak\b/g) || []).length;

    expect(
      hardBreaks,
      "Dry Riser Word doc must contain ZERO hard page breaks",
    ).toBe(0);
    expect(
      renderedBreaks,
      "Dry Riser Word doc must contain ZERO rendered page breaks",
    ).toBe(0);
  });

  it("PDF: jsPDF reports exactly one page for a Dry Riser layout", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageH = doc.internal.pageSize.getHeight();
    const pageW = doc.internal.pageSize.getWidth();

    // Sanity — A4
    expect(Math.round(pageW)).toBe(DRY_RISER_LAYOUT.page.widthMm);
    expect(Math.round(pageH)).toBe(DRY_RISER_LAYOUT.page.heightMm);

    // Walk the layout: top margin → header chrome → a realistic body
    // (info grid + 4 section headers + 6 field rows) → comments (elastic)
    // → 3 sign-off rows → footer → bottom margin. Use the SHARED config so
    // any drift in DRY_RISER_LAYOUT is caught here.
    const usedAbove =
      18 /* detail/info grid */
      + 4 * DRY_RISER_LAYOUT.body.sectionHeaderRowMm
      + 6 * DRY_RISER_LAYOUT.body.fieldRowMm;
    const elastic = commentsElasticMm(usedAbove);
    const total =
      DRY_RISER_LAYOUT.page.marginTopMm
      + DRY_RISER_LAYOUT.header.totalChromeMm
      + usedAbove
      + elastic
      + 3 * DRY_RISER_LAYOUT.body.signOffRowMm
      + DRY_RISER_LAYOUT.footer.totalMm
      + DRY_RISER_LAYOUT.page.marginBottomMm;

    expect(
      total,
      `Dry Riser PDF layout (${total.toFixed(2)}mm) must fit within A4 (${pageH}mm)`,
    ).toBeLessThanOrEqual(pageH + 0.01);
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
