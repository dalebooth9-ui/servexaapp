import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, Printer, Copy, ArrowLeft, LayoutGrid, Calendar as CalendarIcon, List, Map as MapIcon, Zap, Users } from "lucide-react";
import { format, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import WeeklyGridView from "@/components/planner/WeeklyGridView";
import MonthlyView from "@/components/planner/MonthlyView";
import ListView from "@/components/planner/ListView";
import PlannerMapView from "@/components/planner/PlannerMapView";

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
}

interface Engineer { user_id: string; full_name: string }

interface Job {
  id: string;
  name: string;
  reference_number: string;
  status: string;
  priority: string;
  category: string;
  customer: string | null;
  address: string | null;
  site_id: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
}

function extractPostcode(address: string | null): string {
  if (!address) return "";
  const match = address.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : "";
}

export default function WeeklyPlanner() {
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";

  const [view, setView] = useState<"grid" | "month" | "list" | "map">("grid");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthDate, setMonthDate] = useState(new Date());
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  // Add entry dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState("");
  const [addEngineerId, setAddEngineerId] = useState("");
  const [addJobId, setAddJobId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Batch deploy dialog
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchEngineerId, setBatchEngineerId] = useState("");
  const [batchJobIds, setBatchJobIds] = useState<Set<string>>(new Set());
  const [batchDate, setBatchDate] = useState("");

  // Shunt dialog
  const [shuntOpen, setShuntOpen] = useState(false);
  const [shuntEngineerId, setShuntEngineerId] = useState("");
  const [shuntDays, setShuntDays] = useState("1");
  const [shuntDirection, setShuntDirection] = useState<"forward" | "backward">("forward");
  const [shuntFromDate, setShuntFromDate] = useState("");

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Compute date range based on view
  const rangeStart = useMemo(() => {
    if (view === "month") return format(startOfMonth(monthDate), "yyyy-MM-dd");
    return format(weekStart, "yyyy-MM-dd");
  }, [view, weekStart, monthDate]);

  const rangeEnd = useMemo(() => {
    if (view === "month") return format(endOfMonth(monthDate), "yyyy-MM-dd");
    return format(weekEnd, "yyyy-MM-dd");
  }, [view, weekEnd, monthDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [engRes, jobsRes, schedRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("jobs").select("id, name, reference_number, status, priority, category, customer, address, site_id, sites(name, address, postcode)").eq("status", "active"),
      supabase.from("job_schedule").select("*").gte("schedule_date", rangeStart).lte("schedule_date", rangeEnd),
    ]);
    setEngineers(engRes.data || []);
    setJobs(((jobsRes.data as any[]) || []).map((j: any) => ({ ...j, site: j.sites || null })));
    setSchedule((schedRes.data as ScheduleEntry[]) || []);
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime — listen to both schedule and job status changes
  useEffect(() => {
    const channel = supabase
      .channel("planner_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_schedule" }, () => fetchData())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, (payload) => {
        // Live-update job status without full refetch
        setJobs((prev) => prev.map((j) => j.id === payload.new.id ? { ...j, status: (payload.new as any).status } : j));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Unallocated: active jobs with no schedule entry this period
  const unallocatedJobs = useMemo(() => {
    const scheduledJobIds = new Set(schedule.map((s) => s.job_id));
    return jobs.filter((j) => !scheduledJobIds.has(j.id));
  }, [jobs, schedule]);

  // Filter schedule for non-admin
  const filteredSchedule = useMemo(() => {
    if (isAdmin) return schedule;
    return schedule.filter((s) => s.engineer_id === user?.id);
  }, [schedule, isAdmin, user]);

  // Navigation
  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const prevMonth = () => setMonthDate((d) => addMonths(d, -1));
  const nextMonth = () => setMonthDate((d) => addMonths(d, 1));
  const goThisMonth = () => setMonthDate(new Date());

  // CRUD operations
  const handleAssign = async (jobId: string, engineerId: string, date: string) => {
    const { error } = await supabase.from("job_schedule").insert({
      job_id: jobId, engineer_id: engineerId, schedule_date: date, created_by: user?.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.code === "23505" ? "Already scheduled." : "Failed to assign.", variant: "destructive" });
    } else {
      toast({ title: "Assigned" });
      fetchData();
    }
  };

  const handleMove = async (entryId: string, newEngineerId: string, newDate: string) => {
    const { error } = await supabase.from("job_schedule").update({
      engineer_id: newEngineerId, schedule_date: newDate,
    } as any).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: "Failed to move.", variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const handleRemove = async (entryId: string) => {
    const { error } = await supabase.from("job_schedule").delete().eq("id", entryId);
    if (!error) fetchData();
  };

  const handleBulkReassign = async (entryIds: string[], newEngineerId: string) => {
    const { error } = await supabase.from("job_schedule").update({ engineer_id: newEngineerId } as any).in("id", entryIds);
    if (error) {
      toast({ title: "Error", description: "Failed to reassign.", variant: "destructive" });
    } else {
      toast({ title: "Reassigned", description: `${entryIds.length} entries moved.` });
      fetchData();
    }
  };

  const handleBulkDelete = async (entryIds: string[]) => {
    const { error } = await supabase.from("job_schedule").delete().in("id", entryIds);
    if (!error) {
      toast({ title: "Removed", description: `${entryIds.length} entries removed.` });
      fetchData();
    }
  };

  // Add entry
  const handleAddEntry = async () => {
    if (!addDay || !addEngineerId || !addJobId) return;
    setSaving(true);
    await handleAssign(addJobId, addEngineerId, addDay);
    setAddOpen(false);
    setSaving(false);
  };

  // Batch deploy
  const handleBatchDeploy = async () => {
    if (!batchEngineerId || batchJobIds.size === 0 || !batchDate) return;
    setSaving(true);
    const rows = Array.from(batchJobIds).map((jobId) => ({
      job_id: jobId, engineer_id: batchEngineerId, schedule_date: batchDate, created_by: user?.id,
    }));
    const { error } = await supabase.from("job_schedule").insert(rows as any);
    if (error) {
      toast({ title: "Error", description: "Some jobs may already be scheduled.", variant: "destructive" });
    } else {
      toast({ title: "Batch deployed", description: `${batchJobIds.size} jobs assigned.` });
      setBatchOpen(false);
      setBatchJobIds(new Set());
      fetchData();
    }
    setSaving(false);
  };

  // Shunt scheduling
  const handleShunt = async () => {
    if (!shuntEngineerId || !shuntFromDate) return;
    setSaving(true);
    const days = parseInt(shuntDays) || 1;
    const offset = shuntDirection === "forward" ? days : -days;

    // Get all entries for this engineer from the date onwards
    const { data: entries } = await supabase
      .from("job_schedule")
      .select("id, schedule_date")
      .eq("engineer_id", shuntEngineerId)
      .gte("schedule_date", shuntFromDate)
      .order("schedule_date", { ascending: shuntDirection === "forward" ? false : true });

    if (!entries || entries.length === 0) {
      toast({ title: "Nothing to shunt", variant: "destructive" });
      setSaving(false);
      return;
    }

    // Update each entry sequentially (reverse order to avoid conflicts)
    for (const entry of entries) {
      const newDate = format(addDays(new Date(entry.schedule_date), offset), "yyyy-MM-dd");
      await supabase.from("job_schedule").update({ schedule_date: newDate } as any).eq("id", entry.id);
    }

    toast({ title: "Shunt complete", description: `${entries.length} entries shifted ${days} day(s) ${shuntDirection}.` });
    setShuntOpen(false);
    fetchData();
    setSaving(false);
  };

  // Copy week
  const handleCopyToNextWeek = async () => {
    if (schedule.length === 0) return;
    setCopying(true);
    const entries = schedule.map((e) => ({
      job_id: e.job_id, engineer_id: e.engineer_id,
      schedule_date: format(addDays(new Date(e.schedule_date), 7), "yyyy-MM-dd"),
      notes: e.notes, created_by: user?.id,
    }));
    const { error } = await supabase.from("job_schedule").upsert(entries as any[], {
      onConflict: "job_id,engineer_id,schedule_date", ignoreDuplicates: true,
    });
    if (error) toast({ title: "Error", description: "Failed to copy.", variant: "destructive" });
    else toast({ title: "Week copied", description: `${entries.length} entries duplicated.` });
    setCopying(false);
  };

  // PDF export
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`WEEK COMMENCING ${format(weekStart, "dd/MM/yyyy")}`, margin, y + 5);
    y += 14;

    const cols = [
      { label: "DATE", w: 28 }, { label: "ENGINEER", w: 35 }, { label: "COMPANY", w: 40 },
      { label: "SITE", w: 55 }, { label: "POSTCODE", w: 22 }, { label: "JOB", w: 55 }, { label: "COMMENT", w: 42 },
    ];

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, y, pageW - margin * 2, 8, "F");
    let cx = margin;
    cols.forEach((col) => { doc.text(col.label, cx + 2, y + 5.5); cx += col.w; });
    y += 8;

    doc.setFont("helvetica", "normal");
    const getJob = (id: string) => jobs.find((j) => j.id === id);
    const getEng = (id: string) => engineers.find((e) => e.user_id === id);

    const sorted = [...filteredSchedule].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
    sorted.forEach((entry) => {
      if (y + 8 > pageH - margin) { doc.addPage(); y = margin; }
      const job = getJob(entry.job_id);
      const eng = getEng(entry.engineer_id);
      const row = [
        format(new Date(entry.schedule_date), "EEE dd/MM"), eng?.full_name || "", job?.customer || "",
        job?.site?.address || job?.address || "", job?.site?.postcode || extractPostcode(job?.address || null),
        job ? `${job.reference_number} - ${job.name}` : "", entry.notes || "",
      ];
      doc.setDrawColor(200, 200, 200);
      cx = margin;
      cols.forEach((col, i) => { doc.rect(cx, y, col.w, 8); doc.text(row[i], cx + 2, y + 5.5, { maxWidth: col.w - 4 }); cx += col.w; });
      y += 8;
    });

    doc.save(`planner-${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast({ title: "PDF exported" });
  };

  const isWeeklyNav = view === "grid" || view === "list" || view === "map";

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading planner...</div>;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job Planner</h1>
          <p className="text-lg font-semibold text-muted-foreground mt-0.5">
            {isWeeklyNav
              ? `Week Commencing ${format(weekStart, "dd/MM/yyyy")}`
              : format(monthDate, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Date nav */}
          <Button variant="outline" size="icon" onClick={isWeeklyNav ? prevWeek : prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={isWeeklyNav ? goToday : goThisMonth}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={isWeeklyNav ? nextWeek : nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {isAdmin && (
            <>
              <Button size="sm" onClick={() => { setAddDay(format(weekDays[0], "yyyy-MM-dd")); setAddEngineerId(""); setAddJobId(""); setAddNotes(""); setAddOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Entry
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setBatchEngineerId(""); setBatchJobIds(new Set()); setBatchDate(format(weekDays[0], "yyyy-MM-dd")); setBatchOpen(true); }}>
                <Users className="mr-1.5 h-4 w-4" /> Batch Deploy
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShuntEngineerId(""); setShuntDays("1"); setShuntDirection("forward"); setShuntFromDate(format(new Date(), "yyyy-MM-dd")); setShuntOpen(true); }}>
                <Zap className="mr-1.5 h-4 w-4" /> Shunt
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyToNextWeek} disabled={copying || schedule.length === 0}>
                <Copy className="mr-1.5 h-4 w-4" /> {copying ? "Copying..." : "Copy Week"}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Printer className="mr-1.5 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="grid" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Weekly Grid</TabsTrigger>
          <TabsTrigger value="month" className="gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Monthly</TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5"><List className="h-3.5 w-3.5" /> List</TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5"><MapIcon className="h-3.5 w-3.5" /> Map</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="mt-4">
          <WeeklyGridView
            weekDays={weekDays}
            engineers={engineers}
            schedule={filteredSchedule}
            jobs={jobs}
            unallocatedJobs={unallocatedJobs}
            isAdmin={isAdmin}
            onAssign={handleAssign}
            onMove={handleMove}
            onRemove={handleRemove}
          />
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <MonthlyView currentDate={monthDate} schedule={filteredSchedule} jobs={jobs} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <ListView
            schedule={filteredSchedule}
            engineers={engineers}
            jobs={jobs}
            isAdmin={isAdmin}
            onRemove={handleRemove}
            onBulkReassign={handleBulkReassign}
            onBulkDelete={handleBulkDelete}
          />
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <PlannerMapView schedule={filteredSchedule} jobs={jobs} engineers={engineers} />
        </TabsContent>
      </Tabs>

      {/* Add Entry Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Schedule Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={addDay} onChange={(e) => setAddDay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Engineer</Label>
              <Select value={addEngineerId} onValueChange={setAddEngineerId}>
                <SelectTrigger><SelectValue placeholder="Select engineer..." /></SelectTrigger>
                <SelectContent>
                  {engineers.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Job</Label>
              <Select value={addJobId} onValueChange={setAddJobId}>
                <SelectTrigger><SelectValue placeholder="Select job..." /></SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => <SelectItem key={j.id} value={j.id}><span className="font-mono text-xs mr-1">{j.reference_number}</span> {j.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleAddEntry} className="w-full" disabled={!addJobId || !addEngineerId || !addDay || saving}>
              {saving ? "Saving..." : "Add to Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Deploy Dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Batch Deploy Jobs</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">Assign multiple unallocated jobs to one engineer at once.</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Engineer</Label>
              <Select value={batchEngineerId} onValueChange={setBatchEngineerId}>
                <SelectTrigger><SelectValue placeholder="Select engineer..." /></SelectTrigger>
                <SelectContent>
                  {engineers.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Select Jobs ({batchJobIds.size} selected)</Label>
              <div className="max-h-[200px] overflow-y-auto rounded border p-2 space-y-1">
                {unallocatedJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">All jobs are allocated this period.</p>
                ) : unallocatedJobs.map((j) => (
                  <label key={j.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={batchJobIds.has(j.id)}
                      onChange={() => {
                        setBatchJobIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(j.id)) next.delete(j.id); else next.add(j.id);
                          return next;
                        });
                      }}
                      className="rounded"
                    />
                    <span className="font-mono text-xs text-primary">{j.reference_number}</span>
                    <span className="truncate">{j.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleBatchDeploy} className="w-full" disabled={!batchEngineerId || batchJobIds.size === 0 || !batchDate || saving}>
              {saving ? "Deploying..." : `Deploy ${batchJobIds.size} Job(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shunt Dialog */}
      <Dialog open={shuntOpen} onOpenChange={setShuntOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Shunt Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">Push or pull all visits for an engineer from a date onwards.</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Engineer</Label>
              <Select value={shuntEngineerId} onValueChange={setShuntEngineerId}>
                <SelectTrigger><SelectValue placeholder="Select engineer..." /></SelectTrigger>
                <SelectContent>
                  {engineers.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input type="date" value={shuntFromDate} onChange={(e) => setShuntFromDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select value={shuntDirection} onValueChange={(v) => setShuntDirection(v as "forward" | "backward")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forward">Push Forward</SelectItem>
                    <SelectItem value="backward">Pull Back</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Days</Label>
                <Input type="number" min="1" value={shuntDays} onChange={(e) => setShuntDays(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleShunt} className="w-full" disabled={!shuntEngineerId || !shuntFromDate || saving}>
              {saving ? "Shunting..." : "Apply Shunt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
