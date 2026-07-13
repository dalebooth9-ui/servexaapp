import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Counts photos on a job across every source (submissions, defects,
 * photo-checklist responses, job_documents that are images). Used for the
 * badge on the Photos tab. Fast: parallel `count: 'exact', head: true`
 * requests — no rows returned.
 */
export function useJobPhotoCount(jobId?: string) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      const [subs, defects, checklist, docs] = await Promise.all([
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("type", "photo"),
        supabase
          .from("defects")
          .select("id, photo_url, photos")
          .eq("job_id", jobId),
        supabase
          .from("job_photo_checklist_responses")
          .select("photo_url, before_photo_url, after_photo_url")
          .eq("job_id", jobId),
        supabase
          .from("job_documents")
          .select("id, file_name")
          .eq("job_id", jobId),
      ]);

      if (cancelled) return;
      let total = subs.count ?? 0;
      for (const d of defects.data ?? []) {
        if ((d as any).photo_url) total++;
        const arr = (d as any).photos as unknown[] | null;
        if (Array.isArray(arr)) total += arr.length;
      }
      for (const c of checklist.data ?? []) {
        if ((c as any).photo_url) total++;
        if ((c as any).before_photo_url) total++;
        if ((c as any).after_photo_url) total++;
      }
      for (const d of docs.data ?? []) {
        const name = ((d as any).file_name || "").toLowerCase();
        if (/\.(jpe?g|png|webp|gif|heic)$/.test(name)) total++;
      }
      setCount(total);
    })();

    return () => { cancelled = true; };
  }, [jobId]);

  return count;
}
