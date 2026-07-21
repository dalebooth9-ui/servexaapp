import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Global registry of "unsaved change" guards. Any page that has state which
 * cannot be recovered by autosave can register a guard function returning a
 * confirmation message (or null when it's safe to leave). BackButton (and any
 * future navigation affordance) checks these before navigating away.
 *
 * Most of the app autosaves via `autosave_*` localStorage entries, so guards
 * are only needed on flows that lack that (currently: not required — Fill In
 * Online autosaves — but the hook is here for future-proofing).
 */
type Guard = () => string | null;
const guards = new Set<Guard>();
export function registerUnsavedGuard(g: Guard) {
  guards.add(g);
  return () => guards.delete(g);
}
function checkGuards(): boolean {
  for (const g of guards) {
    const msg = g();
    if (msg) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(msg)) return false;
    }
  }
  return true;
}

/**
 * Routes that already act as top-level "home" screens. The back affordance is
 * suppressed on these so the header stays uncluttered.
 */
const ROOT_ROUTES = new Set<string>([
  "/",
  "/app",
  "/dashboard",
  "/jobs",
  "/customers",
  "/planner",
  "/site-surveys",
  "/leave",
  "/invoices",
  "/contracts",
  "/renewals",
  "/sites",
  "/assets",
  "/quotes",
  "/parts-library",
  "/stock",
  "/compliance",
  "/audits",
  "/defects",
  "/report-downloads",
  "/sync-status",
  "/industry-templates",
  "/reports",
  "/engineers",
  "/billing",
  "/setup",
  "/settings",
  "/paper-scans",
  "/auth",
]);

/**
 * Explicit parent routes for pages whose parent isn't just the path minus the
 * last segment. Anything not listed falls back to strip-last-segment (e.g.
 * `/jobs/123` → `/jobs`, `/customers/abc/edit` → `/customers/abc`).
 */
const PARENT_OVERRIDES: Array<[RegExp, string]> = [
  [/^\/settings\/.+/, "/settings"],
  [/^\/rams\/.+/, "/industry-templates"],
  [/^\/audit\/.+/, "/audits"],
  [/^\/audits\/.+/, "/audits"],
  [/^\/site-surveys\/.+/, "/site-surveys"],
  [/^\/service-contracts\/.+/, "/contracts"],
  [/^\/contracts\/.+/, "/contracts"],
  [/^\/quotes\/.+/, "/quotes"],
  [/^\/invoices\/.+/, "/invoices"],
  [/^\/assets\/.+/, "/assets"],
  [/^\/sites\/.+/, "/sites"],
  [/^\/customers\/[^/]+$/, "/customers"],
  [/^\/jobs\/[^/]+$/, "/jobs"],
  [/^\/paper-scans\/.+/, "/paper-scans"],
  [/^\/platform\/.+/, "/"],
  [/^\/admin\/.+/, "/"],
  [/^\/support\/.+/, "/"],
  [/^\/engineers\/.+/, "/engineers"],
  [/^\/planner\/.+/, "/planner"],
  [/^\/reports\/.+/, "/reports"],
  [/^\/setup\/.+/, "/setup"],
];

function resolveFallback(pathname: string): string {
  for (const [pattern, parent] of PARENT_OVERRIDES) {
    if (pattern.test(pathname)) return parent;
  }
  const trimmed = pathname.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  if (cut <= 0) return "/";
  return trimmed.slice(0, cut) || "/";
}

export function shouldShowBack(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return !ROOT_ROUTES.has(clean);
}

interface BackButtonProps {
  label?: string;
  className?: string;
  /** Force a specific fallback path instead of the auto-derived one. */
  fallback?: string;
  /** Visual variant — matches the surrounding chrome. */
  tone?: "dark" | "light";
}

export default function BackButton({
  label,
  className,
  fallback,
  tone = "light",
}: BackButtonProps) {
  const location = useLocation();
  const navigate = useNavigate();

  if (!shouldShowBack(location.pathname)) return null;

  const go = () => {
    if (!checkGuards()) return;
    // Prefer in-app history when available. history.length > 1 covers most
    // in-app nav; falling back to the logical parent means deep-linked users
    // (opened in a new tab, followed a link from email) still get somewhere
    // sensible rather than a dead browser Back.
    const hasHistory = window.history.length > 1 && document.referrer.includes(window.location.host);
    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallback ?? resolveFallback(location.pathname));
    }
  };

  return (
    <button
      type="button"
      onClick={go}
      aria-label={label ? `Back — ${label}` : "Back"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium transition-colors",
        // 44px min tap target on touch via py + h-11 override at sm-
        "min-h-[44px] sm:min-h-0",
        tone === "dark"
          ? "text-white/85 hover:text-white hover:bg-white/10"
          : "text-foreground/75 hover:text-foreground hover:bg-muted",
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5 shrink-0" />
      {label ? <span className="truncate">{label}</span> : <span className="hidden sm:inline">Back</span>}
    </button>
  );
}
