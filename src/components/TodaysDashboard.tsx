import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTimeClock } from "@/hooks/useTimeClock";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Briefcase, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type ScheduledJob = {
  id: string;
  name: string;
  reference_number: string;
  address: string | null;
  status: string;
  priority: string;
  customer: string | null;
  schedule_date: string;
  distance_km: number | null;
  schedule_id: string | null;
  acknowledged_at: string | null;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function priorityColor(p: string) {
  switch (p) {
    case "high": return "bg-destructive/10 text-destructive border-destructive/20";
    case "medium": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function TodaysDashboard() {
  const { user } = useAuth();
  const { isClockedIn, currentPos } = useTimeClock();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState<Set<string>>(new Set());
  const [geocoded, setGeocoded] = useState<Map<string, { lat: number; lng: number }>>(new Map());

  useEffect(() => {
    if (!user || !isClockedIn) return;
    const today = format(new Date(), "yyyy-MM-dd");

    const fetchJobs = async () => {
      setLoading(true);
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("id, job_id, schedule_date, acknowledged_at")
        .eq("engineer_id", user.id)
        .eq("schedule_date", today);

      if (!schedules || schedules.length === 0) {
        const { data: assignments } = await supabase
          .from("job_assignments")
          .select("job_id")
          .eq("engineer_id", user.id);

        if (assignments && assignments.length > 0) {
          const jobIds = assignments.map((a) => a.job_id);
          const { data: jobsData } = await supabase
            .from("jobs")
            .select("id, name, reference_number, address, status, priority, customer")
            .in("id", jobIds)
            .in("status", ["active", "scheduled", "in_progress"]);

          setJobs(
            (jobsData || []).map((j) => ({
              ...j,
              schedule_date: today,
              distance_km: null,
              schedule_id: null,
              acknowledged_at: null,
            }))
          );
        } else {
          setJobs([]);
        }
        setLoading(false);
        return;
      }

      const jobIds = schedules.map((s) => s.job_id);
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, name, reference_number, address, status, priority, customer")
        .in("id", jobIds);

      const scheduleByJob = new Map(schedules.map((s: any) => [s.job_id, s]));

      setJobs(
        (jobsData || []).map((j) => {
          const s: any = scheduleByJob.get(j.id);
          return {
            ...j,
            schedule_date: today,
            distance_km: null,
            schedule_id: s?.id ?? null,
            acknowledged_at: s?.acknowledged_at ?? null,
          };
        })
      );
      setLoading(false);
    };

    fetchJobs();
  }, [user, isClockedIn]);

  useEffect(() => {
    if (!currentPos || jobs.length === 0) return;
    const toGeocode = jobs.filter((j) => j.address && !geocoded.has(j.id));
    if (toGeocode.length === 0) return;

    const geocodeAll = async () => {
      const { geocodeWithNominatim } = await import("@/lib/geocodeCache");
      const results = new Map(geocoded);
      for (const job of toGeocode) {
        if (!job.address) continue;
        const coords = await geocodeWithNominatim(job.address);
        if (coords) results.set(job.id, coords);
      }
      setGeocoded(results);
    };
    geocodeAll();
  }, [jobs, currentPos]);

  const jobsWithDistance = useMemo(() => {
    if (!currentPos) return jobs;
    return jobs.map((j) => {
      const coords = geocoded.get(j.id);
      const dist = coords ? haversineKm(currentPos.lat, currentPos.lng, coords.lat, coords.lng) : null;
      return { ...j, distance_km: dist };
    }).sort((a, b) => {
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });
  }, [jobs, geocoded, currentPos]);

  const acknowledge = async (e: React.MouseEvent, job: ScheduledJob) => {
    e.preventDefault();
    e.stopPropagation();
    if (!job.schedule_id || !user) return;
    setAcking((s) => new Set(s).add(job.schedule_id!));
    const nowIso = new Date().toISOString();
    // Optimistic
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, acknowledged_at: nowIso } : j));
    const { error } = await supabase
      .from("job_schedule")
      .update({ acknowledged_at: nowIso, acknowledged_by: user.id })
      .eq("id", job.schedule_id);
    setAcking((s) => { const n = new Set(s); n.delete(job.schedule_id!); return n; });
    if (error) {
      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, acknowledged_at: null } : j));
      toast({ title: "Could not acknowledge", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Job acknowledged", description: job.reference_number });
    }
  };

  if (!isClockedIn) return null;

  const unackCount = jobsWithDistance.filter((j) => j.schedule_id && !j.acknowledged_at).length;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Today's Jobs</h2>
        <Badge variant="secondary" className="ml-auto">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </Badge>
        {unackCount > 0 && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1">
            <AlertCircle className="h-3 w-3" /> {unackCount} to acknowledge
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : jobsWithDistance.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No jobs scheduled for today.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {currentPos && jobsWithDistance[0]?.distance_km !== null && (
            <Card className="overflow-hidden mb-3">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Navigation className="h-4 w-4 text-primary" />
                  <span className="font-medium">First job:</span>
                  <span className="text-muted-foreground">
                    {jobsWithDistance[0].name}
                  </span>
                  <Badge variant="outline" className="ml-auto gap-1">
                    <MapPin className="h-3 w-3" />
                    {jobsWithDistance[0].distance_km!.toFixed(1)} km away
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {jobsWithDistance.map((job) => {
            const needsAck = job.schedule_id && !job.acknowledged_at;
            return (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className={`hover:bg-accent/50 transition-colors cursor-pointer ${needsAck ? "border-amber-500/40" : ""}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">{job.reference_number}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityColor(job.priority)}`}>
                            {job.priority}
                          </Badge>
                          {needsAck ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1">
                              <AlertCircle className="h-2.5 w-2.5" /> Not acknowledged
                            </Badge>
                          ) : job.acknowledged_at ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Acknowledged
                            </Badge>
                          ) : null}
                        </div>
                        <p className="font-medium text-sm truncate">{job.name}</p>
                        {job.customer && (
                          <p className="text-xs text-muted-foreground truncate">{job.customer}</p>
                        )}
                        {job.address && (
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            <MapPin className="h-3 w-3 inline mr-0.5" />
                            {job.address}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {job.distance_km !== null ? (
                          <span className="text-xs font-medium text-primary">
                            {job.distance_km.toFixed(1)} km
                          </span>
                        ) : job.address ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : null}
                        {needsAck && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            disabled={acking.has(job.schedule_id!)}
                            onClick={(e) => acknowledge(e, job)}
                          >
                            {acking.has(job.schedule_id!) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Acknowledge
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
