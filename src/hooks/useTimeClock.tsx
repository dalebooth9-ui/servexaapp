import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { flushQueue, getGps, newActionId, readQueue, submitOrQueue, type ClockAction } from "@/lib/vanClock";

export type ClockEntry = {
  id: string;
  user_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  total_minutes: number | null;
  van_id?: string | null;
  break_minutes?: number;
  break_started_at?: string | null;
};

export type StartResult = { status: "started" | "already_started" | "queued"; entry?: ClockEntry; at: string };
export type FinishResult = { status: "finished" | "queued"; entry?: ClockEntry; at: string };

/** Day clock for the logged-in user. Writes go through server functions; offline scans queue with their true time. */
export function useTimeClock() {
  const { user } = useAuth();
  const [activeEntry, setActiveEntry] = useState<ClockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState(readQueue().length);

  const fetchActive = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("time_clock")
      .select("*")
      .eq("user_id", user.id)
      .is("clock_out_at", null)
      .gte("clock_in_at", new Date(Date.now() - 20 * 3600_000).toISOString())
      .order("clock_in_at", { ascending: false })
      .limit(1) as any;
    // Apply any scans still waiting on the phone so the button shows the right state.
    let entry: ClockEntry | null = data?.[0] ?? null;
    for (const q of readQueue().sort((a, b) => a.at.localeCompare(b.at))) {
      if (q.kind === "start" && !entry) entry = { id: q.id, user_id: user.id, clock_in_at: q.at, clock_out_at: null, clock_in_lat: q.lat ?? null, clock_in_lng: q.lng ?? null, clock_out_lat: null, clock_out_lng: null, total_minutes: null, van_id: q.vanId };
      if (q.kind === "finish") entry = null;
      if (entry && q.kind === "break_start") entry = { ...entry, break_started_at: q.at };
      if (entry && q.kind === "break_end") entry = { ...entry, break_started_at: null };
    }
    setActiveEntry(entry);
    setPending(readQueue().length);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  useEffect(() => {
    const flush = async () => {
      if (!readQueue().length) return;
      const n = await flushQueue();
      if (n) toast.success("Saved clock times sent to the office");
      fetchActive();
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [fetchActive]);

  const run = useCallback(async (kind: ClockAction["kind"], opts: { vanId?: string | null; source?: string } = {}) => {
    const at = new Date().toISOString();
    const gps = kind === "start" || kind === "finish" ? await getGps() : null;
    if (gps) setCurrentPos(gps);
    const action: ClockAction = { id: newActionId(), kind, at, vanId: opts.vanId ?? null, lat: gps?.lat ?? null, lng: gps?.lng ?? null, source: opts.source || "button" };
    const res = await submitOrQueue(action);
    setPending(readQueue().length);
    return { res, at };
  }, []);

  const startDay = useCallback(async (vanId?: string | null, source = "button"): Promise<StartResult> => {
    if (!user) throw new Error("Please log in first.");
    setActing(true);
    try {
      const { res, at } = await run("start", { vanId, source });
      if (res.queued) { await fetchActive(); return { status: "queued", at }; }
      const status = res.data?.result === "already_started" ? "already_started" : "started";
      setActiveEntry(res.data?.entry ?? null);
      return { status, entry: res.data?.entry, at };
    } finally { setActing(false); }
  }, [user, run, fetchActive]);

  const finishDay = useCallback(async (source = "button"): Promise<FinishResult> => {
    if (!user) throw new Error("Please log in first.");
    setActing(true);
    try {
      const { res, at } = await run("finish", { source });
      if (res.queued) { await fetchActive(); return { status: "queued", at }; }
      setActiveEntry(null);
      return { status: "finished", entry: res.data?.entry, at };
    } finally { setActing(false); }
  }, [user, run, fetchActive]);

  const setBreak = useCallback(async (on: boolean) => {
    setActing(true);
    try { await run(on ? "break_start" : "break_end"); await fetchActive(); }
    catch (e: any) { toast.error(e?.message || "Could not update break"); }
    finally { setActing(false); }
  }, [run, fetchActive]);

  // Backwards-compatible names used by older screens.
  const clockIn = useCallback(async () => {
    try { const r = await startDay(null, "button"); toast.success(r.status === "queued" ? "No signal — start saved on this phone, it will send when back online" : "Day started"); }
    catch (e: any) { toast.error(e?.message || "Could not start your day"); }
  }, [startDay]);
  const clockOut = useCallback(async () => {
    try { const r = await finishDay("button"); toast.success(r.status === "queued" ? "No signal — finish saved on this phone, it will send when back online" : "Day finished"); }
    catch (e: any) { toast.error(e?.message || "Could not finish your day"); }
  }, [finishDay]);

  const isClockedIn = !!activeEntry;
  const onBreak = !!activeEntry?.break_started_at;
  const elapsedMinutes = activeEntry
    ? Math.round((Date.now() - new Date(activeEntry.clock_in_at).getTime()) / 60000)
    : 0;

  return { isClockedIn, activeEntry, loading, acting, clockIn, clockOut, startDay, finishDay, setBreak, onBreak, pending, refresh: fetchActive, elapsedMinutes, currentPos };
}
