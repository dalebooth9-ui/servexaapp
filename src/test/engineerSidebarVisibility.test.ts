import { describe, it, expect } from "vitest";
import { ROUTE_TO_SLUG, ENGINEER_ALLOWED_SLUGS } from "@/lib/engineerPages";

// Mirrors the AppLayout filter logic for engineer nav visibility.
function isVisibleToEngineer(route: string, adminOnly: boolean | undefined, allowedSlugs: string[]): boolean {
  if (route === "/") return true;
  const slug = ROUTE_TO_SLUG[route];
  if (!slug) return false; // any route without a slug is admin-only
  return allowedSlugs.includes(slug);
}

describe("engineer sidebar visibility", () => {
  const allowed = [...ENGINEER_ALLOWED_SLUGS] as string[];

  it("hides Customers, Sites, Assets, Audits, Invoices, Quotes, Engineers from engineers", () => {
    for (const route of ["/customers", "/sites", "/assets", "/audits", "/invoices", "/quotes", "/engineers", "/audit-log", "/parts-library", "/industry-templates", "/compliance"]) {
      expect(isVisibleToEngineer(route, true, allowed)).toBe(false);
    }
  });

  it("shows Dashboard, Jobs, Planner, Leave, Defects, Report Downloads to engineers", () => {
    expect(isVisibleToEngineer("/", false, allowed)).toBe(true);
    expect(isVisibleToEngineer("/jobs", false, allowed)).toBe(true);
    expect(isVisibleToEngineer("/planner", false, allowed)).toBe(true);
    expect(isVisibleToEngineer("/leave", false, allowed)).toBe(true);
    expect(isVisibleToEngineer("/defects", false, allowed)).toBe(true);
    expect(isVisibleToEngineer("/report-downloads", false, allowed)).toBe(true);
  });

  it("only the strict allow-list is granted to engineers", () => {
    expect(allowed.sort()).toEqual([
      "defects", "install", "jobs", "leave", "offline",
      "planner", "report-downloads", "reports",
    ].sort());
  });
});
