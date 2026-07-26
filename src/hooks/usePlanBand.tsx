import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { bandForStaffCount, nextBandAfter, formatMonthly, type PlanBand, PLAN_BANDS } from "@/lib/planBands";

type State = {
  loading: boolean;
  /** Null when the count could not be determined (RPC error, no session, etc.). */
  staffCount: number | null;
  /** The band the org is CURRENTLY paying for (persisted on organisations.user_band). */
  currentBand: PlanBand;
  /** The band the org SHOULD be on given its actual staff count. */
  requiredBand: PlanBand;
  /** True when staff count has pushed the org into a higher band than they're paying for. */
  overBand: boolean;
  /** Next band up (or null if already on top). */
  nextBand: PlanBand | null;
};

const defaultState: State = {
  loading: true,
  staffCount: null,
  currentBand: PLAN_BANDS[0],
  requiredBand: PLAN_BANDS[0],
  overBand: false,
  nextBand: PLAN_BANDS[1] ?? null,
};

/**
 * Reports the org's current staff-user count (portal users excluded) and
 * whether that count has grown past the band they're paying for.
 *
 * Soft enforcement only — the UI surfaces a friendly upgrade banner via
 * `<PlanBandBanner />`; no operation is hard-blocked. If the count cannot
 * be determined we fail silent: `overBand` stays false and no banner shows.
 */
export function usePlanBand(): State {
  const { orgId } = useAuth();
  const [state, setState] = useState<State>(defaultState);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [countRes, orgRes] = await Promise.all([
        supabase.rpc("count_org_staff_users", { _org_id: orgId }),
        supabase.from("organisations").select("user_band").eq("id", orgId).maybeSingle(),
      ]);

      const currentCode = (orgRes.data as any)?.user_band ?? PLAN_BANDS[0].code;
      const current = PLAN_BANDS.find((b) => b.code === currentCode) ?? PLAN_BANDS[0];

      // Fail silent on RPC error — don't invent a count that could trigger a
      // bogus upgrade demand. The banner checks staffCount != null before rendering.
      if (countRes.error || countRes.data === null || countRes.data === undefined) {
        // eslint-disable-next-line no-console
        console.warn("[planBand] staff count unavailable", countRes.error ?? "no data");
        setState({
          loading: false,
          staffCount: null,
          currentBand: current,
          requiredBand: current,
          overBand: false,
          nextBand: nextBandAfter(current),
        });
        return;
      }

      const staffCount = Number(countRes.data);
      const required = bandForStaffCount(staffCount);
      const currentIdx = PLAN_BANDS.findIndex((b) => b.code === current.code);
      const requiredIdx = PLAN_BANDS.findIndex((b) => b.code === required.code);
      // Only "over" when the count PROPERLY exceeds the current band's ceiling.
      // A max of null means the current band is already unlimited.
      const trulyOver =
        staffCount > 0 &&
        current.maxUsers !== null &&
        staffCount > current.maxUsers &&
        requiredIdx > currentIdx;
      setState({
        loading: false,
        staffCount,
        currentBand: current,
        requiredBand: required,
        overBand: trulyOver,
        nextBand: nextBandAfter(current),
      });
    })();
  }, [orgId]);

  return state;
}

export { formatMonthly };
