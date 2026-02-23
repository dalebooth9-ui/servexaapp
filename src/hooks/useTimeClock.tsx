import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
};

function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function useTimeClock() {
  const { user } = useAuth();
  const [activeEntry, setActiveEntry] = useState<ClockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);

  const fetchActive = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("time_clock")
      .select("*")
      .eq("user_id", user.id)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1) as any;
    setActiveEntry(data?.[0] ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  // Get GPS on mount for distance calcs
  useEffect(() => {
    getGps().then(setCurrentPos);
  }, []);

  const clockIn = useCallback(async () => {
    if (!user) return;
    setActing(true);
    const gps = await getGps();
    setCurrentPos(gps);
    const { data, error } = await supabase
      .from("time_clock")
      .insert({
        user_id: user.id,
        clock_in_lat: gps?.lat ?? null,
        clock_in_lng: gps?.lng ?? null,
      } as any)
      .select()
      .single() as any;
    if (!error && data) setActiveEntry(data);
    setActing(false);
  }, [user]);

  const clockOut = useCallback(async () => {
    if (!user || !activeEntry) return;
    setActing(true);
    const gps = await getGps();
    const clockInTime = new Date(activeEntry.clock_in_at).getTime();
    const totalMinutes = Math.round((Date.now() - clockInTime) / 60000);
    const { error } = await supabase
      .from("time_clock")
      .update({
        clock_out_at: new Date().toISOString(),
        clock_out_lat: gps?.lat ?? null,
        clock_out_lng: gps?.lng ?? null,
        total_minutes: totalMinutes,
      } as any)
      .eq("id", activeEntry.id) as any;
    if (!error) setActiveEntry(null);
    setActing(false);
  }, [user, activeEntry]);

  const isClockedIn = !!activeEntry;
  const elapsedMinutes = activeEntry
    ? Math.round((Date.now() - new Date(activeEntry.clock_in_at).getTime()) / 60000)
    : 0;

  return { isClockedIn, activeEntry, loading, acting, clockIn, clockOut, elapsedMinutes, currentPos };
}
