import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, Printer, Copy, LayoutGrid, Calendar as CalendarIcon, List, Map as MapIcon, Zap, Users, Download, FileText, FileSpreadsheet, Sparkles, Briefcase, Bot } from "lucide-react";
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
import AutonomousAgentDialog from "@/components/planner/AutonomousAgentDialog";
import MultiDayScheduleDialog from "@/components/planner/MultiDayScheduleDialog";
import QuickScheduleDialog from "@/components/jobs/QuickScheduleDialog";
import EngineerVisibilityFilter from "@/components/planner/EngineerVisibilityFilter";
import BulkPrintSheetsDialog from "@/components/planner/BulkPrintSheetsDialog";
import type { BulkPrintSelection } from "@/lib/bulkPrintJobSheets";
import { format as fmtDate, endOfWeek as _endOfWeek } from "date-fns";

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
  const { userRole, user, effectiveUserId, isPreviewingAsEngineer, previewEngineerId, previewEngineerName } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";
  // For non-admins the planner is strictly personal: use the effective engineer id
  // (real user, or the previewed engineer when an admin is impersonating a specific one).
  // In generic engineer preview (no engineer chosen) there is no real id — we show a
  // single placeholder row so the admin still sees the true engineer experience.
  const genericEngineerPreview = isPreviewingAsEngineer && !previewEngineerId;
  const engineerScopeId: string | null = isAdmin
    ? null
    : genericEngineerPreview
      ? null
      : (effectiveUserId ?? user?.id ?? null);

  const [view, setView] = useState<"grid" | "month" | "list" | "map">("grid");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthDate, setMonthDate] = useState(new Date());
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [bulkPrintSelection, setBulkPrintSelection] = useState<BulkPrintSelection | null>(null);
  const [engineerOrder, setEngineerOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("planner_engineer_order") || "[]"); } catch { return []; }
  });

  // Hydrate engineer order from DB (source of truth) — localStorage is just a cache for instant render
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("planner_engineer_order")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const dbOrder = Array.isArray(data?.planner_engineer_order) ? (data!.planner_engineer_order as string[]) : [];
      const cached = (() => { try { return JSON.parse(localStorage.getItem("planner_engineer_order") || "[]"); } catch { return []; } })();
      if (JSON.stringify(dbOrder) !== JSON.stringify(cached)) {
        setEngineerOrder(dbOrder);
        localStorage.setItem("planner_engineer_order", JSON.stringify(dbOrder));
      }
    })();
    return () => { cancelled = true; };
  }, [user]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [jobParts, setJobParts] = useState<JobPart[]>([]);
  const [submissionComments, setSubmissionComments] = useState<SubmissionComment[]>([]);
  const [jobVisitNotes, setJobVisitNotes] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [scheduleCapped, setScheduleCapped] = useState(false);
  const [adhocEntries, setAdhocEntries] = useState<AdhocEntry[]>([]);
  const [optimisedJobOrder, setOptimisedJobOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  // Unique channel name per mount to avoid subscription conflicts
  const channelName = useRef('planner_realtime_' + Math.random().toString(36).slice(2));

  // Track ids of job_schedule rows we just edited locally so realtime echoes can be
  // identified and conflicts with other planners can be flagged.
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const lastRemoteToastRef = useRef<number>(0);
  const markLocalEdit = (ids: (string | undefined | null)[]) => {
    const now = Date.now();
    for (const id of ids) if (id) localEditsRef.current.set(id, now);
    for (const [k, v] of localEditsRef.current) {
      if (now - v > 10000) localEditsRef.current.delete(k);
    }
  };
  const editStamp = () => ({
    last_modified_by: user?.id ?? null,
    last_modified_at: new Date().toISOString(),
  });

  // ----- Drag-drop undo (last action only) -----
  const undoRef = useRef<{ toastId: string | number; timeoutId: ReturnType<typeof setTimeout> } | null>(null);
  const cancelPendingUndo = () => {
    if (undoRef.current) {
      clearTimeout(undoRef.current.timeoutId);
      sonnerToast.dismiss(undoRef.current.toastId);
      undoRef.current = null;
    }
  };
  const showUndoToast = (message: string, onUndo: () => Promise<void> | void) => {
    cancelPendingUndo();
    const toastId = sonnerToast(message, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: async () => {
          if (undoRef.current?.toastId === toastId) {
            clearTimeout(undoRef.current.timeoutId);
            undoRef.current = null;
          }
          try {
            await onUndo();
            sonnerToast.success("Move undone", { duration: 2500 });
          } catch (e) {
            sonnerToast.error("Could not undo move");
          }
        },
      },
    });
    const timeoutId = setTimeout(() => {
      if (undoRef.current?.toastId === toastId) undoRef.current = null;
    }, 6500);
    undoRef.current = { toastId, timeoutId };
  };
  const fmtMoveLabel = (engineerId: string, date: string) => {
    const eng = engineers.find((e) => e.user_id === engineerId)?.full_name || "Engineer";
    let dateLabel = date;
    try { dateLabel = format(new Date(date), "EEE d MMM"); } catch {}
    return `Job moved to ${eng} — ${dateLabel}`;
  };

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
  const [mapScheduleJob, setMapScheduleJob] = useState<{ id: string; name: string; reference_number: string } | null>(null);
  const [adhocDay, setAdhocDay] = useState("");
  const [adhocEngineerId, setAdhocEngineerId] = useState("");
  const [adhocCompany, setAdhocCompany] = useState("");
  const [adhocDesc, setAdhocDesc] = useState("");
  const [adhocDays, setAdhocDays] = useState("1");

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
  const [shuntSkipWeekends, setShuntSkipWeekends] = useState(false);

  // AI Scheduler
  const [aiSchedulerOpen, setAiSchedulerOpen] = useState(false);
  // Autonomous Agent
  const [agentOpen, setAgentOpen] = useState(false);

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
    setLoadError(null);
    setScheduleCapped(false);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLoadError("Could not load planner — check your connection and refresh.");
      setLoading(false);
    }, 10000);
    try {
      const rowLimit = view === "month" ? 500 : 200;
      const [engRolesRes, jobsRes, schedRes, sitesRes, adhocRangeRes, adhocUnallocRes] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "engineer"),
        supabase.from("jobs").select("id, name, reference_number, status, priority, category, customer, customer_id, address, site_id, pressure_test_qty, visual_qty, other_qty, other_service_type, due_date, created_at, sites(name, address, postcode), customers(id, name)").in("status", ["active", "scheduled", "revisit", "in_progress", "awaiting_parts", "on_hold", "requires_revisit", "pending_review"]),
        supabase.from("job_schedule").select("*").gte("schedule_date", rangeStart).lte("schedule_date", rangeEnd).limit(rowLimit),
        supabase.from("sites").select("id, name, address, postcode").order("name"),
        supabase.from("planner_adhoc_entries").select("*").gte("schedule_date", rangeStart).lte("schedule_date", rangeEnd),
        supabase.from("planner_adhoc_entries").select("*").is("schedule_date", null),
      ]);
      if (timedOut) return;
      const engineerIds = (engRolesRes.data || []).map((r) => r.user_id);
      if (engineerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name, show_on_planner")
          .in("user_id", engineerIds);
        // Planner display filter — hidden staff remain fully assignable elsewhere.
        setEngineers((profilesData || []).filter((p: any) => p.show_on_planner !== false));
      } else {
        setEngineers([]);
      }
      const fetchedJobs = ((jobsRes.data as any[]) || []).map((j: any) => ({ ...j, site: j.sites || null }));

      // Enrich jobs with any existing engineer assignments so the pool card
      // can show "already assigned to X" — jobs assigned on the job page but
      // never dropped onto a date would otherwise be invisible here.
      const _jobIds = fetchedJobs.map((j: any) => j.id);
      if (_jobIds.length > 0) {
        const { data: assignRows } = await supabase
          .from("job_assignments")
          .select("job_id, engineer_id, profiles:engineer_id(full_name)")
          .in("job_id", _jobIds);
        const byJob = new Map<string, { id: string; name: string }>();
        for (const r of ((assignRows as any[]) || [])) {
          if (!byJob.has(r.job_id)) {
            byJob.set(r.job_id, {
              id: r.engineer_id,
              name: r.profiles?.full_name || "Engineer",
            });
          }
        }
        for (const j of fetchedJobs) {
          const a = byJob.get(j.id);
          if (a) {
            (j as any).preassigned_engineer_id = a.id;
            (j as any).preassigned_engineer_name = a.name;
          }
        }
      }
      setJobs(fetchedJobs);
      setSites(sitesRes.data || []);
      const fetchedSchedule = (schedRes.data as ScheduleEntry[]) || [];
      setSchedule(fetchedSchedule);
      setScheduleCapped(view === "month" && fetchedSchedule.length === 500);
      setAdhocEntries([...((adhocRangeRes.data as AdhocEntry[]) || []), ...((adhocUnallocRes.data as AdhocEntry[]) || [])]);

      // Clear loading once core planner data has resolved — secondary fetches below shouldn't block render
      clearTimeout(timeoutId);
      setLoading(false);

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
      } else {
        setJobParts([]);
        setJobVisitNotes({});
        setSubmissionComments([]);
      }
    } catch (err) {
      console.error("Planner fetchData error:", err);
      if (!timedOut) {
        setLoadError("Could not load planner — check your connection and refresh.");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, view]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime — listen to both schedule and job status changes
  useEffect(() => {
    const channel = supabase
      .channel(channelName.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_schedule" }, (payload) => {
        const row: any = (payload as any).new ?? (payload as any).old ?? {};
        const modifier: string | undefined = row.last_modified_by;
        const myId = user?.id;
        if (modifier && myId && modifier !== myId) {
          const localTs = row.id ? localEditsRef.current.get(row.id) : undefined;
          if (localTs && Date.now() - localTs < 3000) {
            toast({
              title: "⚠️ Another user just updated this booking",
              description: "The schedule has been refreshed.",
              variant: "destructive",
            });
          } else if (Date.now() - lastRemoteToastRef.current > 4000) {
            lastRemoteToastRef.current = Date.now();
            toast({ title: "🔄 Schedule updated by another user" });
          }
        }
        fetchData();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, (payload) => {
        // Live-update job status without full refetch
        setJobs((prev) => prev.map((j) => j.id === payload.new.id ? { ...j, status: (payload.new as any).status } : j));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, user?.id]);

  // Sorted engineers respecting saved order
  const sortedEngineers = useMemo(() => {
    if (engineerOrder.length === 0) return engineers;
    const ordered = engineerOrder
      .map((id) => engineers.find((e) => e.user_id === id))
      .filter(Boolean) as Engineer[];
    const remaining = engineers.filter((e) => !engineerOrder.includes(e.user_id));
    return [...ordered, ...remaining];
  }, [engineers, engineerOrder]);

  // Per-user planner view filter: engineer IDs to hide from the grid. Persists
  // in localStorage keyed by user so each planner keeps their own working set.
  const hiddenEngineersKey = user?.id ? `planner_hidden_engineers_${user.id}` : "";
  const [hiddenEngineers, setHiddenEngineers] = useState<Set<string>>(() => {
    if (typeof window === "undefined" || !hiddenEngineersKey) return new Set();
    try {
      const raw = localStorage.getItem(hiddenEngineersKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  // Re-hydrate when user resolves after initial mount.
  useEffect(() => {
    if (!hiddenEngineersKey) return;
    try {
      const raw = localStorage.getItem(hiddenEngineersKey);
      setHiddenEngineers(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch { /* noop */ }
  }, [hiddenEngineersKey]);
  const updateHiddenEngineers = useCallback((next: Set<string>) => {
    setHiddenEngineers(next);
    if (hiddenEngineersKey) {
      try { localStorage.setItem(hiddenEngineersKey, JSON.stringify([...next])); } catch { /* noop */ }
    }
  }, [hiddenEngineersKey]);

  const handleEngineerReorder = useCallback((newOrder: string[]) => {
    // Reorder callback only sees visible engineers. Preserve hidden ones
    // in their existing relative positions at the end so we don't lose them.
    const hiddenIds = engineers.map((e) => e.user_id).filter((id) => hiddenEngineers.has(id));
    const merged = [...newOrder, ...hiddenIds.filter((id) => !newOrder.includes(id))];
    setEngineerOrder(merged);
    localStorage.setItem("planner_engineer_order", JSON.stringify(merged));
    if (user) {
      supabase.from("profiles").update({ planner_engineer_order: merged }).eq("user_id", user.id).then(({ error }) => {
        if (error) console.error("Failed to save engineer order:", error);
      });
    }
  }, [user, engineers, hiddenEngineers]);

  const visibleEngineers = useMemo(() => {
    if (!isAdmin) {
      // Engineer view: only their own row. Generic preview shows a single "You" placeholder.
      if (genericEngineerPreview) {
        return [{ user_id: "__preview__", full_name: previewEngineerName || "You" }] as Engineer[];
      }
      if (!engineerScopeId) return [] as Engineer[];
      const me = sortedEngineers.find((e) => e.user_id === engineerScopeId);
      return me
        ? [me]
        : ([{ user_id: engineerScopeId, full_name: previewEngineerName || "You" }] as Engineer[]);
    }
    return sortedEngineers.filter((e) => !hiddenEngineers.has(e.user_id));
  }, [isAdmin, sortedEngineers, hiddenEngineers, engineerScopeId, genericEngineerPreview, previewEngineerName]);

  // Unallocated: active jobs with no schedule entry this period (admin only — engineers
  // never see other people's unallocated pool)
  const unallocatedJobs = useMemo(() => {
    if (!isAdmin) return [] as Job[];
    const scheduledJobIds = new Set(schedule.map((s) => s.job_id));
    return jobs.filter((j) => !scheduledJobIds.has(j.id));
  }, [jobs, schedule, isAdmin]);

  // Filter schedule for non-admin AND drop rows for hidden engineers.
  const filteredSchedule = useMemo(() => {
    if (!isAdmin) {
      if (!engineerScopeId) return [] as ScheduleEntry[]; // generic preview has no real schedule
      return schedule.filter((s) => s.engineer_id === engineerScopeId);
    }
    if (hiddenEngineers.size === 0) return schedule;
    return schedule.filter((s) => !hiddenEngineers.has(s.engineer_id));
  }, [schedule, isAdmin, engineerScopeId, hiddenEngineers]);

  // Filter adhoc entries for non-admin AND drop rows for hidden engineers.
  const filteredAdhoc = useMemo(() => {
    if (!isAdmin) {
      if (!engineerScopeId) return [] as AdhocEntry[];
      return adhocEntries.filter((a) => a.engineer_id === engineerScopeId);
    }
    if (hiddenEngineers.size === 0) return adhocEntries;
    return adhocEntries.filter((a) => !a.engineer_id || !hiddenEngineers.has(a.engineer_id));
  }, [adhocEntries, isAdmin, engineerScopeId, hiddenEngineers]);

  // For engineers, restrict the jobs prop to only jobs assigned to them
  // (either scheduled or preassigned via job_assignments). Belt-and-braces:
  // the child views only render entries from filteredSchedule, but scoping
  // `jobs` too prevents any leak through pool/map/list lookups.
  const scopedJobs = useMemo(() => {
    if (isAdmin) return jobs;
    if (!engineerScopeId) return [] as Job[];
    const scheduledIds = new Set(filteredSchedule.map((s) => s.job_id));
    return jobs.filter(
      (j) => scheduledIds.has(j.id) || (j as any).preassigned_engineer_id === engineerScopeId
    );
  }, [jobs, filteredSchedule, isAdmin, engineerScopeId]);




  // Add adhoc entry handler
  const handleAddAdhoc = async () => {
    if (!adhocEngineerId || !adhocCompany.trim()) return;
    setSaving(true);
    const numDays = Math.max(1, parseInt(adhocDays) || 1);
    const { error } = await supabase.from("planner_adhoc_entries").insert({
      engineer_id: adhocEngineerId,
      schedule_date: adhocDay || null,
      company_name: adhocCompany.trim(),
      description: adhocDesc.trim() || null,
      allocated_days: numDays,
      created_by: user?.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: "Failed to add labour entry.", variant: "destructive" });
    } else {
      toast({ title: "Labour entry added" });
      fetchData();
    }
    setAdhocOpen(false);
    setAdhocDay("");
    setAdhocCompany("");
    setAdhocDesc("");
    setAdhocDays("1");
    setSaving(false);
  };

  const handleRemoveAdhoc = async (id: string) => {
    await supabase.from("planner_adhoc_entries").delete().eq("id", id);
    fetchData();
  };

  const handleMoveAdhoc = async (id: string, engineerId: string | null, date: string | null) => {
    // engineer_id is NOT NULL — only update it when a real engineer is provided
    const update: Record<string, any> = { schedule_date: date };
    if (engineerId !== null) update.engineer_id = engineerId;
    await supabase.from("planner_adhoc_entries").update(update as any).eq("id", id);
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
    const { data: inserted, error } = await supabase.from("job_schedule").insert({
      job_id: jobId, engineer_id: engineerId, schedule_date: date, created_by: user?.id, ...editStamp(),
    } as any).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.code === "23505" ? "Already scheduled." : "Failed to assign.", variant: "destructive" });
    } else {
      const job = jobs.find((j) => j.id === jobId);
      if (job?.status === "scheduled") {
        await supabase.from("jobs").update({ status: "active" } as any).eq("id", jobId);
      }
      const newId = (inserted as any)?.id as string | undefined;
      if (newId) {
        showUndoToast(fmtMoveLabel(engineerId, date), async () => {
          markLocalEdit([newId]);
          await supabase.from("job_schedule").delete().eq("id", newId);
          fetchData();
        });
      } else {
        toast({ title: "Assigned" });
      }
      fetchData();
    }
  };

  const handleMultiDayAssign = async (jobId: string, engineerId: string, dates: string[]) => {
    const rows = dates.map((date) => ({
      job_id: jobId, engineer_id: engineerId, schedule_date: date, created_by: user?.id, ...editStamp(),
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
    const prev = schedule.find((s) => s.id === entryId);
    const prevEngineerId = prev?.engineer_id;
    const prevDate = prev?.schedule_date;
    markLocalEdit([entryId]);
    const { error } = await supabase.from("job_schedule").update({
      engineer_id: newEngineerId, schedule_date: newDate, ...editStamp(),
    } as any).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: "Failed to move.", variant: "destructive" });
    } else {
      if (prevEngineerId && prevDate && (prevEngineerId !== newEngineerId || prevDate !== newDate)) {
        showUndoToast(fmtMoveLabel(newEngineerId, newDate), async () => {
          markLocalEdit([entryId]);
          await supabase.from("job_schedule").update({
            engineer_id: prevEngineerId, schedule_date: prevDate, ...editStamp(),
          } as any).eq("id", entryId);
          fetchData();
        });
      }
      fetchData();
    }
  };

  const handleRemove = async (entryId: string) => {
    markLocalEdit([entryId]);
    const { error } = await supabase.from("job_schedule").delete().eq("id", entryId);
    if (!error) fetchData();
  };

  const handleBulkReassign = async (entryIds: string[], newEngineerId: string) => {
    markLocalEdit(entryIds);
    const { error } = await supabase.from("job_schedule").update({ engineer_id: newEngineerId, ...editStamp() } as any).in("id", entryIds);
    if (error) {
      toast({ title: "Error", description: "Failed to reassign.", variant: "destructive" });
    } else {
      toast({ title: "Reassigned", description: `${entryIds.length} entries moved.` });
      fetchData();
    }
  };

  const handleBulkDelete = async (entryIds: string[]) => {
    markLocalEdit(entryIds);
    const { error } = await supabase.from("job_schedule").delete().in("id", entryIds);
    if (!error) {
      toast({ title: "Removed", description: `${entryIds.length} entries removed.` });
      fetchData();
    }
  };

  const handleBulkAssign = async (jobIds: string[], engineerId: string, date: string) => {
    if (jobIds.length === 0) return;
    const rows = jobIds.map((jobId) => ({
      job_id: jobId, engineer_id: engineerId, schedule_date: date, created_by: user?.id, ...editStamp(),
    }));
    const { data: inserted, error } = await supabase
      .from("job_schedule")
      .upsert(rows as any[], { onConflict: "job_id,engineer_id,schedule_date", ignoreDuplicates: true })
      .select("id");
    if (error) {
      toast({ title: "Error", description: "Failed to bulk assign.", variant: "destructive" });
      return;
    }
    // Bump status of any 'scheduled' jobs
    await supabase.from("jobs").update({ status: "active" } as any).in("id", jobIds).eq("status", "scheduled");
    const insertedIds = (inserted || []).map((r: any) => r.id);
    toast({ title: "Bulk assigned", description: `${jobIds.length} jobs → ${format(new Date(date), "dd MMM")}.` });
    if (insertedIds.length > 0) {
      showUndoToast("Bulk assign", async () => {
        markLocalEdit(insertedIds);
        await supabase.from("job_schedule").delete().in("id", insertedIds);
        fetchData();
      });
    }
    fetchData();
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
      notes: addNotes.trim() || null, notes_color: addNotesColor, created_by: user?.id, ...editStamp(),
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
      job_id: jobId, engineer_id: batchEngineerId, schedule_date: batchDate, created_by: user?.id, ...editStamp(),
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
      let target = addDays(new Date(entry.schedule_date), offset);
      if (shuntSkipWeekends) {
        // Roll off weekends in the direction of travel (calendar days otherwise)
        const step = offset >= 0 ? 1 : -1;
        while (target.getDay() === 0 || target.getDay() === 6) {
          target = addDays(target, step);
        }
      }
      const newDate = format(target, "yyyy-MM-dd");
      markLocalEdit([entry.id]);
      await supabase.from("job_schedule").update({ schedule_date: newDate, ...editStamp() } as any).eq("id", entry.id);
    }

    toast({ title: "Shunt complete", description: `${entries.length} entries shifted ${days} day(s) ${shuntDirection}${shuntSkipWeekends ? " (weekends skipped)" : ""}.` });
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
      notes: e.notes, created_by: user?.id, ...editStamp(),
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
      ...editStamp(),
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
  const hasNoData = jobs.length === 0 && schedule.length === 0 && adhocEntries.length === 0;

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading planner...</div>;
  if (loadError) return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <p className="text-destructive font-medium">{loadError}</p>
      <Button variant="outline" size="sm" onClick={() => fetchData()}>Retry</Button>
    </div>
  );
  if (engineers.length === 0) return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <p>No engineers added yet.</p>
      <p className="text-sm">Add engineers in the Engineers section first.</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate("/engineers")}>Go to Engineers</Button>
    </div>
  );

  return (
    <div>
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
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => setAgentOpen(true)}
              >
                <Bot className="h-4 w-4" /> Auto-Agent
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
              <Button variant="outline" size="sm" onClick={() => { setShuntEngineerId(""); setShuntDays("1"); setShuntDirection("forward"); setShuntFromDate(format(new Date(), "yyyy-MM-dd")); setShuntSkipWeekends(false); setShuntOpen(true); }}>
                <Zap className="mr-1.5 h-4 w-4" /> Shunt
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyToNextWeek} disabled={copying || schedule.length === 0}>
                <Copy className="mr-1.5 h-4 w-4" /> {copying ? "Copying..." : "Copy Week"}
              </Button>
            </>
          )}
          {isAdmin && (
            <EngineerVisibilityFilter
              engineers={sortedEngineers}
              hidden={hiddenEngineers}
              onChange={updateHiddenEngineers}
            />
          )}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Printer className="mr-1.5 h-4 w-4" /> Print sheets
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
                <DropdownMenuItem
                  onClick={() => {
                    const visits = filteredSchedule.map((s) => ({
                      job_id: s.job_id,
                      engineer_id: s.engineer_id,
                      engineer_name: visibleEngineers.find((e) => e.user_id === s.engineer_id)?.full_name || "Unassigned",
                      schedule_date: s.schedule_date,
                    }));
                    if (visits.length === 0) {
                      toast({ title: "Nothing scheduled this week" });
                      return;
                    }
                    setBulkPrintSelection({
                      weekStart,
                      weekEnd: _endOfWeek(weekStart, { weekStartsOn: 1 }),
                      scopeLabel: `All engineers — w/c ${fmtDate(weekStart, "d MMM yyyy")}`,
                      visits,
                    });
                  }}
                >
                  <Users className="mr-2 h-4 w-4" /> Whole week (all engineers)
                </DropdownMenuItem>
                {visibleEngineers.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Per engineer</div>
                    {visibleEngineers.map((e) => {
                      const count = filteredSchedule.filter((s) => s.engineer_id === e.user_id).length;
                      return (
                        <DropdownMenuItem
                          key={e.user_id}
                          disabled={count === 0}
                          onClick={() => {
                            const visits = filteredSchedule
                              .filter((s) => s.engineer_id === e.user_id)
                              .map((s) => ({
                                job_id: s.job_id,
                                engineer_id: s.engineer_id,
                                engineer_name: e.full_name,
                                schedule_date: s.schedule_date,
                              }));
                            setBulkPrintSelection({
                              weekStart,
                              weekEnd: _endOfWeek(weekStart, { weekStartsOn: 1 }),
                              scopeLabel: `${e.full_name} — w/c ${fmtDate(weekStart, "d MMM yyyy")}`,
                              visits,
                            });
                          }}
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          <span className="flex-1">{e.full_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{count}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportWorksheetPdf(weekStart, filteredSchedule, scopedJobs as any, visibleEngineers, jobParts, submissionComments, optimisedJobOrder, jobVisitNotes)}>
                <FileText className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportWorksheetXlsx(weekStart, filteredSchedule, scopedJobs as any, visibleEngineers, jobParts, submissionComments, optimisedJobOrder, jobVisitNotes)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>

      {view === "month" && scheduleCapped && (
        <div className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
          Showing the first 500 bookings this month. Use week view for full detail.
        </div>
      )}

      {hasNoData && (
        <div className="mb-4 rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No jobs scheduled yet. Create a job and assign it to an engineer to see it here.
        </div>
      )}

      {/* View Tabs */}
      <Tabs value={view} onValueChange={(v) => setView(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="grid" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Weekly Grid</TabsTrigger>
          <TabsTrigger value="month" className="gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Monthly</TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5"><List className="h-3.5 w-3.5" /> List</TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5"><MapIcon className="h-3.5 w-3.5" /> Map</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="mt-4">
          {filteredSchedule.length === 0 && filteredAdhoc.length === 0 && (
            <div className="mb-3 rounded-md border border-dashed bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
              No jobs scheduled this week — drag a job here to get started.
            </div>
          )}
          <WeeklyGridView
            weekDays={weekDays}
            engineers={visibleEngineers}
            schedule={filteredSchedule}
            jobs={scopedJobs}
            unallocatedJobs={unallocatedJobs}
            adhocEntries={filteredAdhoc}
            isAdmin={isAdmin}
            onAssign={handleAssign}
            onMove={handleMove}
            onRemove={handleRemove}
            onRemoveAdhoc={handleRemoveAdhoc}
            onMoveAdhoc={handleMoveAdhoc}
            onMultiDaySchedule={(job) => setMultiDayJob(job)}
            onEngineerReorder={handleEngineerReorder}
            onBulkAssign={handleBulkAssign}
            onResizeSpan={async (jobId, engineerId, existingEntries, newDates) => {
              const existingDates = new Set(existingEntries.map((e) => e.schedule_date));
              const newDatesSet = new Set(newDates);

              // Only remove entries whose dates are no longer in the new span
              const toRemove = existingEntries.filter((e) => !newDatesSet.has(e.schedule_date));
              for (const entry of toRemove) {
                markLocalEdit([entry.id]);
                await supabase.from("job_schedule").delete().eq("id", entry.id);
              }

              // Insert new dates (upsert ignoring duplicates to be safe)
              const toAdd = newDates.filter((d) => !existingDates.has(d));
              if (toAdd.length > 0) {
                await supabase.from("job_schedule").upsert(
                  toAdd.map((date) => ({ job_id: jobId, engineer_id: engineerId, schedule_date: date, created_by: user?.id, ...editStamp() })) as any[],
                  { onConflict: "job_id,engineer_id,schedule_date", ignoreDuplicates: true }
                );
              }
              fetchData();
            }}
          />
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <MonthlyView
            currentDate={monthDate}
            schedule={filteredSchedule}
            jobs={scopedJobs}
            unallocatedJobs={isAdmin ? unallocatedJobs : []}
            engineers={visibleEngineers}
            isAdmin={isAdmin}
            optimisedJobOrder={optimisedJobOrder}
            onAssign={handleAssign}
            onRemove={handleRemove}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <ListView
            schedule={filteredSchedule}
            engineers={visibleEngineers}
            jobs={scopedJobs}
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
          <PlannerMapView schedule={filteredSchedule} jobs={scopedJobs} engineers={visibleEngineers} unallocatedJobs={unallocatedJobs} adhocEntries={filteredAdhoc} onRouteOptimised={setOptimisedJobOrder} onScheduleJob={(jobId) => {
            const j = jobs.find((x) => x.id === jobId);
            if (j) setMapScheduleJob({ id: j.id, name: j.name, reference_number: j.reference_number });
          }} />
        </TabsContent>
      </Tabs>

      {/* Always-visible map for admins (hidden when map tab is active to avoid duplication) */}
      {isAdmin && view !== "map" && (
        <div className="mt-4">
          <PlannerMapView schedule={filteredSchedule} jobs={scopedJobs} engineers={visibleEngineers} unallocatedJobs={unallocatedJobs} adhocEntries={filteredAdhoc} onRouteOptimised={setOptimisedJobOrder} onScheduleJob={(jobId) => {
            const j = jobs.find((x) => x.id === jobId);
            if (j) setMapScheduleJob({ id: j.id, name: j.name, reference_number: j.reference_number });
          }} />
        </div>
      )}

      <QuickScheduleDialog
        job={mapScheduleJob}
        open={!!mapScheduleJob}
        onOpenChange={(o) => { if (!o) setMapScheduleJob(null); }}
        onScheduled={() => { setMapScheduleJob(null); fetchData(); }}
      />

      {/* Labour (Adhoc) Entry Dialog */}
      <Dialog open={adhocOpen} onOpenChange={setAdhocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Labour Entry</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">For work done for other companies not in our job list.</p>
          <div className="space-y-4">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Number of Days</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={adhocDays}
                  onChange={(e) => setAdhocDays(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Start Date{" "}
                  <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input type="date" value={adhocDay} onChange={(e) => setAdhocDay(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">Leave date blank to place in Unallocated. Days may span non-consecutive dates.</p>
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
            <Button onClick={handleAddAdhoc} className="w-full" disabled={!adhocEngineerId || !adhocCompany.trim() || saving}>
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
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                checked={shuntSkipWeekends}
                onChange={(e) => setShuntSkipWeekends(e.target.checked)}
              />
              <span>
                <span className="font-medium">Skip weekends</span>
                <span className="block text-xs text-muted-foreground">Off: shift by calendar days (Sat/Sun included). On: roll weekend landings to the next weekday.</span>
              </span>
            </label>
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

      {/* Autonomous Agent Dialog */}
      <AutonomousAgentDialog
        open={agentOpen}
        onOpenChange={setAgentOpen}
        jobs={jobs.map((j) => ({
          id: j.id,
          name: j.name,
          reference_number: j.reference_number,
          status: j.status,
          priority: j.priority,
          due_date: (j as any).due_date ?? null,
          customer: (j as any).customer ?? null,
          postcode: (j as any).site?.postcode ?? extractPostcode((j as any).address ?? ""),
        }))}
        engineers={sortedEngineers.map((e) => ({
          user_id: e.user_id,
          full_name: e.full_name,
          job_count: schedule.filter((s) => s.engineer_id === e.user_id).length,
        }))}
        weekStart={weekStart}
        onRefresh={fetchData}
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
