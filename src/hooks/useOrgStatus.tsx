import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type OrgStatus = {
  org_id: string | null;
  org_name: string | null;
  status: "active" | "suspended" | "cancelled" | null;
  suspension_message: string | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  is_platform_admin: boolean;
};

const DEFAULT: OrgStatus = {
  org_id: null,
  org_name: null,
  status: null,
  suspension_message: null,
  suspension_reason: null,
  suspended_at: null,
  is_platform_admin: false,
};

export function useOrgStatus() {
  const { user, orgId } = useAuth();
  const [data, setData] = useState<OrgStatus>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setData(DEFAULT);
      setLoading(false);
      return;
    }
    const { data: row, error } = await supabase.rpc("current_user_org_status");
    if (error) {
      setData(DEFAULT);
    } else {
      const r = Array.isArray(row) ? row[0] : row;
      setData(
        r
          ? {
              org_id: r.org_id,
              org_name: r.org_name,
              status: (r.status as OrgStatus["status"]) ?? null,
              suspension_message: r.suspension_message,
              suspension_reason: r.suspension_reason,
              suspended_at: r.suspended_at,
              is_platform_admin: !!r.is_platform_admin,
            }
          : DEFAULT,
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live-update when this org's row changes
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org-status-${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "organisations", filter: `id=eq.${orgId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, refresh]);

  return { ...data, loading, refresh };
}
