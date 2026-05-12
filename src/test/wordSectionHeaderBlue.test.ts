/**
 * Visual snapshot regression — section header rows MUST render with the solid
 * brand-blue fill (#1F4E79) and white bold text. Mirrors the PDF reference.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import {
  buildBlankTemplateDoc,
  SECTION_HEADER_BLUE,
  type WordTemplateInput,
} from "@/lib/wordTemplateBuilder";

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

const template: WordTemplateInput = {
  name: "Dry Riser Pressure Test",
  fields: [
    { id: "g_sec", label: "General", type: "section", section: "General" },
    { id: "g_loc", label: "Location", type: "text", section: "General" },
    { id: "e_sec", label: "External Equipment", type: "section", section: "External Equipment" },
    { id: "e_caps", label: "Caps fitted?", type: "yes_no", section: "External Equipment" },
  ],
};

describe("Word section-header banner styling", () => {
  it("uses the brand blue fill (#1F4E79) and white bold text on every section header", async () => {
    const doc = await buildBlankTemplateDoc(template);
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = (await zip.file("word/document.xml")!.async("string")) as string;

    // Every section header row sets cell shading with the brand blue.
    const blueShadingMatches = xml.match(
      new RegExp(`<w:shd[^/]*w:fill="${SECTION_HEADER_BLUE}"`, "g"),
    ) || [];
    // 2 sections × 2 cells (label + RESULT) = 4 shaded cells minimum.
    expect(blueShadingMatches.length).toBeGreaterThanOrEqual(4);

    // The "RESULT" header label is rendered bold white on the blue band.
    expect(xml).toMatch(
      /<w:r>\s*<w:rPr>(?=[^<]*<w:b\s*\/>)(?=[^<]*<w:color[^/]*w:val="FFFFFF")[^<]*<\/w:rPr>\s*<w:t[^>]*>RESULT<\/w:t>/,
    );

    // No section header should still be using the old grey (#E6E6E6) fill.
    expect(xml).not.toMatch(/<w:shd[^/]*w:fill="E6E6E6"/);
  });

  it("does not pre-tick the Scope of Work option on a blank document", async () => {
    const doc = await buildBlankTemplateDoc({
      name: "Dry Riser Pressure Test",
      fields: [
        {
          id: "scope_of_work",
          label: "Scope of Work",
          type: "select",
          options: ["Pressure Test", "Visual"],
          section: "General",
        },
      ],
    });
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = (await zip.file("word/document.xml")!.async("string")) as string;
    // No filled checkbox glyph should appear next to "Pressure Test".
    expect(xml).not.toMatch(/☑\s*Pressure Test|✔\s*Pressure Test/);
  });
});
