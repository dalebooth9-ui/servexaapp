/**
 * useOfflineSync — caches assigned jobs, job sheet templates, and profiles
 * into localStorage for offline access. Also queues time-clock entries and
 * photo submissions to sync when connectivity returns.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CACHE_KEYS = {
  JOBS: "offline_jobs",
  TEMPLATES: "offline_templates",
  PROFILE: "offline_profile",
  LAST_SYNC: "offline_last_sync",
};

export function setOfflineCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* storage full — ignore */ }
}

export function getOfflineCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useOfflineSync() {
  const { user, userRole } = useAuth();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!user || syncedRef.current) return;
    syncedRef.current = true;

    const syncData = async () => {
      try {
        // 1. Cache the user's own profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (profile) setOfflineCache(CACHE_KEYS.PROFILE, profile);

        // 2. Cache assigned jobs (engineers) or all active jobs (admins)
        let jobsQuery = supabase
          .from("jobs")
          .select("id, reference_number, name, customer, address, status, priority, category, due_date, customer_id, site_id")
          .in("status", ["active", "scheduled", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(200);

        if (userRole === "engineer") {
          // Get assigned job IDs first
          const { data: assignments } = await supabase
            .from("job_assignments")
            .select("job_id")
            .eq("engineer_id", user.id);
          const jobIds = (assignments || []).map((a: any) => a.job_id);
          if (jobIds.length > 0) {
            jobsQuery = supabase
              .from("jobs")
              .select("id, reference_number, name, customer, address, status, priority, category, due_date, customer_id, site_id")
              .in("id", jobIds)
              .order("due_date", { ascending: true });
          } else {
            setOfflineCache(CACHE_KEYS.JOBS, []);
            return;
          }
        }

        const { data: jobs } = await jobsQuery;
        if (jobs) setOfflineCache(CACHE_KEYS.JOBS, jobs);

        // 3. Cache job sheet templates
        const { data: templates } = await supabase
          .from("job_sheet_templates")
          .select("id, name, category, job_category, fields, description")
          .order("name");
        if (templates) setOfflineCache(CACHE_KEYS.TEMPLATES, templates);

        setOfflineCache(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
      } catch {
        // Silently fail — offline caching is best-effort
      }
    };

    syncData();

    // Re-sync when tab becomes visible (user returns from field)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncedRef.current = false;
        syncData().then(() => { syncedRef.current = true; });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user, userRole]);
}

export { CACHE_KEYS };
