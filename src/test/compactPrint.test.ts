import { describe, it, expect } from "vitest";
import { checkedOutletNumbers, photoGridLayout } from "@/lib/compactPrint";

describe("compact print rules", () => {
  it("drops outlets that were not checked", () => {
    expect(checkedOutletNumbers([1, 2, 3, 4, 5, 6], {})).toEqual([]);
    expect(checkedOutletNumbers([1, 2, 3], { "2": { status: "scanned" } as any })).toEqual([2]);
  });
  it("fits 12 photos on one A4 page at ~45mm wide", () => {
    const g = photoGridLayout(12, 190);
    expect(g.cols).toBe(4);
    expect(Math.round(g.cellW)).toBe(45);
    expect(g.gridH + 20).toBeLessThan(277);
  });
});
