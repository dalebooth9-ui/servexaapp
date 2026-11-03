import { describe, it, expect } from "vitest";
import { labelPosition, LABELS_PER_SHEET, L4778, stickerUrl } from "@/lib/riserStickers";

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
});
