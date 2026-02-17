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
import { ChevronLeft, ChevronRight, Plus, X, GripVertical, Printer, Copy } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import jsPDF from "jspdf";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

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
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-4 border-l-destructive",
  medium: "border-l-4 border-l-amber-500",
  low: "border-l-4 border-l-emerald-500",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-muted/50",
  installation: "bg-blue-500/10",
  maintenance: "bg-orange-500/10",
  inspection: "bg-purple-500/10",
  survey: "bg-teal-500/10",
};

const JOB_CATEGORIES = ["general", "installation", "maintenance", "inspection", "survey"];

// Draggable schedule card
function DraggableScheduleCard({
  entry,
  job,
  isAdmin,
  onRemove,
}: {
  entry: ScheduleEntry;
  job: Job | undefined;
  isAdmin: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
    data: { entry },
    disabled: !isAdmin,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative rounded-md border bg-card p-2 text-xs shadow-sm transition-opacity",
        isDragging && "opacity-30",
        isAdmin && "cursor-grab",
        job && PRIORITY_COLORS[job.priority],
        job && CATEGORY_COLORS[job.category]
      )}
    >
      {isAdmin && (
        <button
          {...listeners}
          {...attributes}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 touch-none text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}
      <div className={isAdmin ? "pl-3" : ""}>
        {job ? (
          <Link
            to={`/jobs/${job.id}`}
            className="block"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-center gap-1">
              <span className="font-mono font-medium text-primary hover:underline">
                {job.reference_number}
              </span>
              {job.priority === "high" && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" title="High priority" />
              )}
            </div>
            <div className="truncate text-muted-foreground">{job.name}</div>
            {job.category !== "general" && (
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">{job.category}</div>
            )}
          </Link>
        ) : (
          <div className="text-muted-foreground italic">Unknown job</div>
        )}
        {entry.notes && (
          <div className="mt-1 text-muted-foreground italic">{entry.notes}</div>
        )}
      </div>
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:block"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// Droppable cell
function DroppableCell({
  engineerId,
  day,
  isToday,
  isAdmin,
  isOver,
  children,
  onClickEmpty,
}: {
  engineerId: string;
  day: Date;
  isToday: boolean;
  isAdmin: boolean;
  isOver: boolean;
  children: React.ReactNode;
  onClickEmpty: () => void;
}) {
  const cellId = `${engineerId}__${format(day, "yyyy-MM-dd")}`;
  const { setNodeRef } = useDroppable({
    id: cellId,
    data: { engineerId, day: format(day, "yyyy-MM-dd") },
  });

  return (
    <td
      ref={setNodeRef}
      className={cn(
        "px-2 py-2 align-top min-h-[80px] transition-colors",
        isToday && "bg-primary/5",
        isAdmin && "cursor-pointer",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/30"
      )}
      onClick={onClickEmpty}
    >
      {children}
    </td>
  );
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
  const [copying, setCopying] = useState(false);
  const [activeEntry, setActiveEntry] = useState<ScheduleEntry | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Add entry dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState<Date | null>(null);
  const [addEngineerId, setAddEngineerId] = useState("");
  const [addJobId, setAddJobId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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
      supabase.from("jobs").select("id, name, reference_number, status, priority, category").eq("status", "active"),
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

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveEntry(event.active.data.current?.entry || null);
  };

  const handleDragOver = (event: any) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const dragged = activeEntry;
    setActiveEntry(null);
    setOverId(null);

    if (!dragged || !event.over) return;

    const target = event.over.data.current as { engineerId: string; day: string } | undefined;
    if (!target) return;

    const { engineerId: newEngineerId, day: newDate } = target;

    // No change
    if (dragged.engineer_id === newEngineerId && dragged.schedule_date === newDate) return;

    // Optimistic update
    setSchedule((prev) =>
      prev.map((e) =>
        e.id === dragged.id
          ? { ...e, engineer_id: newEngineerId, schedule_date: newDate }
          : e
      )
    );

    const { error } = await supabase
      .from("job_schedule")
      .update({ engineer_id: newEngineerId, schedule_date: newDate } as any)
      .eq("id", dragged.id);

    if (error) {
      const msg = error.code === "23505"
        ? "This job is already scheduled for that engineer on that day."
        : "Failed to move entry.";
      toast({ title: "Error", description: msg, variant: "destructive" });
      // Revert
      setSchedule((prev) =>
        prev.map((e) =>
          e.id === dragged.id
            ? { ...e, engineer_id: dragged.engineer_id, schedule_date: dragged.schedule_date }
            : e
        )
      );
    } else {
      toast({ title: "Moved", description: "Schedule entry updated." });
    }
  };

  // For engineer role, filter to only show their row
  const visibleEngineers = isAdmin
    ? engineers
    : engineers.filter((e) => e.user_id === user?.id);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading planner...</div>;
  }

  const draggedJob = activeEntry ? getJobById(activeEntry.job_id) : null;

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 10;
    const colW = (pageW - margin * 2 - 40) / 7; // 40mm for engineer name col
    const headerH = 12;
    let y = margin;

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Weekly Planner — ${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`, margin, y + 5);
    y += 12;

    // Header row
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - margin * 2, headerH, "F");
    doc.text("Engineer", margin + 2, y + 7);
    weekDays.forEach((day, i) => {
      const x = margin + 40 + i * colW;
      doc.text(format(day, "EEE"), x + colW / 2, y + 4, { align: "center" });
      doc.text(format(day, "MMM d"), x + colW / 2, y + 9, { align: "center" });
    });
    y += headerH;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    visibleEngineers.forEach((eng) => {
      // Calculate row height based on max entries in any cell
      const maxEntries = Math.max(1, ...weekDays.map((day) => getEntriesForCell(eng.user_id, day).length));
      const rowH = Math.max(12, maxEntries * 10 + 4);

      // Check page break
      if (y + rowH > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }

      // Row border
      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, y, pageW - margin * 2, rowH);

      // Engineer name
      doc.setFont("helvetica", "bold");
      doc.text(eng.full_name || "", margin + 2, y + 6, { maxWidth: 36 });
      doc.setFont("helvetica", "normal");

      // Cell borders and entries
      weekDays.forEach((day, i) => {
        const x = margin + 40 + i * colW;
        doc.line(x, y, x, y + rowH);

        const entries = getEntriesForCell(eng.user_id, day);
        entries.forEach((entry, ei) => {
          const job = getJobById(entry.job_id);
          const cellY = y + 5 + ei * 10;
          if (job) {
            doc.setFont("helvetica", "bold");
            doc.text(job.reference_number, x + 2, cellY, { maxWidth: colW - 4 });
            doc.setFont("helvetica", "normal");
            doc.text(job.name, x + 2, cellY + 4, { maxWidth: colW - 4 });
          }
          if (entry.notes) {
            doc.setTextColor(120, 120, 120);
            doc.text(entry.notes, x + 2, cellY + 7, { maxWidth: colW - 4 });
            doc.setTextColor(0, 0, 0);
          }
        });
      });

      y += rowH;
    });

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated ${format(new Date(), "PPP 'at' p")}`, margin, doc.internal.pageSize.getHeight() - 5);

    doc.save(`planner-${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast({ title: "PDF exported", description: "Weekly planner saved as PDF." });
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

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Weekly Planner</h1>
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
          <span className="text-sm font-medium text-muted-foreground">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleCopyToNextWeek} disabled={copying || schedule.length === 0}>
              <Copy className="mr-1.5 h-4 w-4" />
              {copying ? "Copying..." : "Copy to Next Week"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Printer className="mr-1.5 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Legend:</span>
        <div className="flex items-center gap-4">
          <span className="font-medium">Priority</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-destructive" /> High</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-amber-500" /> Medium</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-full bg-emerald-500" /> Low</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-medium">Category</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-muted" /> General</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-blue-500/20" /> Installation</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-orange-500/20" /> Maintenance</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-purple-500/20" /> Inspection</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-teal-500/20" /> Survey</span>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
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
                        const cellId = `${eng.user_id}__${format(day, "yyyy-MM-dd")}`;
                        const isCellOver = overId === cellId;

                        return (
                          <DroppableCell
                            key={day.toISOString()}
                            engineerId={eng.user_id}
                            day={day}
                            isToday={isToday}
                            isAdmin={isAdmin}
                            isOver={isCellOver}
                            onClickEmpty={() => entries.length === 0 && openAddDialog(eng.user_id, day)}
                          >
                            <div className="space-y-1.5">
                              {entries.map((entry) => (
                                <DraggableScheduleCard
                                  key={entry.id}
                                  entry={entry}
                                  job={getJobById(entry.job_id)}
                                  isAdmin={isAdmin}
                                  onRemove={() => handleRemoveEntry(entry.id)}
                                />
                              ))}
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
                          </DroppableCell>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <DragOverlay>
              {activeEntry && draggedJob ? (
                <div className="rounded-md border bg-card p-2 text-xs shadow-lg">
                  <div className="font-mono font-medium text-primary">{draggedJob.reference_number}</div>
                  <div className="truncate text-muted-foreground">{draggedJob.name}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
