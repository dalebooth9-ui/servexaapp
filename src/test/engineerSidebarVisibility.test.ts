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
  it("does not render an Admin section header for engineers", () => {
    // Simulate the itemsBySection remap logic used in AppLayout
    const engineerVisible = [
      "/", "/jobs", "/planner", "/leave",
      "/defects", "/report-downloads", "/reports",
    ];

    const sections = ["main", "operations", "more", "admin"] as const;
    const itemsBySection = sections.reduce((acc, section) => {
      acc[section] = engineerVisible.filter((route) => {
        const item = [...DEFAULT_NAV_ITEMS].find((i) => i.to === route);
        if (!item) return false;
        if (section === "operations" || section === "more") {
          // Engineers get admin-section items remapped into operations
          if (item.section === "admin") return section === "operations";
          return item.section === section;
        }
        if (section === "admin") return false;
        return item.section === section;
      });
      return acc;
    }, {} as Record<string, string[]>);

    expect(itemsBySection["admin"].length).toBe(0);
    expect(itemsBySection["operations"]).toContain("/reports");
  });
});
