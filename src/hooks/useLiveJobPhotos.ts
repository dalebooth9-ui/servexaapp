import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchJobPhotoMeta, type JobPhoto } from "@/lib/jobPhotos";
import { sortSitePhotos } from "@/lib/reportSitePhotos";

/**
 * Live list of a job's image photos, oldest (first taken) first.
 * Refreshes automatically when photos are added via the app, WhatsApp,
 * scans, documents or checklist slots.
 */
export function useLiveJobPhotos(jobId?: string | null) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      setPhotos(sortSitePhotos(await fetchJobPhotoMeta(jobId)));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!jobId) return;
    const refresh = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 600);
    };
    const filter = `job_id=eq.${jobId}`;
    const channel = supabase
      .channel(`live_job_photos_${jobId}_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_documents", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_photo_checklist_responses", filter }, refresh)
      .subscribe();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [jobId, load]);

  return { photos, loading, reload: load };
}
