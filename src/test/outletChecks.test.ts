import { describe, it, expect } from "vitest";
import { judgeScan, unresolvedOutlets, countChecked, parseStickerTag } from "@/lib/outletChecks";

const tags = { ABC234: 1, DEF567: 2 };
describe("outlet checks", () => {
  it('recognises riser-suffixed references including outlet ten', () => {
    expect(parseStickerTag('https://servexaapp.com/r/DNK27Z-10')).toBe('DNK27Z-10');
    expect(judgeScan('https://servexaapp.com/r/DNK27Z-10', {'DNK27Z-10':10}, {})).toEqual({kind:'ok',outlet:10});
    expect(parseStickerTag('https://servexaapp.com/r/DNK27Z-0')).toBeNull();
  });
  it('counts fitted suffixes with gaps without counting retired outlets', () => {
    const checks = {'1':{status:'scanned' as const,at:'x'},'2':{status:'scanned' as const,at:'x'},'4':{status:'manual' as const,at:'x'}};
    expect(countChecked([1,3,4],checks)).toBe(2);
    expect(unresolvedOutlets([1,3,4],checks)).toEqual([3]);
  });
  it("records a valid outlet of this riser", () => {
    expect(judgeScan("https://servexaapp.com/r/ABC234", tags, {})).toEqual({ kind: "ok", outlet: 1 });
  });
  it("never counts the same outlet twice", () => {
    expect(judgeScan("https://servexaapp.com/r/ABC234", tags, { "1": { status: "scanned", at: "x" } }).kind).toBe("already");
  });
  it("rejects an outlet from a different riser", () => {
    expect(judgeScan("https://servexaapp.com/r/ZZZ999", tags, {}).kind).toBe("other_riser");
  });
  it("rejects non-Servexa codes", () => {
    expect(judgeScan("https://example.com/r/ABC234", tags, {}).kind).toBe("not_outlet");
    expect(parseStickerTag("hello")).toBeNull();
  });
  it("lists missing outlets and counts manual as checked, missing-with-reason as resolved", () => {
    const c = { "1": { status: "scanned" as const, at: "x" }, "2": { status: "manual" as const, at: "x" }, "4": { status: "missing" as const, at: "x", reason: "Outlet blocked or inaccessible" } };
    expect(countChecked(6, c)).toBe(2);
    expect(unresolvedOutlets(6, c)).toEqual([3, 5, 6]);
  });
  it('recognises five unique saved outlet codes and counts five of eight checked', () => {
    const saved = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`ABC23${i + 2}`, i + 1]));
    const checks: import('@/lib/outletChecks').OutletChecks = {};
    for (const tag of Object.keys(saved).slice(0, 5)) {
      const result = judgeScan(`https://servexaapp.com/r/${tag}`, saved, checks);
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') checks[String(result.outlet)] = { status: 'scanned', at: '2026-11-07T11:08:00Z', tag };
    }
    expect(countChecked(8, checks)).toBe(5);
  });
});
