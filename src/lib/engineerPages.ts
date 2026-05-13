// Pages that can be toggled on/off for individual engineers
// "dashboard" is always accessible and not listed here
export const ENGINEER_TOGGLABLE_PAGES = [
  { slug: "jobs", label: "Jobs" },
  { slug: "planner", label: "Planner" },
  { slug: "leave", label: "Leave" },
  { slug: "customers", label: "Customers" },
  { slug: "sites", label: "Sites" },
  { slug: "assets", label: "Assets" },
  { slug: "compliance", label: "Compliance" },
  { slug: "audits", label: "Audits" },
] as const;

// Default pages granted to new engineers
export const DEFAULT_ENGINEER_PAGES = ["jobs", "planner", "leave"];

// Map route paths to page slugs for access checking
export const ROUTE_TO_SLUG: Record<string, string> = {
  "/jobs": "jobs",
  "/planner": "planner",
  "/leave": "leave",
  "/customers": "customers",
  "/sites": "sites",
  "/assets": "assets",
  "/compliance": "compliance",
  "/audits": "audits",
  "/defects": "audits",
  "/report-downloads": "jobs",
};
