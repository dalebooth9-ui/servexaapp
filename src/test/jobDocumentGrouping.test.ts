import { describe, it, expect } from "vitest";
import { groupReportsByRiser, visibleJobTemplates, findExistingDrafts } from "@/lib/jobDocumentGrouping";

const r = (id: string, status: string, at: string, riser = "A", loc = "Stair 1") => ({ id, template_id: "t", status, created_at: at, responses: { riser_asset_id: riser, riser_location: loc } });

describe("job documents", () => {
  it("shows one line per riser with earlier versions collapsed", () => {
    const g = groupReportsByRiser([r("1", "submitted", "2026-11-12"), r("2", "submitted", "2026-11-13"), r("3", "draft", "2026-11-16T15:00"), r("4", "draft", "2026-11-16T16:00"), r("5", "not_used", "2026-11-17")]);
    expect(g).toHaveLength(1);
    expect(g[0].latest.id).toBe("4");
    expect(g[0].earlier.map((x) => x.id)).toEqual(["3", "2", "1"]);
    expect(g[0].riserLabel).toBe("Stair 1");
  });
  it("separates different risers", () => {
    expect(groupReportsByRiser([r("1", "draft", "2026-01-01", "A"), r("2", "draft", "2026-01-01", "B")])).toHaveLength(2);
  });
  it("never shows retired templates or duplicates", () => {
    const v = visibleJobTemplates([
      { id: "d", name: "Dry Riser — Visual Inspection", status: "draft" },
      { id: "p", name: "Dry Riser — Visual Inspection", status: "published" },
      { id: "x", name: "Dry Riser — Visual Inspection — RETIRED duplicate", status: "draft" },
    ]);
    expect(v.map((t) => t.id)).toEqual(["p"]);
  });
  it("finds the existing draft for the same riser only", () => {
    const rows = [r("1", "draft", "2026-01-01", "A"), r("2", "draft", "2026-01-02", "B"), r("3", "submitted", "2026-01-03", "A")];
    expect(findExistingDrafts(rows, "t", "A").map((x) => x.id)).toEqual(["1"]);
    expect(findExistingDrafts(rows, "t", null).map((x) => x.id)).toEqual(["2", "1"]);
  });
});
