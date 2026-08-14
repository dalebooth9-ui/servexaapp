import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Count of client errors logged in the last 24 hours (org-scoped by RLS). */
export function useRecentErrorCount(enabled = true): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: c } = await supabase
        .from("client_errors")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      if (!cancelled) setCount(c || 0);
    };
    load();
    const timer = setInterval(load, 120_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return count;
}
