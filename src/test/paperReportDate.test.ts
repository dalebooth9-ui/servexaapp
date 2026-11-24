import { describe, expect, it } from "vitest";
import { parseSheetDate, sheetDateProblem, paperCompletionIsoStrict, paperCompletionIso, paperDateText, isPaperReport } from "@/lib/paperReportDate";

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
    expect(paperCompletionIso("31/02/2026", new Date("2026-11-19T11:14:00Z"))).toBe("2026-11-19T11:14:00.000Z");
  });
  it("does not identify ordinary live reports as paper scans", () => {
    expect(isPaperReport({ date: "12/09/2026" })).toBe(false);
    expect(isPaperReport({}, true)).toBe(true);
  });
});
describe("sheet dates as written", () => {
  it("reads 19/4/26 as 19 April 2026 (the Elite Security hydrant sheet)", () => expect(parseSheetDate("19/4/26")).toBe("2026-04-19"));
  it("reads dd/mm/yy as 20yy, never 19yy", () => expect(parseSheetDate("19/11/26")).toBe("2026-11-19"));
  it("reads dd/mm/yyyy typed by the office", () => expect(parseSheetDate("19/11/2026")).toBe("2026-11-19"));
  it("allows backdating", () => expect(parseSheetDate("03/02/2019")).toBe("2019-02-03"));
  it("unreadable text gives null, not an error", () => expect(parseSheetDate("illegible")).toBeNull());
  it("unreadable date never blocks saving: falls back to today", () => expect(paperCompletionIso("??", new Date("2026-11-24T10:00:00Z"))).toBe("2026-11-24T10:00:00.000Z"));
  it("explains a really invalid typed date in plain English", () => expect(sheetDateProblem("31/02/2026")).toMatch(/isn't a date we can read/));
  it("office correction of a saved date explains the problem", () => expect(() => paperCompletionIsoStrict("abc")).toThrow(/isn't a date/));
});
