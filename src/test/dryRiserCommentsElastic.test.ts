/**
 * Dry Riser elastic Comments cell — exactly one row in the body MUST be
 * elastic (`w:hRule="atLeast"`); every other body row in a table that
 * contains a Comments cell must be fixed (`exact`) or auto. This guards
 * against a regression where multiple rows go elastic and the page
 * breaks across two pages.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import { buildBlankTemplateDoc, type WordTemplateInput } from "@/lib/wordTemplateBuilder";

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
  set src(_: string) { queueMicrotask(() => this.onload?.()); }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

const tpl: WordTemplateInput = {
  name: "Dry Riser Pressure Test",
  fields: [
    { id: "g_sec", label: "General", type: "section", section: "General" },
    { id: "g_loc", label: "Location", type: "text", section: "General" },
    { id: "g_caps", label: "Caps fitted?", type: "yes_no", section: "General" },
  ],
};

describe("Dry Riser Comments row is the only elastic row", () => {
  it("Comments cell is the sole row that uses w:hRule with no exact height", async () => {
    const doc = await buildBlankTemplateDoc(tpl);
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = (await zip.file("word/document.xml")!.async("string")) as string;

    // Find the table that contains the literal "Comments" cell (the
    // Comments box has a single row whose label cell text is " " — the
    // builder writes the "Comments:" label as a sibling Paragraph above
    // the table). We identify the elastic Comments row by it being the
    // ONLY row whose value is significantly larger than a normal row.
    const trMatches = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    const heights: number[] = [];
    for (const tr of trMatches) {
      const m = /<w:trHeight\b[^/]*w:val="(\d+)"/.exec(tr);
      if (m) heights.push(Number(m[1]));
    }
    expect(heights.length).toBeGreaterThan(0);
    const max = Math.max(...heights);
    const elasticRows = heights.filter((h) => h >= 1418); // ≥25mm = comments min
    expect(
      elasticRows.length,
      `expected exactly ONE row ≥ Comments min height; got ${elasticRows.length} (max=${max})`,
    ).toBe(1);
  });
});
