import { describe, it, expect } from "vitest";
import { callAheadLabel, jobFlagLines } from "@/lib/jobFlags";
import { DEFAULT_JOB_TAGS, isTagHighlighted } from "@/lib/plannerConfig";
import { findClashes, clashForNew } from "@/lib/plannerClash";
import { matchSite, matchEngineer, toDrafts, draftProblem } from "@/lib/plannerImport";
import { buildWeeklySheetRows, type WeeklySheetInput } from "@/lib/weeklySheet";

describe("job flags", () => {
  it("words call-ahead", () => { expect(callAheadLabel(60)).toBe("Call 1 hour before"); expect(callAheadLabel(30)).toBe("Call 30 min before"); expect(callAheadLabel(0)).toBe(""); });
  it("orders lines", () => {
    expect(jobFlagLines({ time_window: "early start 7am", call_ahead_minutes: 60, access_contact_name: "Pat", access_contact_phone: "0777", customer_po: "123" }))
      .toEqual(["Time: early start 7am", "Call 1 hour before", "Contact: Pat 0777", "PO 123"]);
  });
});

describe("tags", () => {
  it("remedial, SOS and priority are pink; materials is not", () => {
    const pink = (k: string[]) => isTagHighlighted(k, DEFAULT_JOB_TAGS);
    expect(pink(["remedial"])).toBe(true); expect(pink(["sos"])).toBe(true); expect(pink(["priority"])).toBe(true);
    expect(pink(["materials", "quote_follow_up"])).toBe(false);
  });
  it("a Remedial tag shades the weekly sheet row", () => {
    const base: WeeklySheetInput = { date: "2026-07-13", engineerId: "e", engineerName: "D", company: "ABCA", siteName: "S", siteAddress: "", postcode: "", jobName: "x1 sprinkler cap", pressureQty: 0, visualQty: 0, otherQty: 0, otherType: null, priority: "normal", isRemedial: false, jobType: "", po: null, scheduleNotes: null, access: null, tags: ["remedial"] };
    expect(buildWeeklySheetRows([base])[0].highlight).toBe(true);
  });
});

describe("clash warnings", () => {
  const jobs = [{ id: "j1", site_id: "s", site_name: "1 Example Street", job_type: "service" }, { id: "j2", site_id: "s", site_name: "1 Example Street", job_type: "service" }];
  const name = (id: string) => (id === "m" ? "Sam" : "Jo");
  it("same site, same day, two engineers", () => {
    const c = findClashes([{ id: "a", job_id: "j1", engineer_id: "d", schedule_date: "2026-11-26" }, { id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-26" }], jobs, name);
    expect(c.get("a")).toBe("1 Example Street is already booked for Sam on 26/11");
  });
  it("same site and job type twice in a week", () => {
    expect(clashForNew({ job_id: "j2", engineer_id: "d", schedule_date: "2026-11-27" }, [{ id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-24" }], jobs, name)).toContain("Sam on 24/11");
  });
  it("different weeks don't warn, and a deliberate two-engineer job is skipped", () => {
    expect(clashForNew({ job_id: "j2", engineer_id: "d", schedule_date: "2026-12-02" }, [{ id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-24" }], jobs, name)).toBeNull();
    const ok = jobs.map((j) => ({ ...j, two_engineer_ok: true }));
    expect(findClashes([{ id: "a", job_id: "j1", engineer_id: "d", schedule_date: "2026-11-26" }, { id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-26" }], ok, name).size).toBe(0);
  });
});

describe("import matching", () => {
  const sites = [{ id: "1", name: "Site One", postcode: "NW6 7BT" }, { id: "2", name: "Site Two", postcode: "DE1 2SA" }];
  it("matches by name or postcode, else new", () => {
    expect(matchSite({ site: "site one", postcode: "" }, sites)?.id).toBe("1");
    expect(matchSite({ site: "", postcode: "de1 2sa" }, sites)?.id).toBe("2");
    expect(matchSite({ site: "Unknown Site", postcode: "" }, sites)).toBeNull();
  });
  it("matches engineers by first name", () => { expect(matchEngineer("Sam", [{ user_id: "m", full_name: "Sam Example" }])?.user_id).toBe("m"); });
  it("flags unmatched sites as low confidence and blocks creation", () => {
    const [d] = toDrafts([{ company: "", site: "Unknown Site", postcode: "", job_type: "test", quantity: 1, date: "26/11", target_month: "", engineer: "", comments: "early 7am", time_window: "7am", confidence: "high", raw: "Unknown Site x1 test early 7am" }], sites, []);
    expect(d.site_new).toBe(true); expect(d.confidence).toBe("low"); expect(d.date).toBe("");
    expect(draftProblem(d)).toMatch(/site/);
  });
});

import { filterCheat, sectionList } from "@/lib/cheatSheet";
describe("cheat sheet", () => {
  it("searches title and details", () => {
    const e = [{ id: "1", section: "General", title: "Note title", body: "some details", sort_order: 0 }];
    expect(filterCheat(e, "details")).toHaveLength(1); expect(filterCheat(e, "missing")).toHaveLength(0);
    expect(sectionList(e, ["General"])).toEqual(["General"]);
  });
});
