import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, X, CalendarIcon } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
}

interface Engineer {
  user_id: string;
  full_name: string;
}

interface Job {
  id: string;
  name: string;
  reference_number: string;
  status: string;
}

export default function WeeklyPlanner() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Add entry dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState<Date | null>(null);
  const [addEngineerId, setAddEngineerId] = useState("");
  const [addJobId, setAddJobId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const fetchData = async () => {
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");

    const [engRes, jobsRes, schedRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("jobs").select("id, name, reference_number, status").eq("status", "active"),
      supabase
        .from("job_schedule")
        .select("*")
        .gte("schedule_date", startStr)
        .lte("schedule_date", endStr),
    ]);

    setEngineers(engRes.data || []);
    setJobs(jobsRes.data || []);
    setSchedule((schedRes.data as ScheduleEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [weekStart]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("job_schedule_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_schedule" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [weekStart]);

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const getEntriesForCell = (engineerId: string, day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return schedule.filter((e) => e.engineer_id === engineerId && e.schedule_date === dayStr);
  };

  const getJobById = (jobId: string) => jobs.find((j) => j.id === jobId);

  const openAddDialog = (engineerId: string, day: Date) => {
    if (!isAdmin) return;
    setAddEngineerId(engineerId);
    setAddDay(day);
    setAddJobId("");
    setAddNotes("");
    setAddOpen(true);
  };

  const handleAddEntry = async () => {
    if (!addDay || !addEngineerId || !addJobId) return;
    setSaving(true);

    const { error } = await supabase.from("job_schedule").insert({
      job_id: addJobId,
      engineer_id: addEngineerId,
      schedule_date: format(addDay, "yyyy-MM-dd"),
      notes: addNotes || null,
      created_by: user?.id,
    } as any);

    if (error) {
      const msg = error.code === "23505"
        ? "This job is already scheduled for this engineer on this day."
        : "Failed to add schedule entry.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } else {
      toast({ title: "Scheduled", description: "Job added to the planner." });
      setAddOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  const handleRemoveEntry = async (entryId: string) => {
    const { error } = await supabase.from("job_schedule").delete().eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: "Failed to remove entry.", variant: "destructive" });
    } else {
      setSchedule((prev) => prev.filter((e) => e.id !== entryId));
    }
  };

  // For engineer role, filter to only show their row
  const visibleEngineers = isAdmin
    ? engineers
    : engineers.filter((e) => e.user_id === user?.id);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading planner...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Weekly Planner</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-muted-foreground">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-sm font-semibold min-w-[160px]">
                  Engineer
                </th>
                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <th
                      key={day.toISOString()}
                      className={cn(
                        "px-2 py-3 text-center text-sm font-semibold min-w-[130px]",
                        isToday && "bg-primary/5"
                      )}
                    >
                      <div>{format(day, "EEE")}</div>
                      <div className={cn("text-xs font-normal", isToday ? "text-primary font-medium" : "text-muted-foreground")}>
                        {format(day, "MMM d")}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleEngineers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No engineers found.
                  </td>
                </tr>
              ) : (
                visibleEngineers.map((eng) => (
                  <tr key={eng.user_id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 text-sm font-medium">
                      {eng.full_name}
                    </td>
                    {weekDays.map((day) => {
                      const entries = getEntriesForCell(eng.user_id, day);
                      const isToday = isSameDay(day, new Date());
                      return (
                        <td
                          key={day.toISOString()}
                          className={cn(
                            "px-2 py-2 align-top min-h-[80px]",
                            isToday && "bg-primary/5",
                            isAdmin && "cursor-pointer hover:bg-muted/30"
                          )}
                          onClick={() => entries.length === 0 && openAddDialog(eng.user_id, day)}
                        >
                          <div className="space-y-1.5">
                            {entries.map((entry) => {
                              const job = getJobById(entry.job_id);
                              return (
                                <div
                                  key={entry.id}
                                  className="group relative rounded-md border bg-card p-2 text-xs shadow-sm"
                                >
                                  {job ? (
                                    <Link
                                      to={`/jobs/${job.id}`}
                                      className="block"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="font-mono font-medium text-primary hover:underline">
                                        {job.reference_number}
                                      </div>
                                      <div className="truncate text-muted-foreground">{job.name}</div>
                                    </Link>
                                  ) : (
                                    <div className="text-muted-foreground italic">Unknown job</div>
                                  )}
                                  {entry.notes && (
                                    <div className="mt-1 text-muted-foreground italic">{entry.notes}</div>
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveEntry(entry.id);
                                      }}
                                      className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {isAdmin && entries.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAddDialog(eng.user_id, day);
                                }}
                                className="flex w-full items-center justify-center rounded border border-dashed border-muted-foreground/30 py-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add Schedule Entry Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Schedule Job — {addDay && format(addDay, "EEE, MMM d")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Engineer</Label>
              <Input
                value={engineers.find((e) => e.user_id === addEngineerId)?.full_name || ""}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Job</Label>
              <Select value={addJobId} onValueChange={setAddJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      <span className="font-mono text-xs mr-1">{j.reference_number}</span> {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Any notes for this day..."
                rows={2}
              />
            </div>
            <Button onClick={handleAddEntry} className="w-full" disabled={!addJobId || saving}>
              {saving ? "Saving..." : "Add to Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
