import { describe, expect, it } from "vitest";
import { paperCompletionIso, paperDateText, isPaperReport } from "@/lib/paperReportDate";

describe("paper report completion dates", () => {
  it("uses the reviewed sheet date rather than the filing date", () => {
    expect(paperCompletionIso("12/09/2026", new Date("2026-11-19T11:14:00Z"))).toBe("2026-09-12T12:00:00.000Z");
  });
  it("uses today only when no date was entered", () => {
    expect(paperCompletionIso("", new Date("2026-11-19T11:14:00Z"))).toBe("2026-11-19T11:14:00.000Z");
  });
  it("accepts an office backdate after filing", () => {
    expect(paperDateText(paperCompletionIso("2025-04-03"))).toBe("03/04/2025");
  });
  it("rejects invalid calendar dates instead of rolling into another month", () => {
    expect(() => paperCompletionIso("31/02/2026")).toThrow("valid completion date");
  });
  it("does not identify ordinary live reports as paper scans", () => {
    expect(isPaperReport({ date: "12/09/2026" })).toBe(false);
    expect(isPaperReport({}, true)).toBe(true);
  });
});