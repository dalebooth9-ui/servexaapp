import { describe, it, expect } from "vitest";
import { buildWeeklySheetRows, jobDescription, isHighlighted, groupSheets, type WeeklySheetInput } from "@/lib/weeklySheet";
import { provisionalLabel, bucketLookAhead, lookAheadMonths, isProvisional, targetMonthValue } from "@/lib/lookAhead";

const base: WeeklySheetInput = { date: "2026-11-30", engineerId: "e1", engineerName: "Calvin", company: "A", siteName: "S", siteAddress: "", postcode: "", jobName: "Job", pressureQty: 0, visualQty: 0, otherQty: 0, otherType: null, priority: "normal", isRemedial: false, jobType: "service", po: null, scheduleNotes: null, access: null };

describe("weekly sheet", () => {
  it("describes quantities like the paper sheet", () => {
    expect(jobDescription({ ...base, pressureQty: 1, visualQty: 3 })).toBe("x1 pressure test, x3 visual inspection");
  });
  it("sorts by date then postcode area", () => {
    const rows = buildWeeklySheetRows([
      { ...base, date: "2026-12-01", postcode: "DE1 2SA", company: "late" },
      { ...base, postcode: "NG7 1AA", company: "ng" },
      { ...base, postcode: "DE22 1AB", company: "de22" },
      { ...base, postcode: "DE1 2SA", company: "de1" },
    ]);
    expect(rows.map((r) => r.company)).toEqual(["de1", "de22", "ng", "late"]);
    expect(rows[0].dateLabel).toBe("MON 30/11/2026");
  });
  it("shades remedial, priority and SOS jobs pink", () => {
    expect(isHighlighted({ ...base, isRemedial: true })).toBe(true);
    expect(isHighlighted({ ...base, priority: "urgent" })).toBe(true);
    expect(isHighlighted({ ...base, jobName: "SOS leak" })).toBe(true);
    expect(isHighlighted(base)).toBe(false);
  });
  it("puts PO in the comment and groups per engineer or combined", () => {
    const rows = buildWeeklySheetRows([{ ...base, po: "4512" }, { ...base, engineerId: "e2", engineerName: "Ann" }]);
    expect(rows[0].comment).toContain("PO 4512");
    expect(groupSheets(rows, false).map((g) => g.title)).toEqual(["ANN", "CALVIN"]);
    expect(groupSheets(rows, true)).toHaveLength(1);
  });
});

describe("look-ahead", () => {
  it("labels provisional months", () => { expect(provisionalLabel("2027-03-01")).toBe("Provisional - March 2027"); expect(targetMonthValue("2027-03")).toBe("2027-03-01"); });
  it("is provisional only without a day", () => {
    expect(isProvisional({ target_month: "2027-03-01" }, false)).toBe(true);
    expect(isProvisional({ target_month: "2027-03-01" }, true)).toBe(false);
  });
  it("counts per month and filters", () => {
    const months = lookAheadMonths(new Date(2026, 10, 15), 6);
    expect(months[0]).toBe("2026-11"); expect(months[5]).toBe("2027-04");
    const b = bucketLookAhead([
      { id: "1", kind: "provisional", month: "2027-03", title: "", customerId: "c1", customerName: "", jobType: "service" },
      { id: "2", kind: "due", month: "2027-03", title: "", customerId: "c2", customerName: "", jobType: "service" },
      { id: "3", kind: "booked", month: "2030-01", title: "", customerId: "c1", customerName: "", jobType: "service" },
    ], months, { customerId: "c1" });
    expect(b.find((x) => x.month === "2027-03")!.count).toBe(1);
  });
});
