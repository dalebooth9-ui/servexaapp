import { describe, it, expect } from "vitest";
import { dateCheckReasons } from "./scanDateCheck";

const today = new Date("2026-11-24T15:30:00Z");

describe("Check date flags", () => {
  it("flags a date more than 14 days before today (11 misread as 04)", () => {
    expect(dateCheckReasons({ date: "19/04/2026" }, today)).toContain("old");
  });
  it("does not flag a date exactly 14 days ago", () => {
    expect(dateCheckReasons({ date: "10/11/2026" }, today)).toEqual([]);
  });
  it("flags a date 15 days ago", () => {
    expect(dateCheckReasons({ date: "09/11/2026" }, today)).toEqual(["old"]);
  });
  it("flags a future date", () => {
    expect(dateCheckReasons({ date: "25/11/26" }, today)).toEqual(["future"]);
  });
  it("does not flag today", () => {
    expect(dateCheckReasons({ date: "24/11/2026" }, today)).toEqual([]);
  });
  it("flags two sheets in the same scan that disagree", () => {
    expect(dateCheckReasons({ date: "19/11/2026", siblingDates: ["20/11/2026"] }, today)).toEqual(["disagree"]);
  });
  it("does not flag sheets that agree in different formats", () => {
    expect(dateCheckReasons({ date: "19/11/26", siblingDates: ["2026-11-19", null, ""] }, today)).toEqual([]);
  });
  it("flags the scanner's low-confidence reading", () => {
    expect(dateCheckReasons({ date: "19/11/2026", lowConfidence: true }, today)).toEqual(["low_confidence"]);
  });
  it("reads 05/11/2026 as 5 Nov (not flagged), not 11 May (would be old)", () => {
    expect(dateCheckReasons({ date: "05/11/2026" }, new Date("2026-11-10T12:00:00Z"))).toEqual([]);
  });
});
