import { describe, it, expect } from "vitest";
import { callAheadLabel, jobFlagLines } from "@/lib/jobFlags";
import { hasPinkTag } from "@/lib/jobTags";
import { findClashes, clashForNew } from "@/lib/plannerClash";
import { matchSite, matchEngineer, toDrafts, draftProblem } from "@/lib/plannerImport";
import { buildWeeklySheetRows, type WeeklySheetInput } from "@/lib/weeklySheet";

describe("job flags", () => {
  it("words call-ahead", () => { expect(callAheadLabel(60)).toBe("Call 1 hour before"); expect(callAheadLabel(30)).toBe("Call 30 min before"); expect(callAheadLabel(0)).toBe(""); });
  it("orders lines", () => {
    expect(jobFlagLines({ time_window: "early start 7am", call_ahead_minutes: 60, access_contact_name: "Kenny", access_contact_phone: "0777", customer_po: "123" }))
      .toEqual(["Time: early start 7am", "Call 1 hour before", "Contact: Kenny 0777", "PO 123"]);
  });
});

describe("tags", () => {
  it("remedial, SOS and priority are pink; materials is not", () => {
    expect(hasPinkTag(["remedial"])).toBe(true); expect(hasPinkTag(["sos"])).toBe(true); expect(hasPinkTag(["priority"])).toBe(true);
    expect(hasPinkTag(["materials", "quote_follow_up"])).toBe(false);
  });
  it("a Remedial tag shades the weekly sheet row", () => {
    const base: WeeklySheetInput = { date: "2026-07-13", engineerId: "e", engineerName: "D", company: "ABCA", siteName: "S", siteAddress: "", postcode: "", jobName: "x1 sprinkler cap", pressureQty: 0, visualQty: 0, otherQty: 0, otherType: null, priority: "normal", isRemedial: false, jobType: "", po: null, scheduleNotes: null, access: null, tags: ["remedial"] };
    expect(buildWeeklySheetRows([base])[0].highlight).toBe(true);
  });
});

describe("clash warnings", () => {
  const jobs = [{ id: "j1", site_id: "s", site_name: "70 Swan St", job_type: "service" }, { id: "j2", site_id: "s", site_name: "70 Swan St", job_type: "service" }];
  const name = (id: string) => (id === "m" ? "Martin" : "Dale");
  it("same site, same day, two engineers", () => {
    const c = findClashes([{ id: "a", job_id: "j1", engineer_id: "d", schedule_date: "2026-11-26" }, { id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-26" }], jobs, name);
    expect(c.get("a")).toBe("70 Swan St is already booked for Martin on 26/11");
  });
  it("same site and job type twice in a week", () => {
    expect(clashForNew({ job_id: "j2", engineer_id: "d", schedule_date: "2026-11-27" }, [{ id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-24" }], jobs, name)).toContain("Martin on 24/11");
  });
  it("different weeks don't warn, and a deliberate two-engineer job is skipped", () => {
    expect(clashForNew({ job_id: "j2", engineer_id: "d", schedule_date: "2026-12-02" }, [{ id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-24" }], jobs, name)).toBeNull();
    const ok = jobs.map((j) => ({ ...j, two_engineer_ok: true }));
    expect(findClashes([{ id: "a", job_id: "j1", engineer_id: "d", schedule_date: "2026-11-26" }, { id: "b", job_id: "j1", engineer_id: "m", schedule_date: "2026-11-26" }], ok, name).size).toBe(0);
  });
});

describe("import matching", () => {
  const sites = [{ id: "1", name: "Brondesbury Park", postcode: "NW6 7BT" }, { id: "2", name: "Midlands House", postcode: "DE1 2SA" }];
  it("matches by name or postcode, else new", () => {
    expect(matchSite({ site: "brondesbury park", postcode: "" }, sites)?.id).toBe("1");
    expect(matchSite({ site: "", postcode: "de1 2sa" }, sites)?.id).toBe("2");
    expect(matchSite({ site: "Mts Walford", postcode: "" }, sites)).toBeNull();
  });
  it("matches engineers by first name", () => { expect(matchEngineer("Martin", [{ user_id: "m", full_name: "Martin Whatmough" }])?.user_id).toBe("m"); });
  it("flags unmatched sites as low confidence and blocks creation", () => {
    const [d] = toDrafts([{ company: "", site: "Mts Walford", postcode: "", job_type: "test", quantity: 1, date: "26/11", target_month: "", engineer: "", comments: "early 7am", time_window: "7am", confidence: "high", raw: "Mts Walford x1 test early 7am" }], sites, []);
    expect(d.site_new).toBe(true); expect(d.confidence).toBe("low"); expect(d.date).toBe("");
    expect(draftProblem(d)).toMatch(/site/);
  });
});

import { filterCheat, sectionList, CHEAT_SECTIONS } from "@/lib/cheatSheet";
describe("cheat sheet", () => {
  it("starts with only the four headings", () => { expect(sectionList([])).toEqual([...CHEAT_SECTIONS]); expect(CHEAT_SECTIONS).toHaveLength(4); });
  it("searches title and details", () => {
    const e = [{ id: "1", section: CHEAT_SECTIONS[1], title: "Viking", body: "white plate", sort_order: 0 }];
    expect(filterCheat(e, "white")).toHaveLength(1); expect(filterCheat(e, "bulb")).toHaveLength(0);
  });
});
