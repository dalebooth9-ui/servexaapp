import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PLANNER_CONFIG_KEY, parsePlannerConfig, defaultPlannerConfig, type PlannerConfig, type PlannerFeature } from "@/lib/plannerConfig";

/** Current company's Planner settings. Reads are company-scoped by app_settings RLS; only admins can save. */
export function usePlannerConfig() {
  const { orgId, user, realUserRole } = useAuth() as any;
  const qc = useQueryClient();
  const queryKey = ["planner-config", orgId];
  const query = useQuery({
    queryKey, enabled: Boolean(orgId && user), staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("org_id", orgId!).eq("key", PLANNER_CONFIG_KEY).maybeSingle();
      if (error) throw error;
      return parsePlannerConfig(data?.value);
    },
  });
  const config: PlannerConfig = query.data ?? defaultPlannerConfig();
  const save = async (next: PlannerConfig) => {
    if (realUserRole !== "admin" || !orgId) throw new Error("Only a company admin can change Planner settings.");
    const { error } = await supabase.from("app_settings").upsert({ org_id: orgId, key: PLANNER_CONFIG_KEY, value: next as any, updated_at: new Date().toISOString() } as any, { onConflict: "org_id,key" });
    if (error) throw error;
    qc.setQueryData(queryKey, next);
  };
  const on = (f: PlannerFeature) => config.features[f];
  return { config, loaded: !query.isPending, on, save, canChange: realUserRole === "admin" };
}
