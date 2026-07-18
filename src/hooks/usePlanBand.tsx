import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { bandForStaffCount, nextBandAfter, formatMonthly, type PlanBand, PLAN_BANDS } from "@/lib/planBands";

type State = {
  loading: boolean;
  staffCount: number;
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
  staffCount: 0,
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
 * `<PlanBandBanner />`; no operation is hard-blocked.
 */
export function usePlanBand(): State {
  const { orgId } = useAuth();
  const [state, setState] = useState<State>(defaultState);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [{ data: countData }, { data: orgData }] = await Promise.all([
        supabase.rpc("count_org_staff_users", { _org_id: orgId }),
        supabase.from("organisations").select("user_band").eq("id", orgId).maybeSingle(),
      ]);
      const staffCount = Number(countData ?? 0);
      const required = bandForStaffCount(staffCount);
      const currentCode = (orgData as any)?.user_band ?? PLAN_BANDS[0].code;
      const current = PLAN_BANDS.find((b) => b.code === currentCode) ?? PLAN_BANDS[0];
      const currentIdx = PLAN_BANDS.findIndex((b) => b.code === current.code);
      const requiredIdx = PLAN_BANDS.findIndex((b) => b.code === required.code);
      setState({
        loading: false,
        staffCount,
        currentBand: current,
        requiredBand: required,
        overBand: requiredIdx > currentIdx,
        nextBand: nextBandAfter(current),
      });
    })();
  }, [orgId]);

  return state;
}

export { formatMonthly };
