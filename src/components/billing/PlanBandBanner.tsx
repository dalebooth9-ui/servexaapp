import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePlanBand } from "@/hooks/usePlanBand";
import { formatMonthly } from "@/lib/planBands";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useState } from "react";

/**
 * Soft-enforcement notice shown to admins when their staff-user count has
 * outgrown the band they're paying for. Dismissible for the session;
 * re-appears on next load until the org upgrades.
 */
export default function PlanBandBanner() {
  const { userRole } = useAuth();
  const { overBand, loading, staffCount, currentBand, requiredBand } = usePlanBand();
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("planBandBanner:dismissed") === "1",
  );

  // Hard guards — never render on missing/zero count, never render when the
  // count is within the current band's ceiling. A failed count fails silent.
  if (
    loading ||
    userRole !== "admin" ||
    !overBand ||
    dismissed ||
    staffCount == null ||
    staffCount <= 0 ||
    currentBand.maxUsers == null ||
    staffCount <= currentBand.maxUsers
  ) {
    return null;
  }

  const dismiss = () => {
    sessionStorage.setItem("planBandBanner:dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="border-b border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-2">
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1">
          <span className="font-medium">You've grown past your plan.</span>{" "}
          <span className="text-muted-foreground">
            You have {staffCount} staff {staffCount === 1 ? "user" : "users"} — your current {currentBand.label} band covers up to {currentBand.maxUsers}.
            Upgrade to the {requiredBand.label} band ({formatMonthly(requiredBand.monthlyPriceGbp)}) to stay compliant.
            <span className="ml-1">Customer portal users don't count.</span>
          </span>
        </div>
        <Link
          to="/billing"
          className="hidden sm:inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
        >
          Upgrade <ArrowUpRight className="h-3 w-3" />
        </Link>
        <button
          onClick={dismiss}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
