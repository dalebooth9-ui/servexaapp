import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, X, Printer, Copy, ArrowLeft, Pencil } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  priority: string;
  category: string;
  customer: string | null;
  address: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-4 border-l-destructive",
  medium: "border-l-4 border-l-amber-500",
  low: "border-l-4 border-l-emerald-500",
};

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

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  // Add entry dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState<string>("");
  const [addEngineerId, setAddEngineerId] = useState("");
  const [addJobId, setAddJobId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const fetchData = async () => {
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");

    const [engRes, jobsRes, schedRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("jobs").select("id, name, reference_number, status, priority, category, customer, address").eq("status", "active"),
      supabase
        .from("job_schedule")
        .select("*")
        .gte("schedule_date", startStr)
        .lte("schedule_date", endStr),
    ]);

    setEngineers(engRes.data || []);
    setJobs((jobsRes.data as Job[]) || []);
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

  const getJobById = (jobId: string) => jobs.find((j) => j.id === jobId);
  const getEngineerById = (engId: string) => engineers.find((e) => e.user_id === engId);

  // Build flat rows sorted by date, then engineer
  const rows = useMemo(() => {
    let filtered = [...schedule];

    // Role filter: engineers only see their own
    if (!isAdmin) {
      filtered = filtered.filter((e) => e.engineer_id === user?.id);
    }

    // Priority/category filter
    if (filterPriority !== "all" || filterCategory !== "all") {
      filtered = filtered.filter((e) => {
        const job = getJobById(e.job_id);
        if (!job) return true;
        if (filterPriority !== "all" && job.priority !== filterPriority) return false;
        if (filterCategory !== "all" && job.category !== filterCategory) return false;
        return true;
      });
    }

    // Sort by date then engineer name
    filtered.sort((a, b) => {
      const dateCmp = a.schedule_date.localeCompare(b.schedule_date);
      if (dateCmp !== 0) return dateCmp;
      const engA = getEngineerById(a.engineer_id)?.full_name || "";
      const engB = getEngineerById(b.engineer_id)?.full_name || "";
      return engA.localeCompare(engB);
    });

    return filtered;
  }, [schedule, filterPriority, filterCategory, isAdmin, user, engineers, jobs]);

  // Group rows by date for display
  const groupedByDate = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of rows) {
      const existing = map.get(entry.schedule_date) || [];
      existing.push(entry);
      map.set(entry.schedule_date, existing);
    }
    return map;
  }, [rows]);

  const openAddDialog = (date?: string) => {
    setEditingEntryId(null);
    setAddDay(date || format(weekDays[0], "yyyy-MM-dd"));
    setAddEngineerId("");
    setAddJobId("");
    setAddNotes("");
    setAddOpen(true);
  };

  const openEditDialog = (entry: ScheduleEntry) => {
    setEditingEntryId(entry.id);
    setAddDay(entry.schedule_date);
    setAddEngineerId(entry.engineer_id);
    setAddJobId(entry.job_id);
    setAddNotes(entry.notes || "");
    setAddOpen(true);
  };

  const handleAddEntry = async () => {
    if (!addDay || !addEngineerId || !addJobId) return;
    setSaving(true);

    if (editingEntryId) {
      const { error } = await supabase.from("job_schedule").update({
        job_id: addJobId,
        engineer_id: addEngineerId,
        schedule_date: addDay,
        notes: addNotes || null,
      } as any).eq("id", editingEntryId);

      if (error) {
        toast({ title: "Error", description: "Failed to update entry.", variant: "destructive" });
      } else {
        toast({ title: "Updated", description: "Schedule entry updated." });
        setAddOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("job_schedule").insert({
        job_id: addJobId,
        engineer_id: addEngineerId,
        schedule_date: addDay,
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

  const handleCopyToNextWeek = async () => {
    if (schedule.length === 0) {
      toast({ title: "Nothing to copy", description: "This week has no schedule entries.", variant: "destructive" });
      return;
    }
    setCopying(true);

    const nextWeekEntries = schedule.map((e) => ({
      job_id: e.job_id,
      engineer_id: e.engineer_id,
      schedule_date: format(addDays(new Date(e.schedule_date), 7), "yyyy-MM-dd"),
      notes: e.notes,
      created_by: user?.id,
    }));

    const { error } = await supabase.from("job_schedule").upsert(nextWeekEntries as any[], {
      onConflict: "job_id,engineer_id,schedule_date",
      ignoreDuplicates: true,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to copy schedule.", variant: "destructive" });
    } else {
      toast({ title: "Week copied", description: `${nextWeekEntries.length} entries duplicated to next week.` });
    }
    setCopying(false);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`WEEK COMMENCING ${format(weekStart, "dd/MM/yyyy")}`, margin, y + 5);
    y += 14;

    // Column widths
    const cols = [
      { label: "DATE", w: 28 },
      { label: "ENGINEER", w: 35 },
      { label: "COMPANY", w: 40 },
      { label: "SITE", w: 55 },
      { label: "POSTCODE", w: 22 },
      { label: "JOB DESCRIPTION", w: 55 },
      { label: "COMMENT", w: 42 },
    ];
    const headerH = 8;

    // Header
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, y, pageW - margin * 2, headerH, "F");
    let cx = margin;
    cols.forEach((col) => {
      doc.text(col.label, cx + 2, y + 5.5);
      cx += col.w;
    });
    y += headerH;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    rows.forEach((entry) => {
      if (y + 8 > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      const job = getJobById(entry.job_id);
      const eng = getEngineerById(entry.engineer_id);
      const rowData = [
        format(parseISO(entry.schedule_date), "EEE dd/MM"),
        eng?.full_name || "",
        job?.customer || "",
        job?.address || "",
        extractPostcode(job?.address || null),
        job ? `${job.reference_number} - ${job.name}` : "",
        entry.notes || "",
      ];

      doc.setDrawColor(200, 200, 200);
      cx = margin;
      cols.forEach((col, i) => {
        doc.rect(cx, y, col.w, 8);
        doc.text(rowData[i], cx + 2, y + 5.5, { maxWidth: col.w - 4 });
        cx += col.w;
      });
      y += 8;
    });

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated ${format(new Date(), "PPP 'at' p")}`, margin, pageH - 5);

    doc.save(`planner-${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast({ title: "PDF exported", description: "Weekly planner saved as PDF." });
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading planner...</div>;
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Planner</h1>
          <p className="text-lg font-semibold text-muted-foreground mt-0.5">
            Week Commencing {format(weekStart, "dd/MM/yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <>
              <Button size="sm" onClick={() => openAddDialog()}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Entry
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyToNextWeek} disabled={copying || schedule.length === 0}>
                <Copy className="mr-1.5 h-4 w-4" />
                {copying ? "Copying..." : "Copy to Next Week"}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Printer className="mr-1.5 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Filter:</span>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-7 w-[130px] text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="installation">Installation</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
              <SelectItem value="survey">Survey</SelectItem>
            </SelectContent>
          </Select>
          {(filterPriority !== "all" || filterCategory !== "all") && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFilterPriority("all"); setFilterCategory("all"); }}>
              Clear
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-destructive" /> High</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-amber-500" /> Med</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-emerald-500" /> Low</span>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="min-w-[100px]">DATE</TableHead>
                <TableHead className="min-w-[120px]">ENGINEER</TableHead>
                <TableHead className="min-w-[120px]">COMPANY</TableHead>
                <TableHead className="min-w-[160px]">SITE</TableHead>
                <TableHead className="min-w-[90px]">POSTCODE</TableHead>
                <TableHead className="min-w-[200px]">JOB DESCRIPTION</TableHead>
                <TableHead className="min-w-[140px]">COMMENT</TableHead>
                {isAdmin && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-muted-foreground">
                    No entries this week.
                    {isAdmin && (
                      <Button variant="link" className="ml-2" onClick={() => openAddDialog()}>
                        Add one
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                Array.from(groupedByDate.entries()).map(([dateStr, entries]) => {
                  const date = parseISO(dateStr);
                  const isToday = isSameDay(date, new Date());

                  return entries.map((entry, idx) => {
                    const job = getJobById(entry.job_id);
                    const eng = getEngineerById(entry.engineer_id);

                    return (
                      <TableRow
                        key={entry.id}
                        className={cn(
                          isToday && "bg-primary/5",
                          job && PRIORITY_COLORS[job.priority]
                        )}
                      >
                        {/* Show date only on first row of each group */}
                        <TableCell className={cn("font-medium", idx > 0 && "border-t-0")}>
                          {idx === 0 ? (
                            <div>
                              <div className={cn("font-semibold", isToday && "text-primary")}>{format(date, "EEE")}</div>
                              <div className="text-xs text-muted-foreground">{format(date, "dd/MM/yyyy")}</div>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{eng?.full_name || "—"}</TableCell>
                        <TableCell className="text-sm">{job?.customer || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{job?.address || "—"}</TableCell>
                        <TableCell className="text-sm font-mono">{extractPostcode(job?.address || null) || "—"}</TableCell>
                        <TableCell>
                          {job ? (
                            <Link to={`/jobs/${job.id}`} className="hover:underline">
                              <span className="font-mono text-xs font-medium text-primary">{job.reference_number}</span>
                              <span className="ml-1.5 text-sm">{job.name}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground italic">Unknown job</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.notes || "—"}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(entry)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveEntry(entry.id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  });
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Schedule Entry Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntryId ? "Edit Schedule Entry" : "Add Schedule Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Select value={addDay} onValueChange={setAddDay}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a day..." />
                </SelectTrigger>
                <SelectContent>
                  {weekDays.map((d) => (
                    <SelectItem key={format(d, "yyyy-MM-dd")} value={format(d, "yyyy-MM-dd")}>
                      {format(d, "EEE, MMM d")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Engineer</Label>
              <Select value={addEngineerId} onValueChange={setAddEngineerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an engineer..." />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Comment (optional)</Label>
              <Textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Any notes for this entry..."
                rows={2}
              />
            </div>
            <Button onClick={handleAddEntry} className="w-full" disabled={!addJobId || !addEngineerId || !addDay || saving}>
              {saving ? "Saving..." : editingEntryId ? "Update Entry" : "Add to Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
