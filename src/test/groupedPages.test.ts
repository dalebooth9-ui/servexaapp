import { describe, expect, it } from "vitest";
import { canOpenComplianceTab, groupedPageUrl } from "@/lib/groupedPages";
import { resolveHelpSlug } from "@/lib/helpArticles";

describe("grouped page bookmarks", () => {
  for (const tab of ["quotes", "invoices", "agreements", "contracts", "renewals"]) {
    it(`redirects ${tab} with its existing filters and anchor`, () => {
      expect(groupedPageUrl(`/${tab}`, "?customer=abc&status=sent", "#row")).toBe(`/money?customer=abc&status=sent&tab=${tab}#row`);
      expect(resolveHelpSlug(`/money?tab=${tab}`)).toBe(tab);
    });
  }
  it("keeps the legacy invoice quote bookmark on Quotes", () => {
    expect(groupedPageUrl("/invoices", "?tab=quote")).toBe("/money?tab=quotes");
  });
  it("redirects Audits without losing filters", () => {
    expect(groupedPageUrl("/audits", "?customer=abc")).toBe("/compliance?customer=abc&tab=audits");
    expect(resolveHelpSlug("/compliance?tab=audits")).toBe("audits");
  });
  it("redirects Defects review and retains its guide", () => {
    expect(groupedPageUrl("/defects/review")).toBe("/compliance?tab=defects-review");
    expect(resolveHelpSlug("/compliance?tab=defects-review")).toBe("defects.review");
  });
  it("leaves document detail and report addresses unchanged", () => {
    for (const path of ["/invoices/abc", "/contracts/abc", "/agreements/abc", "/agreements/templates", "/report-downloads"]) expect(groupedPageUrl(path, "?x=1")).toBe(`${path}?x=1`);
  });
});

describe("existing Compliance permissions", () => {
  it("allows admins every existing tab", () => {
    for (const tab of ["compliance", "audits", "defects-review"]) expect(canOpenComplianceTab(tab, "admin", () => false)).toBe(true);
  });
  it("never allows engineers into Defects review", () => {
    expect(canOpenComplianceTab("defects-review", "engineer", () => true)).toBe(false);
  });
  it("retains separate Compliance and Audits access", () => {
    expect(canOpenComplianceTab("audits", "engineer", (slug) => slug === "audits")).toBe(true);
    expect(canOpenComplianceTab("compliance", "engineer", (slug) => slug === "audits")).toBe(false);
  });
});