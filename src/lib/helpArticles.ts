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
  { test: (p) => p === '/assistant-shortcuts', slug: 'assistant.shortcuts' },
  // Signed-in root retains dashboard guidance; the signed-out public presentation
  // is documented separately in public-landing (navy/white workflow bands,
  // generic asset/service-report wording and sample outlet/sticker examples,
  // orange CTAs; unfinished founder copy hidden).
  { test: (p) => p === "/", slug: "dashboard" },
  { test: (p) => p === "/admin/error-log", slug: "error-log" },

  // Ready to invoice creates a draft attributed to the signed-in office user.
  { test: (p) => p === "/jobs", slug: "jobs" },
  // Due Visits row creation always pre-ticks only the chosen riser and matches its
  // Visual/Pressure type; site creation ticks overdue unbooked risers only. The
  // shared form links missing customers and requires at least one ticked riser.
  { test: (p) => p === '/due-visits', slug: 'riser-visits' },
  // Pressure/Visual riser PDF sheets: unchanged larger logo with visible ink 5mm
  // from the top, 3.5mm title gap and aligned QR; one A4. Pressure/hold rows omitted.
  // Cabinet keys is a blank first External Equipment row, not a large header box.
  // The GENERAL section (incl. Materials required) is removed; the declaration matches
  // the job type — Pressure: BS 9990:2015 at 12 bar for 15 minutes; Visual: BS 9990:2015
  // visual inspection with no pressure/bar/minutes wording.
  { test: (p) => p === '/printed-paperwork', slug: 'printed-paperwork' },
  // Job guide includes Print reports beside Print sticker pack for per-riser engineer sheets,
  // both also in the top button row on riser jobs; saved Risers on this job selections,
  // exact duplicate warnings and confirmed Merge jobs archival are in jobs.detail.
  // Office Add outstanding defects attaches selected customer/site defects directly
  // to this job, with unmatched risers kept as general report items. Each riser row
  // has a Number of outlets stepper that creates/retires outlet QR codes in place.
  { test: (p) => /^\/jobs\/[^/]+$/.test(p), slug: "jobs.detail" },
  { test: (p) => p.startsWith("/jobs/") && p.includes("/rams"), slug: "rams" },
  { test: (p) => p.startsWith("/jobs/") && p.includes("/site-visit-report"), slug: "site-visit-report" },
  { test: (p) => p.startsWith("/rams"), slug: "rams" },
  { test: (p) => p.startsWith("/settings/rams-library"), slug: "rams.auto-attach" },
  { test: (p) => p === "/paper-scans" || p.startsWith("/paper-scans"), slug: "paper-scans" },
  { test: (p) => p === "/customers", slug: "customers" },
  { test: (p) => p === '/customers/print-branding' || p === '/customers/logo-help', slug: 'customers.print-branding' },
  { test: (p) => p === "/customers/duplicates", slug: "customers" },
  { test: (p) => p.startsWith("/customers/"), slug: "customers.detail" },
  // Sites guide includes the shared site-row Create job / New visit form: optional PO,
  // site customer/duplicate warning, one type, exact riser tick/count, save or planner scheduling.
  // Building duplicate warnings compare sibling extended names; every merge previews links,
  // confirms explicitly, preserves records and supports existing site merge undo.
  // Sites uses 50-row Load more pages, 500ms database name/postcode/customer search,
  // independent true totals, lazy customer folders/buildings and paged Drag to link.
  // Fixed row actions: visible New job; More actions has Add building, Edit and
  // Delete last, with a confirmation before any row deletion.
  { test: (p) => p === "/sites", slug: "sites" },
  { test: (p) => p === '/sites/access-info', slug: 'sites.access-info' },
  { test: (p) => p === "/site-surveys" || p.startsWith("/site-surveys/"), slug: "site-surveys" },
  { test: (p) => p === "/assets", slug: "assets" },
  { test: (p) => p === "/assets/review", slug: "assets.review" },
  { test: (p) => p === '/assets/duplicates', slug: 'assets.duplicates' },
  { test: (p) => p.startsWith("/r/"), slug: "assets.stickers" },
  { test: (p) => p === '/riser-scan-service', slug: 'assets.stickers' },
  // Outlet references are RISER-N, inlet codes unchanged; suffixes are never reused.
  // Sticker packs start each riser on a new row, inlet first, numeric outlet order,
  // retaining selected-only printing. Asset guide covers count changes/No longer fitted,
  // Print QR labels, outlet checks, map links and reprint history; sticker guide covers
  // the original tagline-free Viva logo, large numbers, 20mm QR and plain customer labels.
  { test: (p) => p.startsWith("/assets/"), slug: "assets.detail" },
  { test: (p) => p === "/engineers", slug: "engineers" },
  { test: (p) => p === "/planner", slug: "planner" },
  { test: (p) => p === "/leave", slug: "leave" },
  // Each next-report result names its job/report or failure; Choose job manually
  // supports duplicate/missing sites while enforcing the customer's ownership.
  { test: (p) => p === "/defects", slug: "defects" },
  { test: (p) => p === "/defects/review", slug: "defects.review" },
  { test: (p) => p === "/compliance", slug: "compliance" },
  { test: (p) => p === '/renewals', slug: 'renewals' },
  { test: (p) => p === '/settings/email-health', slug: 'settings' },
  { test: (p) => p === "/audits", slug: "audits" },
  { test: (p) => p === "/quotes", slug: "quotes" },
  // Price Book retains stable pagination and displays all prices A–Z by description.
  { test: (p) => p === '/settings/price-book', slug: 'price-book' },
  { test: (p) => p === '/settings/extinguisher-rates', slug: 'price-book' },
  // Quote guides include customer-first pricing, meaning-match choices and
  // automatic/overridden/removed remedial attendance charges.
  { test: (p) => /^\/invoices\/[^/]+$/.test(p), slug: 'quotes' },
  { test: (p) => p === "/reports-to-check", slug: "reports-to-check" },
  { test: (p) => p === "/invoices" || p.startsWith("/invoices/"), slug: "invoices" },
  { test: (p) => p === "/contracts" || p.startsWith("/contracts/"), slug: "contracts" },
  { test: (p) => p === "/agreements/templates", slug: "agreements.templates" },
  { test: (p) => p === "/agreements" || p.startsWith("/agreements/"), slug: "agreements" },
  { test: (p) => p === "/parts-library", slug: "parts-library" },
  

  { test: (p) => p === "/stock", slug: "van-stock" },
  { test: (p) => p === "/industry-templates" || p === "/templates", slug: "industry-templates" },
  { test: (p) => p === "/reports" || p.startsWith("/reports/"), slug: "reports" },
  { test: (p) => p === "/report-downloads", slug: "report-downloads" },
  { test: (p) => p === "/settings/import", slug: "settings.import" },
  { test: (p) => p === '/settings/company-isolation', slug: 'settings.company-isolation' },
  { test: (p) => p === "/settings/integrations", slug: "integrations.quickbooks" },
  // Company details is at the top of Documents: name, logo and colour saved together;
  // setup links use exact tabs/sections; saved branding (including Viva's default
  // logo) completes Step 1 without edits. Missing-field errors wait for Save/Next.
  { test: (p) => p === "/settings", slug: "settings" },

  { test: (p) => p === "/fleet", slug: "fleet" },
  { test: (p) => p === "/my-profile", slug: "vehicle-checks" },
  { test: (p) => p === "/my-timesheet", slug: "my-timesheet" },
  { test: (p) => p === "/timesheets", slug: "timesheets" },
  { test: (p) => p.startsWith("/v/"), slug: "my-timesheet" },
  { test: (p) => p === "/sync-status", slug: "sync-status" },
  { test: (p) => p === "/setup/company", slug: "company-setup-wizard" },
  { test: (p) => p === "/setup", slug: "setup" },
  { test: (p) => p === "/install", slug: "install" },
  { test: (p) => p.startsWith("/fire-log/"), slug: "fire-log" },
  { test: (p) => p === "/sign-off", slug: "sign-off" },
  { test: (p) => p === "/admin/support-tickets", slug: "support-tickets" },
  { test: (p) => p === "/archive" || p.startsWith("/archive/"), slug: "paper-scans" },
  { test: (p) => p === "/billing", slug: "billing" },
];

export function resolveHelpSlug(pathname: string): string | null {
  pathname = pathname.split(/[?#]/)[0];
  for (const rule of RULES) {
    if (rule.test(pathname)) return rule.slug;
  }
  return null;
}

export function describeCurrentRoute(pathname: string): string {
  const slug = resolveHelpSlug(pathname);
  return slug ? `${slug} (${pathname})` : pathname;
}
