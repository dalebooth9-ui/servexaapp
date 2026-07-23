import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTimeClock } from "@/hooks/useTimeClock";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MapPin, CalendarClock, Truck, AlertTriangle, CheckCircle2, LogIn, LogOut } from "lucide-react";
import VehicleCheckSheet from "@/components/VehicleCheckSheet";
import { OpenInMapsButton } from "@/components/OpenInMapsButton";
import FieldConnectivityTip from "@/components/engineer/FieldConnectivityTip";


type JobLite = {
  id: string;
  name: string;
  reference_number: string;
  address: string | null;
  status: string;
  priority: string;
  customer: string | null;
  category: string | null;
  schedule_date: string | null;
  scheduled_time: string | null;
  schedule_id: string | null;
  acknowledged_at: string | null;
};

function priorityChip(p?: string) {
  switch (p) {
    case "high": return "bg-destructive/10 text-destructive border-destructive/30";
    case "medium": return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function BigJobCard({ job, showDate = false }: { job: JobLite; showDate?: boolean }) {
  const needsAck = job.schedule_id && !job.acknowledged_at;
  return (
    <Link to={`/jobs/${job.id}`} className="block active:scale-[0.99] transition-transform">
      <Card className={`overflow-hidden border-2 ${needsAck ? "border-amber-500/40" : "border-border"}`}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold leading-tight break-words">
                {job.name}
              </p>
              {job.customer && (
                <p className="text-base text-muted-foreground mt-0.5 truncate">{job.customer}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="font-mono text-xs text-muted-foreground">{job.reference_number}</span>
              {needsAck && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" /> Ack
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {job.category && (
              <Badge variant="outline" className="text-xs capitalize">
                {job.category.replace(/_/g, " ")}
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs capitalize ${priorityChip(job.priority)}`}>
              {job.priority || "normal"}
            </Badge>
            {showDate && job.schedule_date && (
              <Badge variant="secondary" className="text-xs gap-1">
                <CalendarClock className="h-3 w-3" />
                {format(parseISO(job.schedule_date), "EEE d MMM")}
              </Badge>
            )}
            {job.scheduled_time && (
              <Badge variant="secondary" className="text-xs font-mono">{job.scheduled_time.slice(0,5)}</Badge>
            )}
          </div>

          {job.address && (
            <div className="flex items-start gap-2 pt-1">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground flex-1">{job.address}</p>
              <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <OpenInMapsButton
                  address={job.address}
                  size="sm"
                  variant="outline"
                  iconOnly
                  className="h-11 w-11 p-0 shrink-0"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function EngineerTodayHome() {
  const { user, effectiveUserId } = useAuth();
  const engineerId = effectiveUserId ?? user?.id ?? null;

  const { isClockedIn, clockIn, clockOut, loading: clockLoading } = useTimeClock();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<JobLite[]>([]);
  const [week, setWeek] = useState<JobLite[]>([]);
  const [awaitingDate, setAwaitingDate] = useState<JobLite[]>([]);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [vehicleCheckOk, setVehicleCheckOk] = useState<boolean | null>(null);
  const [vcDialogOpen, setVcDialogOpen] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const load = async () => {
    if (!user) return;
    setLoading(true);

    // 1. Vehicle check today
    const { data: vc } = await supabase
      .from("vehicle_checks")
      .select("status")
      .eq("engineer_id", user.id)
      .eq("check_date", todayStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setVehicleCheckOk(vc?.status === "accepted");

    // 2. Week schedule for this engineer
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");
    const { data: schedRows } = await supabase
      .from("job_schedule")
      .select("id, job_id, schedule_date, scheduled_time, acknowledged_at")
      .eq("engineer_id", user.id)
      .gte("schedule_date", weekStartStr)
      .lte("schedule_date", weekEndStr)
      .order("schedule_date", { ascending: true });

    const jobIds = Array.from(new Set((schedRows || []).map((s: any) => s.job_id)));
    let jobsById = new Map<string, any>();
    if (jobIds.length) {
      const { data: js } = await supabase
        .from("jobs")
        .select("id, name, reference_number, address, status, priority, customer, category")
        .in("id", jobIds);
      (js || []).forEach((j: any) => jobsById.set(j.id, j));
    }

    const combined: JobLite[] = (schedRows || [])
      .map((s: any) => {
        const j = jobsById.get(s.job_id);
        if (!j) return null;
        return {
          ...j,
          schedule_date: s.schedule_date,
          scheduled_time: s.scheduled_time,
          schedule_id: s.id,
          acknowledged_at: s.acknowledged_at,
        } as JobLite;
      })
      .filter(Boolean) as JobLite[];

    setToday(combined.filter((j) => j.schedule_date === todayStr));
    setWeek(combined);

    // 3. Next scheduled date beyond today (for empty-state hint)
    if (!combined.some((j) => j.schedule_date === todayStr)) {
      const { data: nextRow } = await supabase
        .from("job_schedule")
        .select("schedule_date")
        .eq("engineer_id", user.id)
        .gt("schedule_date", todayStr)
        .order("schedule_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      setNextDate(nextRow?.schedule_date ?? null);
    } else {
      setNextDate(null);
    }

    // 4. Assigned-but-undated
    const { data: assigns } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("engineer_id", user.id);
    const assignedIds = Array.from(new Set((assigns || []).map((a: any) => a.job_id)));

    if (assignedIds.length) {
      const { data: schedForAssigned } = await supabase
        .from("job_schedule")
        .select("job_id, schedule_date")
        .eq("engineer_id", user.id)
        .in("job_id", assignedIds)
        .gte("schedule_date", todayStr);
      const scheduledSet = new Set((schedForAssigned || []).map((s: any) => s.job_id));
      const undatedIds = assignedIds.filter((id) => !scheduledSet.has(id));
      if (undatedIds.length) {
        const { data: undatedJobs } = await supabase
          .from("jobs")
          .select("id, name, reference_number, address, status, priority, customer, category")
          .in("id", undatedIds)
          .in("status", ["active", "scheduled", "in_progress", "planning"]);
        setAwaitingDate(
          (undatedJobs || []).map((j: any) => ({
            ...j,
            schedule_date: null,
            scheduled_time: null,
            schedule_id: null,
            acknowledged_at: null,
          })),
        );
      } else {
        setAwaitingDate([]);
      }
    } else {
      setAwaitingDate([]);
    }

    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const weekGroups = useMemo(() => {
    const days: { date: Date; jobs: JobLite[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const key = format(d, "yyyy-MM-dd");
      const dayJobs = week.filter((j) => j.schedule_date === key);
      if (dayJobs.length) days.push({ date: d, jobs: dayJobs });
    }
    return days;
  }, [week, weekStart]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-3xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE d MMMM")}</p>
      </div>

      <FieldConnectivityTip />



      {/* Clock in/out — always visible, large tap */}
      <button
        onClick={isClockedIn ? clockOut : clockIn}
        disabled={clockLoading}
        className={`w-full rounded-2xl p-4 min-h-14 flex items-center justify-between border-2 transition-all active:scale-[0.99] ${
          isClockedIn ? "border-destructive/40 bg-destructive/10" : "border-primary/40 bg-primary/10"
        }`}
      >
        <span className="flex items-center gap-3">
          {clockLoading
            ? <Loader2 className="h-6 w-6 animate-spin" />
            : isClockedIn
              ? <LogOut className="h-6 w-6 text-destructive" />
              : <LogIn className="h-6 w-6 text-primary" />}
          <span className={`font-bold text-lg ${isClockedIn ? "text-destructive" : "text-primary"}`}>
            {isClockedIn ? "Clock out" : "Clock in"}
          </span>
        </span>
        <span className={`h-3 w-3 rounded-full ${isClockedIn ? "bg-destructive animate-pulse" : "bg-muted-foreground/30"}`} />
      </button>

      {/* Vehicle check banner */}
      {vehicleCheckOk === false && (
        <button
          onClick={() => setVcDialogOpen(true)}
          className="w-full rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-4 min-h-14 flex items-center justify-between active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <Truck className="h-6 w-6 text-amber-600" />
            <span className="text-left">
              <span className="block font-bold text-base">Vehicle check due</span>
              <span className="block text-sm text-muted-foreground">Complete before starting a job</span>
            </span>
          </span>
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </button>
      )}
      {vehicleCheckOk && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Vehicle check completed today
        </div>
      )}

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="w-full h-12">
          <TabsTrigger value="today" className="flex-1 text-base h-full">Today</TabsTrigger>
          <TabsTrigger value="week" className="flex-1 text-base h-full">This week</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : today.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <p className="text-lg font-medium">No jobs scheduled today</p>
                {nextDate ? (
                  <p className="text-sm text-muted-foreground">
                    Next scheduled: <span className="font-medium text-foreground">{format(parseISO(nextDate), "EEEE d MMM")}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Enjoy the quiet.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            today.map((j) => <BigJobCard key={j.id} job={j} />)
          )}
        </TabsContent>

        <TabsContent value="week" className="mt-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {weekGroups.map(({ date, jobs }) => (
                <div key={date.toISOString()} className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {isSameDay(date, new Date()) ? "Today · " : ""}{format(date, "EEEE d MMM")}
                  </p>
                  {jobs.map((j) => <BigJobCard key={j.id + date.toISOString()} job={j} />)}
                </div>
              ))}
              {awaitingDate.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pt-2">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Awaiting date</p>
                    <Badge variant="outline" className="text-[11px]">Not yet scheduled</Badge>
                  </div>
                  {awaitingDate.map((j) => <BigJobCard key={"und-" + j.id} job={j} />)}
                </div>
              )}
              {weekGroups.length === 0 && awaitingDate.length === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    Nothing scheduled this week.
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={vcDialogOpen} onOpenChange={setVcDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Daily vehicle check</DialogTitle></DialogHeader>
          <VehicleCheckSheet onAccepted={() => { setVcDialogOpen(false); load(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
