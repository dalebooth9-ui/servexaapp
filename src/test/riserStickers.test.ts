import { describe, it, expect } from "vitest";
import { labelPosition, LABELS_PER_SHEET, L4778, stickerUrl,STICKER_CONTENT,stickerLogoSize,buildStickerPackPdf } from "@/lib/riserStickers";

describe("riser sticker layout (Avery L4778)", () => {
  it("is 4 across x 12 down of 45.7 x 21.2 mm labels", () => {
    expect(LABELS_PER_SHEET).toBe(48);
    expect(L4778.labelW).toBe(45.7);
    expect(L4778.labelH).toBe(21.2);
  });
  it("wraps to a new sheet after 48 labels", () => {
    expect(labelPosition(47).sheet).toBe(0);
    expect(labelPosition(48).sheet).toBe(1);
    expect(labelPosition(48).x).toBe(labelPosition(0).x);
  });
  it("applies offset nudges", () => {
    const a = labelPosition(5);
    const b = labelPosition(5, { top: 1, left: -0.5 });
    expect(b.y - a.y).toBeCloseTo(1);
    expect(b.x - a.x).toBeCloseTo(-0.5);
  });
  it("links to servexaapp.com/r/<tag>", () => {
    expect(stickerUrl("ABC234")).toBe("https://servexaapp.com/r/ABC234");
  });
  it('prints a 20mm QR inside the unchanged label',()=>{
    expect(STICKER_CONTENT.qrSize).toBeGreaterThanOrEqual(20);
    expect(STICKER_CONTENT.padding * 2 + STICKER_CONTENT.qrSize).toBeLessThanOrEqual(L4778.labelH);
  });
  it('enlarges the logo without overlapping the QR or label edge',()=>{
    expect(stickerLogoSize(400,100).width).toBe(22.4);
    expect(STICKER_CONTENT.padding * 2 + STICKER_CONTENT.qrSize + 2 + STICKER_CONTENT.logoWidth).toBeLessThanOrEqual(L4778.labelW);
  });
  it('starts on the first free label and carries onto the next sheet',async()=>{
    const pdf=await buildStickerPackPdf({items:[{asset_tag:'S7TW49'},{asset_tag:'ABC234'}],logoUrl:null,offsets:{top:0,left:0},startPosition:48});
    expect(pdf.getNumberOfPages()).toBe(2);
  });
});
