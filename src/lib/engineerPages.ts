// Strict role-based allow-list for engineers.
// Engineers may ONLY access these pages. Anything not listed here is admin-only.
// Deliberately narrow: field-work essentials only. Company-wide surfaces like
// /defects, /reports and /report-downloads are back-office and never granted
// to the engineer role.
export const ENGINEER_ALLOWED_SLUGS = [
  "jobs",
  "planner",
  "leave",
  "install",
  "offline",
  "site-surveys",
] as const;

// Pages that can be toggled on/off for individual engineers in the admin UI.
export const ENGINEER_TOGGLABLE_PAGES = [
  { slug: "jobs", label: "Jobs" },
  { slug: "planner", label: "Planner" },
  { slug: "leave", label: "Leave" },
  { slug: "install", label: "Install" },
  { slug: "site-surveys", label: "Site Surveys" },
] as const;

// Default pages granted to new engineers.
export const DEFAULT_ENGINEER_PAGES = [
  "jobs",
  "planner",
  "leave",
  "install",
  "offline",
  "site-surveys",
];

// Map route paths to page slugs for access checking.
// Routes NOT listed here (e.g. /customers, /sites, /assets, /audits, /invoices,
// /quotes, /engineers, /audit-log, /industry-templates, /parts-library,
// /defects, /reports, /report-downloads, /platform/*) are admin-only and must
// not be granted to engineers.
export const ROUTE_TO_SLUG: Record<string, string> = {
  "/jobs": "jobs",
  "/planner": "planner",
  "/leave": "leave",
  "/install": "install",
  "/offline": "offline",
  "/site-surveys": "site-surveys",
};
