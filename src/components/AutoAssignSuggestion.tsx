import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Zap, Palmtree } from "lucide-react";
import { parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

interface EngineerSuggestion {
  user_id: string;
  full_name: string;
  distance_km: number | null;
  workload: number;
  onLeave: boolean;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  jobAddress?: string | null;
  jobLat?: number | null;
  jobLng?: number | null;
  onSelect: (engineerId: string) => void;
  scheduleDate?: string;
}

export default function AutoAssignSuggestion({ jobLat, jobLng, onSelect, scheduleDate }: Props) {
  const [suggestions, setSuggestions] = useState<EngineerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const calculate = async () => {
      setLoading(true);

      const [engineersRes, rolesRes, locationsRes, schedulesRes, leaveRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "engineer"),
        supabase.from("engineer_locations" as any).select("*"),
        supabase.from("job_schedule").select("engineer_id").eq("schedule_date", scheduleDate || new Date().toISOString().split("T")[0]),
        supabase.from("engineer_leave" as any).select("engineer_id, start_date, end_date").eq("status", "approved"),
      ]);

      const engineerIds = new Set((rolesRes.data || []).map((r: any) => r.user_id));
      const locMap = new Map<string, { latitude: number; longitude: number }>();
      ((locationsRes.data || []) as any[]).forEach((l) => locMap.set(l.user_id, l));

      const targetDate = scheduleDate || new Date().toISOString().split("T")[0];
      const workloadMap = new Map<string, number>();
      (schedulesRes.data || []).forEach((s) => {
        workloadMap.set(s.engineer_id, (workloadMap.get(s.engineer_id) || 0) + 1);
      });

      // Build set of engineers on leave on target date
      const onLeaveSet = new Set<string>();
      ((leaveRes.data || []) as any[]).forEach((l) => {
        try {
          const day = startOfDay(parseISO(targetDate));
          if (isWithinInterval(day, {
            start: startOfDay(parseISO(l.start_date)),
            end: endOfDay(parseISO(l.end_date)),
          })) {
            onLeaveSet.add(l.engineer_id);
          }
        } catch { /* skip */ }
      });

      const results: EngineerSuggestion[] = (engineersRes.data || [])
        .filter((e) => engineerIds.has(e.user_id))
        .map((e) => {
          const loc = locMap.get(e.user_id);
          let distance_km: number | null = null;
          if (loc && jobLat && jobLng) {
            distance_km = Math.round(haversineKm(loc.latitude, loc.longitude, jobLat, jobLng) * 10) / 10;
          }
          return {
            user_id: e.user_id,
            full_name: e.full_name,
            distance_km,
            workload: workloadMap.get(e.user_id) || 0,
            onLeave: onLeaveSet.has(e.user_id),
          };
        })
        // Sort: available first, then nearest, then lowest workload
        .sort((a, b) => {
          if (a.onLeave !== b.onLeave) return a.onLeave ? 1 : -1;
          if (a.distance_km !== null && b.distance_km !== null) return a.distance_km - b.distance_km;
          if (a.distance_km !== null) return -1;
          if (b.distance_km !== null) return 1;
          return a.workload - b.workload;
        });

      setSuggestions(results.slice(0, 6));
      setLoading(false);
    };

    calculate();
  }, [jobLat, jobLng, scheduleDate]);

  if (loading) return <p className="text-xs text-muted-foreground">Calculating best matches...</p>;
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Zap className="h-3 w-3" /> Suggested Engineers
      </div>
      <div className="space-y-1">
        {suggestions.map((s) => (
          <div
            key={s.user_id}
            className={
              "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer" +
              (s.onLeave ? " opacity-60" : "")
            }
            onClick={() => !s.onLeave && onSelect(s.user_id)}
            title={s.onLeave ? "Engineer is on approved leave on this date" : undefined}
          >
            <span className="font-medium flex items-center gap-1.5">
              {s.onLeave && <Palmtree className="h-3 w-3 text-amber-500 shrink-0" title="On leave" />}
              {s.full_name}
            </span>
            <div className="flex items-center gap-2">
              {s.onLeave && (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                  On leave
                </Badge>
              )}
              {s.distance_km !== null && !s.onLeave && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <MapPin className="h-2.5 w-2.5" /> {s.distance_km} km
                </Badge>
              )}
              {!s.onLeave && (
                <Badge
                  variant={s.workload === 0 ? "default" : s.workload <= 2 ? "secondary" : "destructive"}
                  className="text-[10px]"
                >
                  {s.workload} jobs today
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
