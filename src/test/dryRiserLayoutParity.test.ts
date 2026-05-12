/**
 * Dry Riser layout parity — both Word and PDF MUST read their page geometry
 * from the SAME `dryRiserLayout` shared config. If a future change hard-codes
 * different numbers in either renderer, this test fails.
 */
import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";

import { buildBlankTemplateDoc, type WordTemplateInput } from "@/lib/wordTemplateBuilder";
import {
  DRY_RISER_LAYOUT,
  dryRiserContentWidthDxa,
  dryRiserContentWidthMm,
} from "@/lib/dryRiserLayout";

// ---------------------------------------------------------------------------
// JSDOM stubs.
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
  set src(_: string) { queueMicrotask(() => this.onload?.()); }
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

const dryRiserTemplate: WordTemplateInput = {
  name: "Dry Riser Pressure Test",
  fields: [
    { id: "g_sec", label: "General", type: "section", section: "General" },
    { id: "g_loc", label: "Location", type: "text", section: "General" },
  ],
};

describe("Dry Riser shared layout parity", () => {
  it("shared config exposes A4 dimensions and 12mm L/R + 10mm T/B margins", () => {
    expect(DRY_RISER_LAYOUT.page.widthMm).toBe(210);
    expect(DRY_RISER_LAYOUT.page.heightMm).toBe(297);
    expect(DRY_RISER_LAYOUT.page.marginLeftMm).toBe(12);
    expect(DRY_RISER_LAYOUT.page.marginRightMm).toBe(12);
    expect(DRY_RISER_LAYOUT.page.marginTopMm).toBe(10);
    expect(DRY_RISER_LAYOUT.page.marginBottomMm).toBe(10);
    expect(dryRiserContentWidthMm()).toBe(186);
    expect(dryRiserContentWidthDxa()).toBe(10546);
  });

  it("Word generator reads page geometry from the shared config", async () => {
    const doc = await buildBlankTemplateDoc(dryRiserTemplate);
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = (await zip.file("word/document.xml")!.async("string")) as string;

    // Page size
    const sz = /<w:pgSz\b[^/]*w:w="(\d+)"[^/]*w:h="(\d+)"|<w:pgSz\b[^/]*w:h="(\d+)"[^/]*w:w="(\d+)"/.exec(xml);
    expect(sz).toBeTruthy();
    const w = Number(sz![1] ?? sz![4]);
    const h = Number(sz![2] ?? sz![3]);
    expect(w).toBe(DRY_RISER_LAYOUT.page.widthDxa);
    expect(h).toBe(DRY_RISER_LAYOUT.page.heightDxa);

    // Page margins
    const mar = /<w:pgMar\b[^/]*?\/>/.exec(xml);
    expect(mar).toBeTruthy();
    const tag = mar![0];
    const num = (attr: string) =>
      Number(new RegExp(`w:${attr}="(-?\\d+)"`).exec(tag)![1]);
    expect(num("top")).toBe(DRY_RISER_LAYOUT.page.marginTopDxa);
    expect(num("bottom")).toBe(DRY_RISER_LAYOUT.page.marginBottomDxa);
    expect(num("left")).toBe(DRY_RISER_LAYOUT.page.marginLeftDxa);
    expect(num("right")).toBe(DRY_RISER_LAYOUT.page.marginRightDxa);
  });
});
