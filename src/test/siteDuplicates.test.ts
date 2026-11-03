import { describe, it, expect } from "vitest";
import { findDuplicateGroups, normSiteName, pickSiteWithMostData } from "@/lib/siteDuplicates";

const cust = new Map([["c1", "DANDI"], ["c2", "Woodstock Management"]]);

describe("site duplicates", () => {
  it("strips customer prefix, case, spaces and punctuation", () => {
    expect(normSiteName("DANDI - Battersea, Hazel Court", ["Dandi"])).toBe(normSiteName("battersea hazel court"));
  });

  it("groups same customer by name or postcode", () => {
    const g = findDuplicateGroups([
      { id: "a", name: "DANDI - Hazel Court", postcode: "SW11 1AA", customer_ids: ["c1"] },
      { id: "b", name: "Hazel  Court", postcode: null, customer_ids: ["c1"] },
      { id: "c", name: "Other block", postcode: "sw111aa", customer_ids: ["c1"] },
      { id: "d", name: "Elsewhere", postcode: "E1 1AA", customer_ids: ["c1"] },
    ], cust);
    const same = g.filter((x) => x.kind === "customer");
    expect(same).toHaveLength(1);
    expect(same[0].siteIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("same name across different customers is only 'possible'", () => {
    const g = findDuplicateGroups([
      { id: "a", name: "Northolt Road", customer_ids: ["c1"] },
      { id: "b", name: "Northolt Road", customer_ids: ["c2"] },
    ], cust);
    expect(g).toHaveLength(1);
    expect(g[0].kind).toBe("possible");
  });

  it("picks the site with the most data", () => {
    const stats = new Map([["a", { total: 2 }], ["b", { total: 9 }], ["c", { total: 0 }]]);
    expect(pickSiteWithMostData([{ id: "a" }, { id: "b" }, { id: "c" }], stats)?.id).toBe("b");
  });
});
