import { describe, it, expect } from "vitest";
import { parsePlannerConfig, PLANNER_FEATURES, DEFAULT_JOB_TAGS, DEFAULT_CHEAT_SECTIONS, isTagHighlighted, effectiveTagKeys, newTagKey, cheatSectionOrder } from "@/lib/plannerConfig";
import { moveSection } from "@/lib/cheatSheet";
import { buildWeeklySheetRows, isHighlighted, type WeeklySheetInput } from "@/lib/weeklySheet";
import { brandRgb } from "@/lib/weeklySheetPdf";
import { sprinklerDueItem, contractDueItem, scheduleDueItem, ppmDueItem } from "@/lib/lookAheadDue";

const base: WeeklySheetInput = { date: "2026-11-30", engineerId: "e", engineerName: "Engineer", company: "Customer name", siteName: "Site name", siteAddress: "", postcode: "", jobName: "Job", pressureQty: 0, visualQty: 0, otherQty: 0, otherType: null, priority: "normal", isRemedial: false, jobType: "service", po: null, scheduleNotes: null, access: null };

describe("Planner feature switches", () => {
  it("all eight features are on for a company with no saved settings (existing and new companies)", () => {
    const c = parsePlannerConfig(null);
    expect(PLANNER_FEATURES).toHaveLength(8);
    expect(Object.values(c.features).every(Boolean)).toBe(true);
  });
  it("a switched-off feature stays off and the rest stay on", () => {
    const c = parsePlannerConfig({ features: { cheatSheet: false, import: false } });
    expect(c.features.cheatSheet).toBe(false); expect(c.features.import).toBe(false);
    expect(c.features.weeklySheet).toBe(true); expect(c.features.followUps).toBe(true);
  });
});

describe("neutral defaults", () => {
  it("cheat sheet starts with one General section only", () => {
    expect(DEFAULT_CHEAT_SECTIONS).toEqual(["General"]);
    expect(parsePlannerConfig(null).cheatSections).toEqual(["General"]);
  });
  it("starter tags are the five agreed names, nothing company-specific", () => {
    expect(DEFAULT_JOB_TAGS.map((t) => t.label)).toEqual(["Remedial", "SOS", "Materials needed", "Quote follow-up", "Priority"]);
    const text = JSON.stringify([DEFAULT_JOB_TAGS, DEFAULT_CHEAT_SECTIONS, PLANNER_FEATURES]).toLowerCase();
    for (const w of ["viva", "michelle", "argos", "watkins", "riser", "sprinkler", "bulb", "cover plate"]) expect(text).not.toContain(w);
  });
  it("a company's own tags replace the starter set, and an empty list stays empty", () => {
    expect(parsePlannerConfig({ tags: [{ key: "x", label: "Callout", color: "#112233", highlight: true }] }).tags.map((t) => t.label)).toEqual(["Callout"]);
    expect(parsePlannerConfig({ tags: [] }).tags).toEqual([]);
  });
  it("company sections keep their order; old notes in other sections still show", () => {
    expect(parsePlannerConfig({ cheatSections: ["Keys", "Phone numbers"] }).cheatSections).toEqual(["Keys", "Phone numbers"]);
    expect(cheatSectionOrder(["General"], ["Old section", "General"])).toEqual(["General", "Old section"]);
    expect(moveSection(["A", "B", "C"], "C", -1)).toEqual(["A", "C", "B"]);
  });
  it("new tag keys never clash", () => { expect(newTagKey("Remedial", DEFAULT_JOB_TAGS)).toBe("remedial_2"); });
});

describe("printed sheet highlight is per tag", () => {
  it("only tags with highlight ticked shade the row", () => {
    const defs = [{ key: "materials", label: "Materials", color: "#000000", highlight: true }, { key: "remedial", label: "Remedial", color: "#000000", highlight: false }];
    expect(isHighlighted({ ...base, tags: ["materials"] }, defs)).toBe(true);
    expect(isHighlighted({ ...base, isRemedial: true }, defs)).toBe(false);
    expect(isHighlighted({ ...base, isRemedial: true }, [])).toBe(false);
  });
  it("remedial/priority/SOS jobs map to those tag keys", () => {
    expect(effectiveTagKeys({ isRemedial: true, priority: "urgent", jobName: "SOS leak" }).sort()).toEqual(["priority", "remedial", "sos"]);
    expect(isTagHighlighted(["materials"], DEFAULT_JOB_TAGS)).toBe(false);
  });
});

describe("weekly sheet options and branding", () => {
  it("postcode sort can be switched off (then by customer)", () => {
    const rows = buildWeeklySheetRows([{ ...base, postcode: "NG7 1AA", company: "A" }, { ...base, postcode: "DE1 2SA", company: "B" }], { sortByPostcode: false });
    expect(rows.map((r) => r.company)).toEqual(["A", "B"]);
    expect(buildWeeklySheetRows([{ ...base, postcode: "NG7 1AA", company: "A" }, { ...base, postcode: "DE1 2SA", company: "B" }]).map((r) => r.company)).toEqual(["B", "A"]);
  });
  it("uses the company's brand colour, neutral grey when none", () => {
    expect(brandRgb("#1F4E79")).toEqual([31, 78, 121]);
    expect(brandRgb(null)).toEqual([51, 51, 51]);
  });
});

describe("look-ahead due items beyond risers", () => {
  const from = "2026-12-01", to = "2027-05-31";
  it("sprinkler systems use their own due rule", () => {
    const it1 = sprinklerDueItem({ id: "s1", system_type: "block", last_annual: "2026-07-10", last_six_month: null, sites: { name: "Site name", customer_id: "c", customers: { name: "Customer name" } } }, from, to);
    expect(it1?.date).toBe("2027-01-10"); expect(it1?.link).toBe("/sprinklers/s1");
  });
  it("contract renewals, service schedules and maintenance plans in range", () => {
    expect(contractDueItem({ id: "k", status: "active", renewal_date: "2027-02-01", customers: { name: "Customer name" } }, from, to)?.jobType).toBe("Contract renewal");
    expect(scheduleDueItem({ id: "h", work_type: "fire_hydrant", next_due_date: "2027-03-01", active: true }, from, to)?.jobType).toBe("Fire hydrant");
    expect(scheduleDueItem({ id: "h", work_type: "fire_hydrant", next_due_date: "2027-03-01", next_job_id: "j" }, from, to)).toBeNull();
    expect(scheduleDueItem({ id: "r", work_type: "dry_riser_pressure_test", next_due_date: "2027-03-01" }, from, to)).toBeNull();
    expect(ppmDueItem({ id: "p", title: "Service", status: "active", next_due_date: "2027-04-01" }, from, to)?.month).toBe("2027-04");
    expect(contractDueItem({ id: "k", status: "active", renewal_date: "2028-02-01" }, from, to)).toBeNull();
  });
});
