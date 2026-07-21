// Route -> help-article slug resolver. Used by the AI Help Assistant to load the
// grounding knowledge base article for the page the user is currently on.
//
// If a route isn't listed, the resolver returns null and the assistant falls
// back to the global 'dashboard' article + general guidance.

type SlugRule = {
  test: (pathname: string) => boolean;
  slug: string;
};

const RULES: SlugRule[] = [
  { test: (p) => p === "/", slug: "dashboard" },
  { test: (p) => p === "/jobs", slug: "jobs" },
  { test: (p) => /^\/jobs\/[^/]+$/.test(p), slug: "jobs.detail" },
  { test: (p) => p.startsWith("/jobs/") && p.includes("/rams"), slug: "rams" },
  { test: (p) => p.startsWith("/rams"), slug: "rams" },
  { test: (p) => p === "/paper-scans" || p.startsWith("/paper-scans"), slug: "paper-scans" },
  { test: (p) => p === "/customers", slug: "customers" },
  { test: (p) => p.startsWith("/customers/"), slug: "customers.detail" },
  { test: (p) => p === "/sites", slug: "sites" },
  { test: (p) => p === "/site-surveys" || p.startsWith("/site-surveys/"), slug: "site-surveys" },
  { test: (p) => p === "/assets", slug: "assets" },
  { test: (p) => p.startsWith("/assets/"), slug: "assets.detail" },
  { test: (p) => p === "/engineers", slug: "engineers" },
  { test: (p) => p === "/planner", slug: "planner" },
  { test: (p) => p === "/leave", slug: "leave" },
  { test: (p) => p === "/defects", slug: "defects" },
  { test: (p) => p === "/defects/review", slug: "defects.review" },
  { test: (p) => p === "/compliance", slug: "compliance" },
  { test: (p) => p === "/audits", slug: "audits" },
  { test: (p) => p === "/quotes", slug: "quotes" },
  { test: (p) => p === "/invoices" || p.startsWith("/invoices/"), slug: "invoices" },
  { test: (p) => p === "/contracts" || p.startsWith("/contracts/"), slug: "contracts" },
  { test: (p) => p === "/parts-library", slug: "parts-library" },
  { test: (p) => p === "/stock", slug: "van-stock" },
  { test: (p) => p === "/industry-templates" || p === "/templates", slug: "industry-templates" },
  { test: (p) => p === "/reports" || p.startsWith("/reports/"), slug: "reports" },
  { test: (p) => p === "/report-downloads", slug: "report-downloads" },
  { test: (p) => p === "/settings/import", slug: "settings.import" },
  { test: (p) => p === "/settings", slug: "settings" },
  { test: (p) => p === "/fleet", slug: "fleet" },
  { test: (p) => p === "/my-profile", slug: "vehicle-checks" },
  { test: (p) => p === "/my-timesheet", slug: "my-timesheet" },
  { test: (p) => p === "/sync-status", slug: "sync-status" },
  { test: (p) => p === "/setup", slug: "setup" },
  { test: (p) => p === "/install", slug: "install" },
  { test: (p) => p.startsWith("/fire-log/"), slug: "fire-log" },
  { test: (p) => p === "/sign-off", slug: "sign-off" },
  { test: (p) => p === "/admin/support-tickets", slug: "support-tickets" },
  { test: (p) => p === "/archive" || p.startsWith("/archive/"), slug: "paper-scans" },
  { test: (p) => p === "/billing", slug: "billing" },
];

export function resolveHelpSlug(pathname: string): string | null {
  for (const rule of RULES) {
    if (rule.test(pathname)) return rule.slug;
  }
  return null;
}

export function describeCurrentRoute(pathname: string): string {
  const slug = resolveHelpSlug(pathname);
  return slug ? `${slug} (${pathname})` : pathname;
}
