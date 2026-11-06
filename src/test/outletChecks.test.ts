import { describe, it, expect } from "vitest";
import { judgeScan, unresolvedOutlets, countChecked, parseStickerTag } from "@/lib/outletChecks";

const tags = { ABC234: 1, DEF567: 2 };
describe("outlet checks", () => {
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
});
