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
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, Printer, Copy, ArrowLeft, LayoutGrid, Calendar as CalendarIcon, List, Map as MapIcon, Zap, Users, Download, FileText, FileSpreadsheet, Sparkles, Briefcase } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportWorksheetPdf, exportWorksheetXlsx } from "@/components/planner/PlannerWorksheetExport";
import { format, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import WeeklyGridView from "@/components/planner/WeeklyGridView";
import MonthlyView from "@/components/planner/MonthlyView";
import ListView from "@/components/planner/ListView";
import PlannerMapView from "@/components/planner/PlannerMapView";
import AiSchedulerDialog from "@/components/planner/AiSchedulerDialog";
import MultiDayScheduleDialog from "@/components/planner/MultiDayScheduleDialog";

const NOTE_COLORS = [
  { value: null,      label: "Default",  swatch: "bg-foreground/10 border border-border" },
  { value: "#ef4444", label: "Red",      swatch: "bg-red-500" },
  { value: "#f97316", label: "Orange",   swatch: "bg-orange-500" },
  { value: "#eab308", label: "Yellow",   swatch: "bg-yellow-400" },
  { value: "#22c55e", label: "Green",    swatch: "bg-green-500" },
  { value: "#3b82f6", label: "Blue",     swatch: "bg-blue-500" },
  { value: "#a855f7", label: "Purple",   swatch: "bg-purple-500" },
];

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
  notes_color: string | null;
}

export interface AdhocEntry {
  id: string;
  engineer_id: string;
  schedule_date: string | null;
  company_name: string;
  description: string | null;
  allocated_days: number;
}

interface Engineer { user_id: string; full_name: string }

interface Site {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
}

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
  pressure_test_qty: number;
  visual_qty: number;
  other_qty: number;
  other_service_type: string | null;
  due_date?: string | null;
  created_at?: string;
}

export interface JobPart {
  id: string;
  job_id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

export interface SubmissionComment {
  id: string;
  content: string;
  created_at: string;
  submission_id: string;
  submission_job_id?: string;
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
  const [engineerOrder, setEngineerOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("planner_engineer_order") || "[]"); } catch { return []; }
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [jobParts, setJobParts] = useState<JobPart[]>([]);
  const [submissionComments, setSubmissionComments] = useState<SubmissionComment[]>([]);
  const [jobVisitNotes, setJobVisitNotes] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [adhocEntries, setAdhocEntries] = useState<AdhocEntry[]>([]);
  const [optimisedJobOrder, setOptimisedJobOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  // Add entry dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState("");
  const [addEngineerId, setAddEngineerId] = useState("");
  const [addJobId, setAddJobId] = useState("");
  const [addSiteId, setAddSiteId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addNotesColor, setAddNotesColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Labour-only (adhoc) entry dialog
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocDay, setAdhocDay] = useState("");
  const [adhocEngineerId, setAdhocEngineerId] = useState("");
  const [adhocCompany, setAdhocCompany] = useState("");
  const [adhocDesc, setAdhocDesc] = useState("");

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

  // AI Scheduler
  const [aiSchedulerOpen, setAiSchedulerOpen] = useState(false);

  // Multi-day schedule
  const [multiDayJob, setMultiDayJob] = useState<{ id: string; name: string; reference_number: string } | null>(null);

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
    const [engRolesRes, jobsRes, schedRes, sitesRes, adhocRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "engineer"),
      supabase.from("jobs").select("id, name, reference_number, status, priority, category, customer, customer_id, address, site_id, pressure_test_qty, visual_qty, other_qty, other_service_type, due_date, created_at, sites(name, address, postcode), customers(id, name)").in("status", ["active", "scheduled", "revisit"]),
      supabase.from("job_schedule").select("*").gte("schedule_date", rangeStart).lte("schedule_date", rangeEnd),
      supabase.from("sites").select("id, name, address, postcode").order("name"),
      supabase.from("planner_adhoc_entries").select("*").gte("schedule_date", rangeStart).lte("schedule_date", rangeEnd),
    ]);
    const engineerIds = (engRolesRes.data || []).map((r) => r.user_id);
    if (engineerIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engineerIds);
      setEngineers(profilesData || []);
    } else {
      setEngineers([]);
    }
    const fetchedJobs = ((jobsRes.data as any[]) || []).map((j: any) => ({ ...j, site: j.sites || null }));
    setJobs(fetchedJobs);
    setSites(sitesRes.data || []);
    setSchedule((schedRes.data as ScheduleEntry[]) || []);
    setAdhocEntries((adhocRes.data as AdhocEntry[]) || []);

    // Fetch parts and latest comments for scheduled jobs
    const jobIds = fetchedJobs.map((j: any) => j.id);
    if (jobIds.length > 0) {
      const [partsRes, commentsRes, visitsRes] = await Promise.all([
        supabase.from("job_parts").select("id, job_id, name, quantity, notes").in("job_id", jobIds),
        supabase.from("submission_comments").select("id, content, created_at, submission_id, submissions!inner(job_id)").in("submissions.job_id", jobIds).order("created_at", { ascending: false }).limit(500),
        supabase.from("job_visits").select("job_id, notes").in("job_id", jobIds).not("notes", "is", null).order("scheduled_date", { ascending: true }),
      ]);
      setJobParts((partsRes.data as any[]) || []);
      // Build a map of job_id -> first visit note
      const visitMap: Record<string, string> = {};
      for (const v of ((visitsRes.data as any[]) || [])) {
        if (v.notes && !visitMap[v.job_id]) visitMap[v.job_id] = v.notes;
      }
      setJobVisitNotes(visitMap);
      setSubmissionComments(
        ((commentsRes.data as any[]) || []).map((c: any) => ({
          id: c.id,
          content: c.content,
          created_at: c.created_at,
          submission_id: c.submission_id,
          submission_job_id: c.submissions?.job_id,
        }))
      );
    }
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

  // Sorted engineers respecting saved order
  const sortedEngineers = useMemo(() => {
    if (engineerOrder.length === 0) return engineers;
    const ordered = engineerOrder
      .map((id) => engineers.find((e) => e.user_id === id))
      .filter(Boolean) as Engineer[];
    const remaining = engineers.filter((e) => !engineerOrder.includes(e.user_id));
    return [...ordered, ...remaining];
  }, [engineers, engineerOrder]);

  const handleEngineerReorder = useCallback((newOrder: string[]) => {
    setEngineerOrder(newOrder);
    localStorage.setItem("planner_engineer_order", JSON.stringify(newOrder));
  }, []);

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

  // Filter adhoc entries for non-admin
  const filteredAdhoc = useMemo(() => {
    if (isAdmin) return adhocEntries;
    return adhocEntries.filter((a) => a.engineer_id === user?.id);
  }, [adhocEntries, isAdmin, user]);

  // Add adhoc entry handler
  const handleAddAdhoc = async () => {
    if (!adhocDay || !adhocEngineerId || !adhocCompany.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("planner_adhoc_entries").insert({
      engineer_id: adhocEngineerId,
      schedule_date: adhocDay,
      company_name: adhocCompany.trim(),
      description: adhocDesc.trim() || null,
      created_by: user?.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: "Failed to add labour entry.", variant: "destructive" });
    } else {
      toast({ title: "Labour entry added" });
      fetchData();
    }
    setAdhocOpen(false);
    setAdhocCompany("");
    setAdhocDesc("");
    setSaving(false);
  };

  const handleRemoveAdhoc = async (id: string) => {
    await supabase.from("planner_adhoc_entries").delete().eq("id", id);
    fetchData();
  };

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
      const job = jobs.find((j) => j.id === jobId);
      if (job?.status === "scheduled") {
        await supabase.from("jobs").update({ status: "active" } as any).eq("id", jobId);
      }
      toast({ title: "Assigned" });
      fetchData();
    }
  };

  const handleMultiDayAssign = async (jobId: string, engineerId: string, dates: string[]) => {
    const rows = dates.map((date) => ({
      job_id: jobId, engineer_id: engineerId, schedule_date: date, created_by: user?.id,
    }));
    const { error } = await supabase.from("job_schedule").upsert(rows as any[], {
      onConflict: "job_id,engineer_id,schedule_date", ignoreDuplicates: true,
    });
    if (error) {
      toast({ title: "Error", description: "Some dates may already be scheduled.", variant: "destructive" });
    } else {
      const job = jobs.find((j) => j.id === jobId);
      if (job?.status === "scheduled") {
        await supabase.from("jobs").update({ status: "active" } as any).eq("id", jobId);
      }
      toast({ title: "Scheduled", description: `Job added to ${dates.length} day${dates.length !== 1 ? "s" : ""}.` });
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
    if (addSiteId) {
      await supabase.from("jobs").update({ site_id: addSiteId } as any).eq("id", addJobId);
    }
    const { error } = await supabase.from("job_schedule").insert({
      job_id: addJobId, engineer_id: addEngineerId, schedule_date: addDay,
      notes: addNotes.trim() || null, notes_color: addNotesColor, created_by: user?.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.code === "23505" ? "Already scheduled." : "Failed to assign.", variant: "destructive" });
    } else {
      const job = jobs.find((j) => j.id === addJobId);
      if (job?.status === "scheduled") {
        await supabase.from("jobs").update({ status: "active" } as any).eq("id", addJobId);
      }
      fetchData();
    }
    setAddOpen(false);
    setAddNotes("");
    setAddNotesColor(null);
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

  // AI Scheduler confirm
  const handleAiSchedulerConfirm = async (suggestions: { job_id: string; engineer_id: string; date: string }[]) => {
    const rows = suggestions.map((s) => ({
      job_id: s.job_id,
      engineer_id: s.engineer_id,
      schedule_date: s.date,
      created_by: user?.id,
    }));
    const { error } = await supabase.from("job_schedule").upsert(rows as any[], {
      onConflict: "job_id,engineer_id,schedule_date",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    fetchData();
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
        format(new Date(entry.schedule_date), "EEE dd/MM"), eng?.full_name || "", (job as any)?.customers?.name || job?.customer || "",
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

  // (blank worksheet removed — users print the completed planner instead)

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
              <Button
                size="sm"
                className="gap-1.5 bg-primary/90 hover:bg-primary"
                onClick={() => setAiSchedulerOpen(true)}
              >
                <Sparkles className="h-4 w-4" /> AI Schedule
              </Button>
              <Button size="sm" onClick={() => { setAddDay(format(weekDays[0], "yyyy-MM-dd")); setAddEngineerId(""); setAddJobId(""); setAddSiteId(""); setAddNotes(""); setAddOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Entry
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAdhocDay(format(weekDays[0], "yyyy-MM-dd")); setAdhocEngineerId(""); setAdhocCompany(""); setAdhocDesc(""); setAdhocOpen(true); }}
              >
                <Briefcase className="mr-1.5 h-4 w-4" /> Labour
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportWorksheetPdf(weekStart, filteredSchedule, jobs as any, engineers, jobParts, submissionComments, optimisedJobOrder, jobVisitNotes)}>
                <FileText className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportWorksheetXlsx(weekStart, filteredSchedule, jobs as any, engineers, jobParts, submissionComments, optimisedJobOrder, jobVisitNotes)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            engineers={sortedEngineers}
            schedule={filteredSchedule}
            jobs={jobs}
            unallocatedJobs={unallocatedJobs}
            adhocEntries={filteredAdhoc}
            isAdmin={isAdmin}
            onAssign={handleAssign}
            onMove={handleMove}
            onRemove={handleRemove}
            onRemoveAdhoc={handleRemoveAdhoc}
            onMultiDaySchedule={(job) => setMultiDayJob(job)}
            onEngineerReorder={handleEngineerReorder}
          />
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <MonthlyView
            currentDate={monthDate}
            schedule={filteredSchedule}
            jobs={jobs}
            unallocatedJobs={isAdmin ? unallocatedJobs : []}
            engineers={sortedEngineers}
            isAdmin={isAdmin}
            optimisedJobOrder={optimisedJobOrder}
            onAssign={handleAssign}
            onRemove={handleRemove}
          />
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
            jobParts={jobParts}
            submissionComments={submissionComments}
            optimisedJobOrder={optimisedJobOrder}
            jobVisitNotes={jobVisitNotes}
          />
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <PlannerMapView schedule={filteredSchedule} jobs={jobs} engineers={engineers} unallocatedJobs={unallocatedJobs} onRouteOptimised={setOptimisedJobOrder} />
        </TabsContent>
      </Tabs>

      {/* Always-visible map for admins (hidden when map tab is active to avoid duplication) */}
      {isAdmin && view !== "map" && (
        <div className="mt-4">
          <PlannerMapView schedule={filteredSchedule} jobs={jobs} engineers={engineers} unallocatedJobs={unallocatedJobs} onRouteOptimised={setOptimisedJobOrder} />
        </div>
      )}

      {/* Labour Only (Adhoc) Entry Dialog */}
      <Dialog open={adhocOpen} onOpenChange={setAdhocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Labour-Only Entry</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">For work done for other companies not in our job list.</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={adhocDay} onChange={(e) => setAdhocDay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Engineer</Label>
              <Select value={adhocEngineerId} onValueChange={setAdhocEngineerId}>
                <SelectTrigger><SelectValue placeholder="Select engineer..." /></SelectTrigger>
                <SelectContent>
                  {engineers.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                placeholder="e.g. ABC Contractors"
                value={adhocCompany}
                onChange={(e) => setAdhocCompany(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="e.g. Dry riser maintenance, wet riser inspection..."
                value={adhocDesc}
                onChange={(e) => setAdhocDesc(e.target.value)}
                rows={2}
                maxLength={300}
              />
            </div>
            <Button onClick={handleAddAdhoc} className="w-full" disabled={!adhocDay || !adhocEngineerId || !adhocCompany.trim() || saving}>
              {saving ? "Saving..." : "Add Labour Entry"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              <Select value={addJobId} onValueChange={(v) => {
                setAddJobId(v);
                // Pre-select site if job already has one
                const job = jobs.find((j) => j.id === v);
                setAddSiteId(job?.site_id || "");
              }}>
                <SelectTrigger><SelectValue placeholder="Select job..." /></SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => <SelectItem key={j.id} value={j.id}><span className="font-mono text-xs mr-1">{j.reference_number}</span> {j.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Site <span className="text-xs text-muted-foreground font-normal">(assigns site &amp; postcode to job)</span></Label>
              <Select value={addSiteId} onValueChange={setAddSiteId}>
                <SelectTrigger><SelectValue placeholder="No site selected..." /></SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.postcode ? ` — ${s.postcode}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                rows={2}
                style={addNotesColor ? { color: addNotesColor } : undefined}
              />
              {addNotes && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-xs text-muted-foreground mr-1">Highlight:</span>
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      title={c.label}
                      onClick={() => setAddNotesColor(c.value)}
                      className={cn(
                        "h-5 w-5 rounded-full transition-transform",
                        c.swatch,
                        addNotesColor === c.value && "ring-2 ring-offset-1 ring-foreground scale-110"
                      )}
                    />
                  ))}
                </div>
              )}
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

      {/* AI Scheduler Dialog */}
      <AiSchedulerDialog
        open={aiSchedulerOpen}
        onOpenChange={setAiSchedulerOpen}
        unallocatedJobs={unallocatedJobs}
        engineers={sortedEngineers}
        weekStart={weekStart}
        existingSchedule={schedule}
        onConfirm={handleAiSchedulerConfirm}
      />

      {/* Multi-Day Schedule Dialog */}
      <MultiDayScheduleDialog
        open={multiDayJob !== null}
        onOpenChange={(open) => { if (!open) setMultiDayJob(null); }}
        job={multiDayJob}
        engineers={sortedEngineers}
        initialWeekStart={weekStart}
        onConfirm={handleMultiDayAssign}
      />
    </div>
  );
}
