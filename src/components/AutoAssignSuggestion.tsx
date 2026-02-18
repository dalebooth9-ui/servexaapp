import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Zap } from "lucide-react";

interface EngineerSuggestion {
  user_id: string;
  full_name: string;
  distance_km: number | null;
  workload: number;
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

      // Get all engineer profiles
      const { data: engineers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");

      // Get engineer roles to filter only engineers
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "engineer");
      const engineerIds = new Set((roles || []).map((r) => r.user_id));

      // Get live locations
      const { data: locations } = await supabase.from("engineer_locations" as any).select("*");
      const locMap = new Map<string, { latitude: number; longitude: number }>();
      ((locations || []) as any[]).forEach((l) => locMap.set(l.user_id, l));

      // Get workload for today/target date
      const targetDate = scheduleDate || new Date().toISOString().split("T")[0];
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("engineer_id")
        .eq("schedule_date", targetDate);
      const workloadMap = new Map<string, number>();
      (schedules || []).forEach((s) => {
        workloadMap.set(s.engineer_id, (workloadMap.get(s.engineer_id) || 0) + 1);
      });

      const results: EngineerSuggestion[] = (engineers || [])
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
          };
        })
        // Sort: nearest first (nulls last), then by lowest workload
        .sort((a, b) => {
          if (a.distance_km !== null && b.distance_km !== null) return a.distance_km - b.distance_km;
          if (a.distance_km !== null) return -1;
          if (b.distance_km !== null) return 1;
          return a.workload - b.workload;
        });

      setSuggestions(results.slice(0, 5));
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
            className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
            onClick={() => onSelect(s.user_id)}
          >
            <span className="font-medium">{s.full_name}</span>
            <div className="flex items-center gap-2">
              {s.distance_km !== null && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <MapPin className="h-2.5 w-2.5" /> {s.distance_km} km
                </Badge>
              )}
              <Badge variant={s.workload === 0 ? "default" : s.workload <= 2 ? "secondary" : "destructive"} className="text-[10px]">
                {s.workload} jobs today
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
