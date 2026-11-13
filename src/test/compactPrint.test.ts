import { describe, it, expect } from "vitest";
import { checkedOutletNumbers, uncheckedOutletSummary, photoGridLayout } from "@/lib/compactPrint";

describe("compact print rules", () => {
  it('summarises six unchecked Bosden outlets with their real reason',()=>{const checks=Object.fromEntries([1,2,3,4,5,6].map(n=>[String(n),{status:'missing',reason:'Sticker missing or damaged',at:''}])) as any;expect(uncheckedOutletSummary([1,2,3,4,5,6],checks)).toBe('6 outlets not checked: sticker missing or damaged');expect(checkedOutletNumbers([1,2,3,4,5,6],checks)).toEqual([]);});
  it('keeps distinct reasons and excludes checked or unrecorded outlets',()=>expect(uncheckedOutletSummary([1,2,3,4],{'1':{status:'missing',reason:'Sticker missing or damaged',at:''},'2':{status:'missing',reason:'Outlet blocked or inaccessible',at:''},'3':{status:'manual',reason:'Sticker missing or damaged',at:''}})).toBe('1 outlet not checked: sticker missing or damaged; 1 outlet not checked: outlet blocked or inaccessible'));
  it("drops outlets that were not checked", () => {
    expect(checkedOutletNumbers([1, 2, 3, 4, 5, 6], {})).toEqual([]);
    expect(checkedOutletNumbers([1, 2, 3], { "1": { status: "missing" } as any, "2": { status: "scanned" } as any })).toEqual([2]);
  });
  it("fits 12 photos on one A4 page at ~45mm wide", () => {
    const g = photoGridLayout(12, 190);
    expect(g.cols).toBe(4);
    expect(Math.round(g.cellW)).toBe(45);
    expect(g.gridH + 20).toBeLessThan(277);
  });
});
