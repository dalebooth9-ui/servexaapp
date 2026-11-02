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
