export const MONEY_TABS = ["quotes", "invoices", "agreements", "contracts", "renewals"] as const;
export const COMPLIANCE_TABS = ["compliance", "audits", "defects-review"] as const;

export const LEGACY_PAGE_TABS: Record<string, { path: string; tab: string }> = {
  "/quotes": { path: "/money", tab: "quotes" },
  "/invoices": { path: "/money", tab: "invoices" },
  "/agreements": { path: "/money", tab: "agreements" },
  "/contracts": { path: "/money", tab: "contracts" },
  "/renewals": { path: "/money", tab: "renewals" },
  "/audits": { path: "/compliance", tab: "audits" },
  "/defects/review": { path: "/compliance", tab: "defects-review" },
};

/** Exact list routes only: detail links remain unchanged; preserve deep-link filters. */
export function groupedPageUrl(pathname: string, search = "", hash = ""): string {
  const destination = LEGACY_PAGE_TABS[pathname];
  if (!destination) return pathname + search + hash;
  const params = new URLSearchParams(search);
  const legacyQuote = pathname === "/invoices" && (["quote", "quotes"].includes(params.get("tab") ?? "") || params.get("type") === "quote");
  params.set("tab", legacyQuote ? "quotes" : destination.tab);
  return `${destination.path}?${params.toString()}${hash}`;
}

export function canOpenComplianceTab(tab: string, role: string | null, hasAccess: (slug: string) => boolean): boolean {
  if (!COMPLIANCE_TABS.some((value) => value === tab)) return false;
  if (role === "admin") return true;
  return tab !== "defects-review" && hasAccess(tab);
}