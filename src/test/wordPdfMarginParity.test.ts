/**
 * Word ↔ PDF margin parity.
 *
 * Verifies that for every shipped report template the generated Word
 * document's body tables span the full page content width — i.e. the right
 * table border lines up with the left page margin (mirroring the PDF where
 * the body grid is bounded by `PDF_DIMENSIONS.margin` on both sides).
 *
 * Dry Riser templates are pinned to the SHARED `dryRiserLayout` config
 * (12mm L/R margins, 10mm T/B). All other templates use the legacy
 * 10mm symmetric `TABLE_W` width.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import {
  buildBlankTemplateDoc,
  TABLE_W,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";
import {
  isDryRiserName,
  dryRiserContentWidthDxa,
} from "@/lib/dryRiserLayout";
import realFixtures from "./fixtures/realTemplateFixtures.json";

// ---------------------------------------------------------------------------
// JSDOM/node stubs (mirrors wordPdfFullParity.test.ts).
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
// Fixtures — small in-line set + every real production template.
// ---------------------------------------------------------------------------
const INLINE_FIXTURES: WordTemplateInput[] = [
  {
    name: "Inline — Dry Riser Visual",
    fields: [
      { id: "f_customer", label: "Customer", type: "text", section: "Site Details" },
      { id: "f_date", label: "Date", type: "date", section: "Site Details" },
      { id: "f_outlet_pf", label: "Outlet caps fitted?", type: "pass_fail", section: "Outlets" },
    ],
  },
  {
    name: "Inline — Extinguisher",
    fields: [
      { id: "g_pressure", label: "Pressure (bar)", type: "number", section: "Cylinder" },
      { id: "g_status", label: "Status", type: "select", options: ["Yes", "No"], section: "Cylinder" },
      { id: "g_notes", label: "Engineer notes", type: "textarea", section: "Cylinder" },
    ],
  },
];

const FIXTURES: WordTemplateInput[] = [
  ...INLINE_FIXTURES,
  ...(realFixtures as unknown as WordTemplateInput[]),
];

// ---------------------------------------------------------------------------
// Helpers — extract docx XML and inspect every body table's declared width.
// ---------------------------------------------------------------------------
async function readDocumentXml(template: WordTemplateInput): Promise<string> {
  const doc = await buildBlankTemplateDoc(template);
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("document.xml missing from generated docx");
  return file.async("string");
}

/**
 * Extract page geometry from `<w:pgSz>` + `<w:pgMar>` — the same numbers a
 * Word renderer uses to lay out the page. Returns DXA values.
 */
function readPageGeometry(xml: string): {
  pageWidth: number;
  marginLeft: number;
  marginRight: number;
  contentWidth: number;
} {
  const sz = /<w:pgSz\b[^/]*w:w="(\d+)"/.exec(xml);
  const mar = /<w:pgMar\b[^/]*w:left="(\d+)"[^/]*w:right="(\d+)"|<w:pgMar\b[^/]*w:right="(\d+)"[^/]*w:left="(\d+)"/.exec(
    xml,
  );
  expect(sz, "page size not declared").toBeTruthy();
  expect(mar, "page margins not declared").toBeTruthy();
  const pageWidth = Number(sz![1]);
  const marginLeft = Number(mar![1] ?? mar![4]);
  const marginRight = Number(mar![2] ?? mar![3]);
  return {
    pageWidth,
    marginLeft,
    marginRight,
    contentWidth: pageWidth - marginLeft - marginRight,
  };
}

/** Each `<w:tbl>` in document order, with its declared total width and grid sum. */
function readBodyTables(xml: string): { declaredWidth: number; gridSum: number }[] {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  return tbls.map((tbl) => {
    const tblW = /<w:tblW\b[^/]*w:w="(\d+)"/.exec(tbl);
    const gridRe = /<w:gridCol\b[^/]*w:w="(\d+)"\s*\/>/g;
    let gridSum = 0;
    let m: RegExpExecArray | null;
    while ((m = gridRe.exec(tbl)) !== null) gridSum += Number(m[1]);
    return {
      declaredWidth: tblW ? Number(tblW[1]) : 0,
      gridSum,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------
describe("Word ↔ PDF margin parity (right border = left margin)", () => {
  it("TABLE_W constant matches A4 content width with current page margins", () => {
    // A4 is 11906 DXA; with the current 567 DXA (10mm) margins on each side
    // the body content area is 10772 DXA, which is what TABLE_W must equal
    // for the right border to mirror the left margin.
    expect(TABLE_W).toBe(11906 - 567 - 567);
  });

  describe.each(FIXTURES)("$name", (template) => {
    it("declares page geometry whose content width equals TABLE_W", async () => {
      const xml = await readDocumentXml(template);
      const geom = readPageGeometry(xml);
      expect(
        geom.contentWidth,
        `Page content width (${geom.contentWidth}) must equal TABLE_W (${TABLE_W}) ` +
          `so the right border lines up with the left margin`,
      ).toBe(TABLE_W);
      // Symmetry: left and right margins must match.
      expect(geom.marginLeft).toBe(geom.marginRight);
    });

    it("every body table spans the full page content width", async () => {
      const xml = await readDocumentXml(template);
      const geom = readPageGeometry(xml);
      const tables = readBodyTables(xml);
      expect(tables.length, "expected at least one body table").toBeGreaterThan(0);

      const offending: string[] = [];
      tables.forEach((t, i) => {
        if (t.declaredWidth !== geom.contentWidth) {
          offending.push(
            `table[${i}] declared width ${t.declaredWidth} ≠ contentWidth ${geom.contentWidth}`,
          );
        }
        if (t.gridSum !== geom.contentWidth) {
          offending.push(
            `table[${i}] grid sum ${t.gridSum} ≠ contentWidth ${geom.contentWidth}`,
          );
        }
      });
      expect(
        offending,
        `Tables must span full content width so right border = left margin:\n${offending.join("\n")}`,
      ).toEqual([]);
    });
  });
});
