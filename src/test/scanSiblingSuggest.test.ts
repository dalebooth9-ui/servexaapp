import { describe, it, expect } from "vitest";
import { suggestFromSiblings } from "@/lib/scanSiblingSuggest";
const today = new Date("2026-11-24T10:00:00Z");
describe("suggestFromSiblings", () => {
  it("hydrant 2 with blank date and engineer borrows them from hydrant 1 in the same scan", () => {
    const r = suggestFromSiblings({ header: { date: "", engineer: "" } }, [{ date: "19/4/26", engineer: "C. WHITTAKER" }], today);
    expect(r).toEqual({ dateIso: "2026-04-19", dateSource: "other_sheet", engineer: "C. WHITTAKER", engineerFromOther: true });
  });
  it("keeps the sheet's own date", () => expect(suggestFromSiblings({ header: { date: "19/11/26" } }, [{ date: "01/01/26" }], today).dateIso).toBe("2026-11-19"));
  it("falls back to today when no sheet has a date", () => {
    const r = suggestFromSiblings({ header: { date: "smudged" } }, [{}], today);
    expect(r.dateIso).toBe("2026-11-24"); expect(r.dateSource).toBe("today");
  });
});
