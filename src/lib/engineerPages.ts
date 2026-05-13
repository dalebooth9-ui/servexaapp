// Strict role-based allow-list for engineers.
// Engineers may ONLY access these pages. Anything not listed here is admin-only.
export const ENGINEER_ALLOWED_SLUGS = [
  "jobs",
  "planner",
  "leave",
  "defects",
  "reports",
  "report-downloads",
  "install",
  "offline",
] as const;

// Pages that can be toggled on/off for individual engineers in the admin UI.
export const ENGINEER_TOGGLABLE_PAGES = [
  { slug: "jobs", label: "Jobs" },
  { slug: "planner", label: "Planner" },
  { slug: "leave", label: "Leave" },
  { slug: "defects", label: "Defects" },
  { slug: "reports", label: "Reports" },
  { slug: "report-downloads", label: "Report Downloads" },
  { slug: "install", label: "Install" },
] as const;

// Default pages granted to new engineers.
export const DEFAULT_ENGINEER_PAGES = [
  "jobs",
  "planner",
  "leave",
  "defects",
  "reports",
  "report-downloads",
  "install",
  "offline",
];

// Map route paths to page slugs for access checking.
// Routes NOT listed here (e.g. /customers, /sites, /assets, /audits, /invoices,
// /quotes, /engineers, /audit-log, /industry-templates, /parts-library) are
// admin-only and must not be granted to engineers.
export const ROUTE_TO_SLUG: Record<string, string> = {
  "/jobs": "jobs",
  "/planner": "planner",
  "/leave": "leave",
  "/defects": "defects",
  "/reports": "reports",
  "/report-downloads": "report-downloads",
  "/install": "install",
  "/offline": "offline",
};
