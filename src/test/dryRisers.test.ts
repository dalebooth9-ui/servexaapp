import { describe, it, expect } from "vitest";
import { ASSET_TAG_ALPHABET, parseReportDateText, priorityToSeverity, remedialStatus } from "@/lib/dryRisers";

describe("dry riser rules", () => {
  it("asset tag alphabet has 32 chars and excludes 0, O, 1, I", () => {
    expect(ASSET_TAG_ALPHABET).toHaveLength(32);
    for (const c of ["0", "O", "1", "I"]) expect(ASSET_TAG_ALPHABET.includes(c)).toBe(false);
  });
  it("parses 'OCT 2026' as 1 October 2026", () => {
    expect(parseReportDateText("OCT 2026")).toBe("2026-10-01");
  });
  it("parses UK day-first dates", () => {
    expect(parseReportDateText("12/03/2025")).toBe("2025-03-12");
  });
  it("returns null for unreadable dates", () => {
    expect(parseReportDateText("sometime")).toBeNull();
  });
  it("priority defaults to medium", () => {
    expect(priorityToSeverity("")).toBe("medium");
    expect(priorityToSeverity("High")).toBe("high");
  });
  it("status 'done' is resolved, anything else open", () => {
    expect(remedialStatus("done")).toEqual({ status: "resolved", needsReview: false });
    expect(remedialStatus("open").status).toBe("open");
  });
  it("draft or unclear status is open and flagged for review", () => {
    expect(remedialStatus("draft only")).toEqual({ status: "open", needsReview: true });
  });
});

import { riserTypeOf, isRiserAsset, riserOrFilter } from "@/lib/dryRisers";
describe("riser type detection", () => {
  it("wet riser is Wet Riser, never Dry", () => {
    expect(riserTypeOf({ asset_type: "Wet Riser", category: "Wet Riser" })).toBe("Wet Riser");
    expect(riserTypeOf({ asset_type: "Dry Riser" })).toBe("Dry Riser");
  });
  it("other assets are not risers", () => {
    expect(isRiserAsset({ asset_type: "Extinguisher" })).toBe(false);
  });
  it("type filter only matches that type", () => {
    expect(riserOrFilter("Wet Riser")).not.toContain("dry");
    expect(riserOrFilter("Dry Riser")).not.toContain("wet");
  });
});
