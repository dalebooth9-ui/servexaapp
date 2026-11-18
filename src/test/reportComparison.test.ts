import { describe, it, expect } from "vitest";
import { compareReports, unlikelyOutletDrop, lastYearHints } from "@/lib/reportComparison";

const fields = [
  { id: "riser_location", label: "Riser Location:", type: "text" },
  { id: "number_of_outlets", label: "Number of outlets", type: "number" },
  { id: "cabinet_keys", label: "Cabinet key type :", type: "text" },
  { id: "arv", label: "BS9990:2015 7.4.4 Is the air release valve in good condition?", type: "checkbox" },
  { id: "signs", label: "Are all relevant signs in place?", type: "checkbox" },
  { id: "date", label: "Date:", type: "date" },
];

describe("report comparison", () => {
  it("flags 6 to 3 outlets as a Check", () => {
    const f = compareReports(fields, { number_of_outlets: "6" }, { number_of_outlets: "3" });
    expect(f[0]).toMatchObject({ key: "number_of_outlets", level: "check", previous: "6", current: "3" });
  });
  it("flags 6 to 5 outlets as a Note", () => {
    expect(compareReports(fields, { number_of_outlets: 6 }, { number_of_outlets: 5 })[0].level).toBe("note");
  });
  it("YES last year, NO now is a Note", () => {
    expect(compareReports(fields, { signs: true }, { signs: "no" })[0]).toMatchObject({ level: "note", previous: "YES", current: "NO" });
  });
  it("answered last year but blank now is a Check", () => {
    expect(compareReports(fields, { arv: true }, {})[0]).toMatchObject({ key: "arv", level: "check", current: "" });
  });
  it("cabinet key change is a Note, dates are ignored", () => {
    const f = compareReports(fields, { cabinet_keys: "JD", date: "2025-11-01" }, { cabinet_keys: "FB", date: "2026-11-01" });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ key: "cabinet_keys", level: "note" });
  });
  it("matching reports give no flags", () => {
    expect(compareReports(fields, { signs: true, cabinet_keys: "jd" }, { signs: "yes", cabinet_keys: "JD" })).toEqual([]);
  });
  it("open defect from last year not mentioned is a Check", () => {
    const f = compareReports(fields, {}, { comments: "all fine" }, [{ id: "d1", title: "Missing drain plug", status: "open" }]);
    expect(f[0]).toMatchObject({ key: "defect:d1", level: "check" });
  });
  it("resolved defects are not flagged", () => {
    expect(compareReports(fields, {}, {}, [{ id: "d1", title: "Missing drain plug", status: "resolved" }])).toEqual([]);
  });
  it("unlikely drop rule", () => {
    expect(unlikelyOutletDrop(6, 3)).toBe(true);
    expect(unlikelyOutletDrop(6, 5)).toBe(false);
  });
  it("hints show last year's answers", () => {
    expect(lastYearHints(fields, { signs: true, number_of_outlets: 6, date: "x" })).toEqual({ signs: "YES", number_of_outlets: "6" });
  });
});
