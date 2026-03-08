import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isPast, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
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

interface Job {
  id: string;
  name: string;
  reference_number: string;
  priority: string;
  status: string;
  customer: string | null;
  due_date?: string | null;
  created_at?: string;
  pressure_test_qty: number;
  visual_qty: number;
  other_qty: number;
  other_service_type: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
}

interface Engineer {
  user_id: string;
  full_name: string;
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-amber-500",
  low: "bg-accent",
};

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-l-destructive bg-destructive/5",
  medium: "border-l-amber-500 bg-amber-500/5",
  low: "border-l-accent bg-accent/5",
};

function extractPostcodeArea(job: Job): string {
  if (job.site?.postcode) {
    const match = job.site.postcode.match(/([A-Z]{1,2}\d)/i);
    return match ? match[1].toUpperCase() : job.site.postcode.toUpperCase();
  }
  if (!job.site?.address) return "No area";
  const match = job.site.address.match(/([A-Z]{1,2}\d)/i);
  return match ? match[1].toUpperCase() : "No area";
}

// ── Draggable unallocated job card ──────────────────────────────────────────
function DraggableJobCard({ job }: { job: Job }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unalloc-${job.id}`,
    data: { type: "unallocated", job },
  });

  const isOverdue = job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date());
  const isDueToday = job.due_date && isSameDay(parseISO(job.due_date), new Date());

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-md border-l-4 bg-card p-2 text-xs cursor-grab shadow-sm hover:shadow transition-shadow",
        isOverdue ? "border-l-destructive bg-destructive/10 ring-2 ring-destructive/50"
          : isDueToday ? "border-l-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40"
          : PRIORITY_BORDER[job.priority] || "border-l-muted",
        isDragging && "opacity-30"
      )}
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="font-mono font-medium text-primary">{job.reference_number}</span>
        {isOverdue ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground shrink-0">
            <AlertTriangle className="h-2.5 w-2.5" /> OVERDUE
          </span>
        ) : isDueToday ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shrink-0">
            DUE TODAY
          </span>
        ) : job.due_date ? (
          <span className="inline-flex items-center rounded bg-muted border border-border px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground shrink-0">
            {format(new Date(job.due_date), "dd/MM/yy")}
          </span>
        ) : null}
      </div>
      <div className="truncate text-foreground">{job.name}</div>
      {job.customer && <div className="text-muted-foreground truncate">{job.customer}</div>}
      {(job.site?.name || job.site?.postcode) && (
        <div className="text-muted-foreground truncate text-[10px]">
          {job.site!.name}{job.site!.postcode ? ` · ${job.site!.postcode}` : ""}
        </div>
      )}
    </div>
  );
}

// ── Draggable scheduled entry chip ─────────────────────────────────────────
function DraggableEntryChip({
  entry,
  job,
  isAdmin,
  onRemove,
}: {
  entry: ScheduleEntry;
  job: Job | undefined;
  isAdmin: boolean;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sched-${entry.id}`,
    data: { type: "scheduled", entry, job },
    disabled: !isAdmin,
  });

  if (!job) return null;

  const isOverdue = job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date()) && job.status !== "completed";
  const dueToday = job.due_date && isSameDay(parseISO(job.due_date), new Date());

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex items-center gap-1 rounded px-1 py-0.5 text-[10px] cursor-grab",
        isOverdue ? "bg-destructive/10 text-destructive" : dueToday ? "bg-amber-500/10 text-amber-700" : "bg-muted/60 text-foreground",
        isDragging && "opacity-30",
        isAdmin && "cursor-grab"
      )}
      {...(isAdmin ? { ...attributes, ...listeners } : {})}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[job.priority] || "bg-muted-foreground")} />
      <Link
        to={`/jobs/${job.id}`}
        className="font-mono font-semibold text-primary hover:underline shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {job.reference_number}
      </Link>
      <span className="truncate flex-1 min-w-0">{job.name}</span>
      {job.due_date && (() => {
        return isOverdue ? (
          <span className="inline-flex items-center rounded bg-destructive px-1 py-0.5 text-[8px] font-bold text-destructive-foreground shrink-0 ml-auto">OD</span>
        ) : dueToday ? (
          <span className="inline-flex items-center rounded bg-amber-500 px-1 py-0.5 text-[8px] font-bold text-white shrink-0 ml-auto">TODAY</span>
        ) : (
          <span className="inline-flex items-center rounded bg-muted border border-border px-1 py-0.5 text-[8px] font-mono text-muted-foreground shrink-0 ml-auto">
            {format(parseISO(job.due_date), "dd/MM")}
          </span>
        );
      })()}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

// ── Droppable day cell ──────────────────────────────────────────────────────
function DroppableDayCell({
  dateStr,
  isToday,
  isCurrentMonth,
  isOver,
  children,
  dayNum,
}: {
  dateStr: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  isOver: boolean;
  children: React.ReactNode;
  dayNum: number;
}) {
  const { setNodeRef } = useDroppable({ id: `month-cell-${dateStr}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[100px] rounded-md border p-1.5 text-xs transition-colors",
        !isCurrentMonth && "opacity-40",
        isToday ? "bg-primary/5 border-primary/30" : "bg-card",
        isOver && "bg-primary/10 border-primary ring-1 ring-primary/30"
      )}
    >
      <div className={cn("mb-1 font-semibold", isToday && "text-primary")}>
        {dayNum}
      </div>
      {children}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function MonthlyView({
  currentDate,
  schedule,
  jobs,
  unallocatedJobs = [],
  engineers = [],
  isAdmin = false,
  optimisedJobOrder = [],
  onAssign,
  onRemove,
}: {
  currentDate: Date;
  schedule: ScheduleEntry[];
  jobs: Job[];
  unallocatedJobs?: Job[];
  engineers?: Engineer[];
  isAdmin?: boolean;
  optimisedJobOrder?: string[];
  onAssign?: (jobId: string, engineerId: string, date: string) => Promise<void>;
  onRemove?: (entryId: string) => Promise<void>;
}) {
  const [activeItem, setActiveItem] = useState<any>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Assign dialog state (needed when multiple engineers — pick one)
  const [pendingDrop, setPendingDrop] = useState<{ jobId: string; date: string } | null>(null);
  const [pickEngineer, setPickEngineer] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getJob = (id: string) => jobs.find((j) => j.id === id);

  const scheduleByDate = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {};
    for (const s of schedule) {
      if (!map[s.schedule_date]) map[s.schedule_date] = [];
      map[s.schedule_date].push(s);
    }
    return map;
  }, [schedule]);

  // Group unallocated by postcode area, overdue first
  const groupedUnallocated = useMemo(() => {
    const now = startOfDay(new Date());
    const overdue: Job[] = [];
    const rest: Job[] = [];
    for (const job of unallocatedJobs) {
      if (job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date())) {
        overdue.push(job);
      } else {
        rest.push(job);
      }
    }
    overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    rest.sort((a, b) => {
      const aDate = new Date(a.due_date || a.created_at || 0).getTime();
      const bDate = new Date(b.due_date || b.created_at || 0).getTime();
      return aDate - bDate;
    });
    const groups: Record<string, Job[]> = {};
    for (const job of rest) {
      const area = extractPostcodeArea(job);
      if (!groups[area]) groups[area] = [];
      groups[area].push(job);
    }
    const areaGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return overdue.length > 0
      ? [["⚠ Overdue", overdue] as [string, Job[]], ...areaGroups]
      : areaGroups;
  }, [unallocatedJobs]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItem(event.active.data.current);
  };

  const handleDragOver = (event: any) => {
    setOverId(event.over?.id || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveItem(null);
    setOverId(null);
    const { active, over } = event;
    if (!over || !isAdmin) return;

    const targetId = over.id as string;
    if (!targetId.startsWith("month-cell-")) return;

    const date = targetId.replace("month-cell-", "");
    const activeData = active.data.current;

    if (activeData?.type === "unallocated") {
      const jobId = activeData.job.id;
      // If only one engineer, assign directly; else show picker
      if (engineers.length === 1) {
        await onAssign?.(jobId, engineers[0].user_id, date);
      } else {
        setPendingDrop({ jobId, date });
        setPickEngineer(engineers[0]?.user_id || "");
      }
    } else if (activeData?.type === "scheduled") {
      // Move to new date, keep same engineer
      const entry: ScheduleEntry = activeData.entry;
      if (entry.schedule_date !== date) {
        // We reuse onAssign by removing old + inserting new via parent handler
        // But we don't have onMove here — use remove + assign
        await onRemove?.(entry.id);
        await onAssign?.(entry.job_id, entry.engineer_id, date);
      }
    }
  };

  const confirmEngineerPick = async () => {
    if (!pendingDrop || !pickEngineer) return;
    await onAssign?.(pendingDrop.jobId, pickEngineer, pendingDrop.date);
    setPendingDrop(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4">
        {/* Unallocated sidebar */}
        {isAdmin && (
          <div className="w-[200px] shrink-0">
            <div className="rounded-lg border bg-muted/30 p-3">
              <h3 className="mb-2 text-sm font-semibold">Unallocated Jobs</h3>
              <ScrollArea className="h-[calc(100vh-320px)]">
                {groupedUnallocated.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">All jobs allocated</p>
                ) : (
                  <div className="space-y-3 pr-2">
                    {groupedUnallocated.map(([area, areaJobs]) => {
                      const isOverdueGroup = area === "⚠ Overdue";
                      return (
                        <div key={area}>
                          <div className="mb-1 flex items-center gap-1.5">
                            {isOverdueGroup ? (
                              <Badge variant="destructive" className="text-[10px] font-semibold flex items-center gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-mono">{area}</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">{(areaJobs as Job[]).length}</span>
                          </div>
                          <div className="space-y-1">
                            {(areaJobs as Job[]).map((job) => (
                              <DraggableJobCard key={job.id} job={job} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <ScrollBar orientation="vertical" />
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Calendar grid */}
        <div className="flex-1">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const entries = scheduleByDate[dateStr] || [];
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());
              const isOver = overId === `month-cell-${dateStr}`;

              return (
                <DroppableDayCell
                  key={dateStr}
                  dateStr={dateStr}
                  isToday={isToday}
                  isCurrentMonth={isCurrentMonth}
                  isOver={isOver}
                  dayNum={parseInt(format(day, "d"))}
                >
                  {entries.length > 0 && (
                    <div className="space-y-0.5">
                      {entries.slice(0, 4).map((entry) => {
                        const job = getJob(entry.job_id);
                        const isOverdue = job?.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date()) && job.status !== "completed";
                        const dueToday = job?.due_date && isSameDay(parseISO(job.due_date), new Date());
                        return (
                          <Tooltip key={entry.id}>
                            <TooltipTrigger asChild>
                              <div>
                                <DraggableEntryChip
                                  entry={entry}
                                  job={job}
                                  isAdmin={isAdmin}
                                  onRemove={(id) => onRemove?.(id)}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-semibold">{job?.reference_number} — {job?.name}</p>
                              {job?.customer && <p className="text-muted-foreground">{job.customer}</p>}
                              {(job?.pressure_test_qty > 0 || job?.visual_qty > 0 || (job?.other_qty > 0 && job?.other_service_type)) && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {job.pressure_test_qty > 0 && <span className="inline-flex items-center rounded bg-primary/10 border border-primary/20 text-primary px-1 py-0.5 text-[9px] font-semibold">PT×{job.pressure_test_qty}</span>}
                                  {job.visual_qty > 0 && <span className="inline-flex items-center rounded bg-secondary border border-border text-secondary-foreground px-1 py-0.5 text-[9px] font-semibold">Vis×{job.visual_qty}</span>}
                                  {job.other_qty > 0 && job.other_service_type && <span className="inline-flex items-center rounded bg-accent border border-border text-accent-foreground px-1 py-0.5 text-[9px] font-semibold">{job.other_service_type}×{job.other_qty}</span>}
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {entries.length > 4 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          +{entries.length - 4} more
                        </Badge>
                      )}
                    </div>
                  )}
                </DroppableDayCell>
              );
            })}
          </div>
        </div>
      </div>

      {/* Engineer picker dialog (multi-engineer) */}
      {pendingDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg border shadow-lg p-6 w-80 space-y-4">
            <h3 className="font-semibold text-sm">Assign to engineer</h3>
            <p className="text-xs text-muted-foreground">Scheduling on <strong>{pendingDrop.date}</strong></p>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={pickEngineer}
              onChange={(e) => setPickEngineer(e.target.value)}
            >
              {engineers.map((e) => (
                <option key={e.user_id} value={e.user_id}>{e.full_name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors"
                onClick={() => setPendingDrop(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={confirmEngineerPick}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      <DragOverlay>
        {activeItem?.type === "unallocated" && (
          <div className="rounded-md border-l-4 border-l-primary bg-card p-2 text-xs shadow-lg w-48 opacity-90">
            <div className="font-mono font-medium text-primary">{activeItem.job.reference_number}</div>
            <div className="truncate">{activeItem.job.name}</div>
          </div>
        )}
        {activeItem?.type === "scheduled" && (
          <div className="rounded bg-muted/80 px-1 py-0.5 text-[10px] shadow-lg opacity-90">
            {activeItem.job?.reference_number} {activeItem.job?.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
