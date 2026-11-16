import { describe, it, expect } from "vitest";
import { estimateSkew, rotateGray, stripBounds, type Gray } from "@/lib/sheetImagePrep";

function lines(w = 400, h = 400): Gray {
  const d = new Float32Array(w * h).fill(255);
  for (let y = 20; y < h - 20; y += 16) for (let x = 40; x < w - 40; x++) { d[y * w + x] = 0; d[(y + 1) * w + x] = 0; }
  return { w, h, d };
}

describe("sheet clean-up", () => {
  it("straightening a tilted page undoes the tilt", () => {
    const tilted = rotateGray(lines(), 3);
    const skew = estimateSkew(tilted);
    expect(Math.abs(skew)).toBeGreaterThanOrEqual(2);
    const fixed = rotateGray(tilted, -skew);
    expect(Math.abs(estimateSkew(fixed))).toBeLessThanOrEqual(0.5);
  });
  it("zoom strips cover the whole page with overlap", () => {
    const b = stripBounds(1000);
    expect(b[0].y).toBe(0);
    expect(b[2].y + b[2].h).toBe(1000);
    expect(b[1].y).toBeLessThan(b[0].y + b[0].h);
  });
});
