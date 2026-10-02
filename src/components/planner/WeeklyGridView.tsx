import { useMemo, useState, useEffect, useRef } from "react";
import { format, isSameDay, isPast, parseISO, startOfDay, isWithinInterval, endOfDay, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { X, GripVertical, AlertTriangle, CalendarDays, Palmtree, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { JobCardSubtitle } from "@/lib/jobCardLabel";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AdhocEntryCard from "./AdhocEntryCard";
import DayPanel from "./DayPanel";
import BulkAssignBar from "./BulkAssignBar";
import { Checkbox } from "@/components/ui/checkbox";
import type { AdhocEntry } from "@/pages/WeeklyPlanner";

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
  notes: string | null;
  notes_color: string | null;
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
  site_id: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
  pressure_test_qty: number;
  visual_qty: number;
  other_qty: number;
  other_service_type: string | null;
  created_at?: string;
  due_date?: string | null;
}

const PRIORITY_BG: Record<string, string> = {
  high: "border-l-destructive bg-destructive/5",
  medium: "border-l-amber-500 bg-amber-500/5",
  low: "border-l-accent bg-accent/5",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-primary", in_progress: "bg-primary", completed: "bg-green-500",
  archived: "bg-muted-foreground", revisit: "bg-amber-500",
};

function extractPostcodeArea(job: Job): string {
  if (job.site?.postcode) {
    const match = job.site.postcode.match(/([A-Z]{1,2}\d)/i);
    return match ? match[1].toUpperCase() : job.site.postcode.toUpperCase();
  }
  if (!job.address) return "No area";
  const match = job.address.match(/([A-Z]{1,2}\d)/i);
  return match ? match[1].toUpperCase() : "No area";
}

// Draggable job card for the unallocated sidebar
function DraggableUnallocatedJob({
  job,
  onMultiDay,
  selectable,
  selected,
  onToggleSelect,
}: {
  job: Job;
  onMultiDay: (job: Job) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (jobId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unalloc-${job.id}`,
    data: { type: "unallocated", job },
    disabled: selectable, // no drag while in bulk-select mode
  });

  const isOverdue = job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date());
  const isDueToday = job.due_date && isSameDay(parseISO(job.due_date), new Date());

  return (
    <div
      className={cn(
        "group relative rounded-md border-l-4 bg-card p-2 text-xs shadow-sm hover:shadow transition-shadow select-none",
        isOverdue ? "border-l-destructive bg-destructive/10 ring-2 ring-destructive/50" : isDueToday ? "border-l-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40" : PRIORITY_BG[job.priority] || "border-l-muted",
        isDragging && "opacity-30",
        selectable && "cursor-pointer",
        selectable && selected && "ring-2 ring-primary"
      )}
      style={{ WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}
      onClick={selectable ? () => onToggleSelect?.(job.id) : undefined}
    >
      {selectable && (
        <div
          className="absolute top-0 left-0 z-20 flex items-center justify-center h-10 w-10 cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(job.id); }}
        >
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect?.(job.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-5"
          />
        </div>
      )}
      {!selectable && (
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab absolute inset-0 z-[2] rounded-md"
          style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
        />
      )}

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onMultiDay(job); }}
        className="absolute top-1.5 right-1.5 z-10 rounded p-0.5 bg-card/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all"
        title="Schedule multiple days"
      >
        <CalendarDays className="h-3 w-3" />
      </button>
      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-1 mb-0.5 pr-5">
          <div className="text-foreground break-words line-clamp-2 flex-1 min-w-0 pr-1">{job.name}</div>
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
        <JobCardSubtitle job={job} className="text-muted-foreground truncate text-[10px]" />
        {((job as any).customers?.name || job.customer) && <div className="text-muted-foreground break-words line-clamp-2 text-[10px]">{(job as any).customers?.name || job.customer}</div>}
        <div className="flex flex-wrap gap-1 mt-0.5">
          {(job as any).preassigned_engineer_name && (
            <span
              className="inline-flex items-center rounded bg-primary/15 border border-primary/30 text-primary px-1 py-0.5 text-[9px] font-semibold"
              title="Already assigned to this engineer — drag onto a date to schedule"
            >
              👤 {(job as any).preassigned_engineer_name}
            </span>
          )}
          {job.category === "installation" && (
            <span className="inline-flex items-center rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 px-1 py-0.5 text-[9px] font-bold">DRI</span>
          )}
          {job.pressure_test_qty > 0 && (
            <span className="inline-flex items-center rounded bg-primary/10 border border-primary/20 text-primary px-1 py-0.5 text-[9px] font-semibold">PT×{job.pressure_test_qty}</span>
          )}
          {job.visual_qty > 0 && (
            <span className="inline-flex items-center rounded bg-secondary border border-border text-secondary-foreground px-1 py-0.5 text-[9px] font-semibold">Vis×{job.visual_qty}</span>
          )}
          {job.other_qty > 0 && job.other_service_type && (
            <span className="inline-flex items-center rounded bg-accent border border-border text-accent-foreground px-1 py-0.5 text-[9px] font-semibold">{job.other_service_type}×{job.other_qty}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// One compact, draggable visit for exactly one engineer/day cell.
function DraggableScheduleCard({ entry, job, engineerName, dayIndex, dayCount, isAdmin, onRemove, onAdjustSpan }: {
  entry: ScheduleEntry;
  job: Job | undefined;
  engineerName: string;
  dayIndex: number;
  dayCount: number;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  onAdjustSpan?: (delta: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sched-${entry.id}`,
    data: { type: "scheduled", entry, job },
    disabled: !isAdmin,
  });
  if (!job) return null;
  return (
    <HoverCard openDelay={200} closeDelay={250}>
      <HoverCardTrigger asChild>
        <div
          ref={setNodeRef}
          {...(isAdmin ? attributes : {})}
          {...(isAdmin ? listeners : {})}
          className={cn(
            "relative min-w-0 h-10 rounded-sm border border-border border-l-4 bg-card px-1.5 py-0.5 text-[11px] select-none",
            PRIORITY_BG[job.priority] || "border-l-muted",
            isDragging && "opacity-30",
            isAdmin && "cursor-grab active:cursor-grabbing"
          )}
        >
          <div className="flex items-center gap-1 min-w-0">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[job.status] || "bg-muted-foreground/50")} aria-label={job.status.replace(/_/g, " ")} />
            <span className="truncate min-w-0 flex-1 font-medium" title={job.name}>{job.name}</span>
            {dayCount > 1 && <span className="shrink-0 text-[9px] text-muted-foreground">Day {dayIndex}/{dayCount}</span>}
          </div>
          <div className="pl-2.5 truncate font-mono text-[10px] text-muted-foreground">{job.reference_number}</div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 space-y-1 text-xs" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-semibold break-words">{job.name}</div>
        <div><span className="text-muted-foreground">Client:</span> {job.customer || "—"}</div>
        <div><span className="text-muted-foreground">Site:</span> {job.site?.name ? `${job.site.name} · ` : ""}{job.site?.address || job.address || "—"}</div>
        <div><span className="text-muted-foreground">Ref:</span> {job.reference_number}</div>
        <div><span className="text-muted-foreground">Status:</span> {job.status.replace(/_/g, " ")} · <span className="text-muted-foreground">Priority:</span> {job.priority}</div>
        <div><span className="text-muted-foreground">Engineer:</span> {engineerName}</div>
        <div><span className="text-muted-foreground">Dates:</span> {dayCount > 1 ? `Day ${dayIndex} of ${dayCount} · ` : ""}{format(parseISO(entry.schedule_date), "dd/MM/yyyy")}{job.due_date ? ` · Due ${format(parseISO(job.due_date), "dd/MM/yyyy")}` : ""}</div>
        {entry.notes && <div className="break-words">{entry.notes}</div>}
        {isAdmin && <div className="flex justify-end gap-1 pt-1 border-t border-border">
          {onAdjustSpan && <Button size="sm" variant="ghost" onClick={() => onAdjustSpan(1)} title="Add one day">+1 day</Button>}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Remove visit" title="Remove visit" onClick={() => onRemove(entry.id)}><X className="h-4 w-4" /></Button>
        </div>}
      </HoverCardContent>
    </HoverCard>
  );
}

// Draggable adhoc (labour) entry card for scheduled cells
function DraggableAdhocCard({
  entry,
  isAdmin,
  onRemove,
}: {
  entry: AdhocEntry;
  isAdmin: boolean;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `adhoc-${entry.id}`,
    data: { type: "adhoc", entry },
    disabled: !isAdmin,
  });

  return (
    <div ref={setNodeRef} className={cn("select-none", isDragging && "opacity-30")} style={{ WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}>
      <div className={cn("select-none", isAdmin && "cursor-grab")} {...attributes} {...listeners} style={{ WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}>
        <AdhocEntryCard entry={entry} isAdmin={isAdmin} onRemove={onRemove} />
      </div>
    </div>
  );
}

// Droppable unallocated sidebar
function DroppableUnallocatedZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unallocated-zone" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-muted/30 p-3 transition-colors",
        isOver && "bg-destructive/10 border-destructive/40 ring-1 ring-destructive/30"
      )}
    >
      {children}
    </div>
  );
}

// Droppable cell in the grid
function DroppableCell({
  id,
  children,
  isToday,
  isOver,
  isLeave,
  colIdx,
}: {
  id: string;
  children: React.ReactNode;
  isToday: boolean;
  isOver: boolean;
  isLeave?: boolean;
  colIdx?: number;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      data-day-col={colIdx}
      className={cn(
        "h-32 min-w-0 overflow-hidden rounded-md border p-1 space-y-0.5 transition-colors",
        isToday && "bg-primary/5 border-primary/20",
        isOver && "bg-primary/10 border-primary ring-1 ring-primary/30",
        isLeave && !isOver && "bg-blue-500/5 border-blue-500/20",
        !isToday && !isOver && !isLeave && "bg-card"
      )}
    >
      {children}
    </div>
  );
}

// Global resize lock — prevents DnD from activating while a resize is in progress
let globalResizeActive = false;

// Custom PointerSensor that respects the resize lock
class ResizeAwarePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
        if (globalResizeActive) return false;
        // Also check if the pointer target or its ancestors have data-resize-handle
        let el = nativeEvent.target as HTMLElement | null;
        while (el) {
          if (el.dataset?.resizeHandle === "true") return false;
          el = el.parentElement;
        }
        return true;
      },
    },
  ];
}

export default function WeeklyGridView({
  weekDays,
  engineers,
  schedule,
  jobs,
  unallocatedJobs,
  adhocEntries,
  isAdmin,
  onAssign,
  onMove,
  onRemove,
  onRemoveAdhoc,
  onMoveAdhoc,
  onMultiDaySchedule,
  onEngineerReorder,
  onResizeSpan,
  onBulkAssign,
}: {
  weekDays: Date[];
  engineers: Engineer[];
  schedule: ScheduleEntry[];
  jobs: Job[];
  unallocatedJobs: Job[];
  adhocEntries: AdhocEntry[];
  isAdmin: boolean;
  onAssign: (jobId: string, engineerId: string, date: string) => Promise<void>;
  onMove: (entryId: string, newEngineerId: string, newDate: string) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
  onRemoveAdhoc: (entryId: string) => Promise<void>;
  onMoveAdhoc: (id: string, engineerId: string | null, date: string | null) => Promise<void>;
  onMultiDaySchedule: (job: Job) => void;
  onEngineerReorder: (newOrder: string[]) => void;
  onResizeSpan?: (jobId: string, engineerId: string, existingEntries: ScheduleEntry[], newDates: string[]) => Promise<void>;
  onBulkAssign?: (jobIds: string[], engineerId: string, date: string) => Promise<void>;
}) {
  const [activeItem, setActiveItem] = useState<any>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"unallocated" | "all">("unallocated");
  const [leaveMap, setLeaveMap] = useState<Map<string, string[]>>(new Map());
  const [bankHolidayDates, setBankHolidayDates] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [dayPanel, setDayPanel] = useState<{ engineerId: string; engineerName: string; date: string } | null>(null);
  const POOL_WIDTH_KEY = "planner:jobPoolWidth";
  const POOL_MIN = 200;
  const POOL_MAX = 560;
  const [poolWidth, setPoolWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 260;
    const v = Number(window.localStorage.getItem(POOL_WIDTH_KEY));
    return Number.isFinite(v) && v >= POOL_MIN && v <= POOL_MAX ? v : 260;
  });
  const resizingRef = useRef<{ startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizingRef.current.startX;
      const next = Math.max(POOL_MIN, Math.min(POOL_MAX, resizingRef.current.startW + delta));
      setPoolWidth(next);
    };
    const onUp = () => {
      if (resizingRef.current) {
        try { window.localStorage.setItem(POOL_WIDTH_KEY, String(Math.round(poolWidth))); } catch {}
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
      resizingRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [poolWidth]);
  const startPoolResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { startX: e.clientX, startW: poolWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const toggleSelect = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  // Listen for cell requests to open the day panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.engineerId && detail?.date) {
        setDayPanel({ engineerId: detail.engineerId, engineerName: detail.engineerName || "", date: detail.date });
      }
    };
    window.addEventListener("planner:open-day-panel", handler as EventListener);
    return () => window.removeEventListener("planner:open-day-panel", handler as EventListener);
  }, []);

  // Job and labour targets are the cell under the actual pointer, not the card centre.
  // Keep row sorting on closestCenter and pair matching limited to name-column zones.
  const collisionDetection: CollisionDetection = (args) => {
    if (activeItem?.type === "engineer-pair") {
      return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter(c => String(c.id).startsWith("eng-drop-")) });
    }
    if (activeItem?.type === "scheduled" || activeItem?.type === "unallocated" || activeItem?.type === "adhoc") {
      return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter(c => String(c.id).startsWith("cell-") || c.id === "unallocated-zone") });
    }
    return closestCenter(args);
  };
  const [engineerPairs, setEngineerPairs] = useState<[string, string][]>([]);
  const secondaryEngIds = useMemo(() => new Set(engineerPairs.map(p => p[1])), [engineerPairs]);

  useEffect(() => {
    const weekStart = format(weekDays[0], "yyyy-MM-dd");
    const weekEnd = format(weekDays[weekDays.length - 1], "yyyy-MM-dd");

    supabase
      .from("engineer_leave" as any)
      .select("engineer_id, start_date, end_date, leave_type")
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart)
      .then(({ data }) => {
        const map = new Map<string, string[]>();
        ((data as any[]) || []).forEach((l: any) => {
          weekDays.forEach((d) => {
            const dateStr = format(d, "yyyy-MM-dd");
            try {
              if (isWithinInterval(startOfDay(d), {
                start: startOfDay(parseISO(l.start_date)),
                end: endOfDay(parseISO(l.end_date)),
              })) {
                const existing = map.get(l.engineer_id) || [];
                if (!existing.includes(dateStr)) existing.push(dateStr);
                map.set(l.engineer_id, existing);
              }
            } catch { /* skip */ }
          });
        });
        setLeaveMap(map);
      });

    supabase
      .from("bank_holidays" as any)
      .select("date, name")
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .then(({ data }) => {
        const dates = new Set<string>((data as any[] || []).map((b: any) => b.date));
        setBankHolidayDates(dates);
      });
  }, [weekDays]);

  const sensors = useSensors(useSensor(ResizeAwarePointerSensor, { activationConstraint: { distance: 8 } }));

  const getJob = (id: string) => jobs.find((j) => j.id === id);

  const groupedUnallocated = useMemo(() => {
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

  const unallocatedAdhoc = useMemo(() =>
    adhocEntries.filter((a) => !a.schedule_date),
    [adhocEntries]
  );

  // For "All Jobs" sidebar mode — group allocated jobs by engineer
  const allocatedByEngineer = useMemo(() => {
    const scheduledJobIds = new Set(schedule.map((s) => s.job_id));
    const allocatedJobs = jobs.filter((j) => scheduledJobIds.has(j.id));
    const map: Record<string, { job: Job; entries: ScheduleEntry[] }[]> = {};
    for (const job of allocatedJobs) {
      const entries = schedule.filter((s) => s.job_id === job.id);
      const byEng: Record<string, ScheduleEntry[]> = {};
      for (const e of entries) {
        if (!byEng[e.engineer_id]) byEng[e.engineer_id] = [];
        byEng[e.engineer_id].push(e);
      }
      for (const [engId, engEntries] of Object.entries(byEng)) {
        if (!map[engId]) map[engId] = [];
        map[engId].push({ job, entries: engEntries });
      }
    }
    return Object.entries(map)
      .map(([engId, items]) => ({
        engId,
        engName: engineers.find((e) => e.user_id === engId)?.full_name || "Unknown",
        items,
      }))
      .sort((a, b) => a.engName.localeCompare(b.engName));
  }, [jobs, schedule, engineers]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItem(event.active.data.current);
    // Prevent text selection anywhere on the page while dragging a planner card
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
    document.body.classList.add("planner-dragging");
    // Clear any existing selection that might have started before the drag was recognised
    try { window.getSelection()?.removeAllRanges(); } catch {}
  };

  const handleDragOver = (event: any) => {
    setOverId(event.over?.id || null);
  };

  const clearDragSelectionLock = () => {
    document.body.style.userSelect = "";
    (document.body.style as any).webkitUserSelect = "";
    document.body.classList.remove("planner-dragging");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveItem(null);
    setOverId(null);
    clearDragSelectionLock();
    const { active, over } = event;
    if (!over) return;

    const targetId = over.id as string;
    const activeData = active.data.current;

    // Engineer-pair type: dropped on another engineer's drop zone → pair them on same row
    if (activeData?.type === "engineer-pair") {
      const draggedId = activeData.engineer.user_id as string;
      const targetEngId = targetId.startsWith("eng-drop-") ? targetId.replace("eng-drop-", "") : null;
      if (targetEngId && targetEngId !== draggedId) {
        setEngineerPairs((prev) => {
          const filtered = prev.filter((p) => !p.includes(draggedId) && !p.includes(targetEngId));
          return [...filtered, [targetEngId, draggedId]];
        });
      }
      return;
    }

    // Engineer row reorder
    if (!activeData || (!activeData.type && engineers.some((e) => e.user_id === String(active.id)))) {
      if (active.id !== over.id) {
        const oldIndex = engineers.findIndex((e) => e.user_id === active.id);
        const newIndex = engineers.findIndex((e) => e.user_id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(engineers, oldIndex, newIndex);
          onEngineerReorder(reordered.map((e) => e.user_id));
        }
      }
      return;
    }

    if (targetId === "unallocated-zone") {
      if (activeData?.type === "scheduled") {
        await onRemove(activeData.entry.id);
      } else if (activeData?.type === "adhoc") {
        await onMoveAdhoc(activeData.entry.id, null, null);
      }
      return;
    }

    if (!targetId.startsWith("cell-")) return;
    const parts = targetId.replace("cell-", "").split("_");
    const targetEngineerId = parts[0];
    const targetDate = parts[1];
    if (!targetEngineerId || !targetDate) return;

    if (activeData?.type === "unallocated") {
      await onAssign(activeData.job.id, targetEngineerId, targetDate);
    } else if (activeData?.type === "scheduled") {
      await onMove(activeData.entry.id, targetEngineerId, targetDate);
    } else if (activeData?.type === "adhoc") {
      await onMoveAdhoc(activeData.entry.id, targetEngineerId, targetDate);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveItem(null); setOverId(null); clearDragSelectionLock(); }}
    >
      <div className="flex gap-4">
        {/* Unallocated sidebar */}
        {isAdmin && (
          <div className="shrink-0 relative" style={{ width: `${poolWidth}px` }}>
            <DroppableUnallocatedZone>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Job Pool</h3>
                {onBulkAssign && (
                  <button
                    className={cn(
                      "text-[10px] rounded px-1.5 py-0.5 font-medium transition-colors border",
                      selectMode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted hover:bg-muted/80 border-border"
                    )}
                    onClick={() => {
                      setSelectMode((s) => {
                        if (s) setSelectedJobIds(new Set());
                        return !s;
                      });
                    }}
                  >
                    {selectMode ? "Done" : "Select"}
                  </button>
                )}
              </div>
              <div className="flex gap-1 mb-2">
                <button
                  className={cn(
                    "flex-1 text-[10px] rounded py-1 font-medium transition-colors",
                    sidebarMode === "unallocated"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                  onClick={() => setSidebarMode("unallocated")}
                >
                  Unallocated
                </button>
                <button
                  className={cn(
                    "flex-1 text-[10px] rounded py-1 font-medium transition-colors",
                    sidebarMode === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                  onClick={() => setSidebarMode("all")}
                >
                  All Jobs
                </button>
              </div>
              <ScrollArea className="h-[calc(100vh-340px)]">
                {sidebarMode === "unallocated" ? (
                  groupedUnallocated.length === 0 ? (
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
                              <span className="text-[10px] text-muted-foreground">{areaJobs.length}</span>
                            </div>
                            <div className="space-y-1">
                              {areaJobs.map((job) => (
                                <DraggableUnallocatedJob
                                  key={job.id}
                                  job={job}
                                  onMultiDay={onMultiDaySchedule}
                                  selectable={selectMode}
                                  selected={selectedJobIds.has(job.id)}
                                  onToggleSelect={toggleSelect}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="space-y-3 pr-2">
                    {/* Unallocated section in All Jobs mode */}
                    {groupedUnallocated.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-semibold">Unallocated</Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {groupedUnallocated.reduce((sum, [, arr]) => sum + arr.length, 0)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {groupedUnallocated.flatMap(([, areaJobs]) => areaJobs).map((job) => (
                            <DraggableUnallocatedJob
                              key={`unalloc-${job.id}`}
                              job={job}
                              onMultiDay={onMultiDaySchedule}
                              selectable={selectMode}
                              selected={selectedJobIds.has(job.id)}
                              onToggleSelect={toggleSelect}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Allocated by engineer */}
                    {allocatedByEngineer.map(({ engName, items }) => (
                      <div key={engName}>
                        <div className="mb-1 flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] font-semibold">{engName}</Badge>
                          <span className="text-[10px] text-muted-foreground">{items.length}</span>
                        </div>
                        <div className="space-y-1">
                          {items.map(({ job, entries }) => (
                            <div key={`alloc-${job.id}-${entries[0].engineer_id}`} className="relative">
                              <DraggableUnallocatedJob
                                job={job}
                                onMultiDay={onMultiDaySchedule}
                              />
                              <span className="absolute top-1 right-1 inline-flex items-center rounded bg-primary/10 border border-primary/20 px-1 py-0.5 text-[8px] font-semibold text-primary">
                                {entries.length > 1 ? `${entries.length} days` : format(parseISO(entries[0].schedule_date), "dd/MM")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {allocatedByEngineer.length === 0 && groupedUnallocated.length === 0 && (
                      <p className="text-xs text-muted-foreground py-4 text-center">No jobs found</p>
                    )}
                  </div>
                )}
                {unallocatedAdhoc.length > 0 && (
                  <div className="mt-3 pr-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-semibold text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.4)]">Labour</Badge>
                      <span className="text-[10px] text-muted-foreground">{unallocatedAdhoc.length}</span>
                    </div>
                    <div className="space-y-1">
                      {unallocatedAdhoc.map((entry) => (
                        <DraggableAdhocCard key={entry.id} entry={entry} isAdmin={true} onRemove={onRemoveAdhoc} />
                      ))}
                    </div>
                  </div>
                )}
                <ScrollBar orientation="vertical" />
              </ScrollArea>
              {selectMode && onBulkAssign && (
                <BulkAssignBar
                  count={selectedJobIds.size}
                  engineers={engineers}
                  defaultDate={format(weekDays[0], "yyyy-MM-dd")}
                  onAssign={async (engineerId, date) => {
                    const ids = Array.from(selectedJobIds);
                    await onBulkAssign(ids, engineerId, date);
                    setSelectedJobIds(new Set());
                    setSelectMode(false);
                  }}
                  onClear={() => setSelectedJobIds(new Set())}
                />
              )}
            </DroppableUnallocatedZone>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize job pool"
              title="Drag to resize"
              onMouseDown={startPoolResize}
              onDoubleClick={() => { setPoolWidth(260); try { window.localStorage.setItem(POOL_WIDTH_KEY, "260"); } catch {} }}
              className="absolute top-0 right-[-6px] h-full w-3 cursor-col-resize group flex items-center justify-center z-10"
            >
              <div className="h-16 w-1 rounded bg-border group-hover:bg-primary transition-colors" />
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[1120px]">
            {/* Day headers */}
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, minmax(140px, 1fr))` }}>
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Engineer</div>
              {weekDays.map((d) => {
                const isToday = isSameDay(d, new Date());
                const dateStr = format(d, "yyyy-MM-dd");
                const isBankHoliday = bankHolidayDates.has(dateStr);
                return (
                  <div key={d.toISOString()} className={cn(
                    "rounded-md px-2 py-1 text-center text-xs font-semibold",
                    isToday ? "bg-primary text-primary-foreground" : isBankHoliday ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30" : "text-muted-foreground"
                  )}>
                    <div>{format(d, "EEE")}</div>
                    <div className="text-[10px]">{format(d, "dd/MM")}</div>
                    {isBankHoliday && <div className="text-[9px] font-normal truncate">🏦 Bank Hol</div>}
                  </div>
                );
              })}
            </div>

            {/* Engineer rows */}
            <ScrollArea className="h-[calc(100vh-320px)]">
              <SortableContext items={engineers.filter(e => !secondaryEngIds.has(e.user_id)).map((e) => e.user_id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {engineers
                    .filter(e => !secondaryEngIds.has(e.user_id))
                    .map((eng) => {
                      const pair = engineerPairs.find(p => p[0] === eng.user_id);
                      const partnerEng = pair ? engineers.find(e => e.user_id === pair[1]) : undefined;
                      return (
                        <SortableEngineerRow
                          key={eng.user_id}
                          eng={eng}
                          partnerEng={partnerEng}
                          onUnpair={pair ? () => setEngineerPairs(prev => prev.filter(p => p[0] !== eng.user_id)) : undefined}
                          allEngineers={engineers}
                          weekDays={weekDays}
                          schedule={schedule}
                          adhocEntries={adhocEntries}
                          overId={overId}
                          isAdmin={isAdmin}
                          getJob={getJob}
                          onRemove={onRemove}
                          onRemoveAdhoc={onRemoveAdhoc}
                          leaveDates={leaveMap.get(eng.user_id) || []}
                          partnerLeaveDates={partnerEng ? leaveMap.get(partnerEng.user_id) || [] : []}
                          bankHolidayDates={bankHolidayDates}
                          onResizeSpan={onResizeSpan}
                        />
                      );
                    })}
                </div>
              </SortableContext>
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeItem?.type === "unallocated" && activeItem.job && (
          <div className={cn("rounded-md border-l-4 bg-card p-2 text-xs shadow-lg w-[180px]", PRIORITY_BG[activeItem.job.priority])}>
            <div className="font-mono font-medium text-primary">{activeItem.job.reference_number}</div>
            <div className="truncate">{activeItem.job.name}</div>
          </div>
        )}
        {activeItem?.type === "scheduled" && activeItem.job && (
          <div className={cn("rounded-md border-l-4 bg-card p-2 text-xs shadow-lg w-[180px]", PRIORITY_BG[activeItem.job.priority])}>
            <div className="font-mono font-medium text-primary">{activeItem.job.reference_number}</div>
            <div className="truncate">{activeItem.job.name}</div>
          </div>
        )}
        {activeItem?.type === "adhoc" && activeItem.entry && (
          <div className="rounded-md border-l-4 border-l-[hsl(var(--chart-3))] bg-card p-2 text-xs shadow-lg w-[180px]">
            <div className="font-semibold text-[10px] uppercase tracking-wide text-[hsl(var(--chart-3))]">Labour</div>
            <div className="truncate font-medium">{activeItem.entry.company_name}</div>
          </div>
        )}
        {activeItem?.type === "engineer-pair" && activeItem.engineer && (
          <div className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold shadow-xl flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            <div>
              <div>{activeItem.engineer.full_name}</div>
              <div className="text-[10px] font-normal opacity-80">Drop onto another engineer to pair</div>
            </div>
          </div>
        )}
      </DragOverlay>
      {dayPanel && (
        <DayPanel
          open={!!dayPanel}
          onOpenChange={(v) => { if (!v) setDayPanel(null); }}
          engineerId={dayPanel.engineerId}
          engineerName={dayPanel.engineerName}
          date={dayPanel.date}
          onRemove={onRemove}
        />
      )}
    </DndContext>
  );
}

// Global exposed opener so cells can trigger the panel via a lightweight event.
// (Kept as a module-level bus to avoid threading callbacks through every SortableEngineerRow prop.)
const openDayPanelEvent = "planner:open-day-panel";
export function dispatchOpenDayPanel(detail: { engineerId: string; engineerName: string; date: string }) {
  window.dispatchEvent(new CustomEvent(openDayPanelEvent, { detail }));
}

// Sortable engineer row
function SortableEngineerRow({
  eng,
  partnerEng,
  onUnpair,
  allEngineers,
  weekDays,
  schedule,
  adhocEntries,
  overId,
  isAdmin,
  getJob,
  onRemove,
  onRemoveAdhoc,
  leaveDates,
  partnerLeaveDates,
  bankHolidayDates,
  onResizeSpan,
}: {
  eng: Engineer;
  partnerEng?: Engineer;
  onUnpair?: () => void;
  allEngineers: Engineer[];
  weekDays: Date[];
  schedule: ScheduleEntry[];
  adhocEntries: AdhocEntry[];
  overId: string | null;
  isAdmin: boolean;
  getJob: (id: string) => Job | undefined;
  onRemove: (id: string) => void;
  onRemoveAdhoc: (id: string) => void;
  leaveDates: string[];
  partnerLeaveDates: string[];
  bankHolidayDates: Set<string>;
  onResizeSpan?: (jobId: string, engineerId: string, existingEntries: ScheduleEntry[], newDates: string[]) => Promise<void>;
}) {
  const { attributes: sortAttrs, listeners: sortListeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: eng.user_id });
  const { attributes: pairAttrs, listeners: pairListeners, setNodeRef: pairRef, isDragging: isPairDragging } = useDraggable({
    id: `pair-${eng.user_id}`,
    data: { type: "engineer-pair", engineer: eng },
    disabled: !isAdmin || !!partnerEng,
  });
  const { setNodeRef: pairDropRef, isOver: isPairDropOver } = useDroppable({
    id: `eng-drop-${eng.user_id}`,
    data: { type: "engineer-drop", engineerId: eng.user_id },
    disabled: !isAdmin || !!partnerEng,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const today = format(new Date(), "yyyy-MM-dd");
  const engEntries = schedule.filter((s) => s.engineer_id === eng.user_id);
  const partnerEntries = partnerEng ? schedule.filter((s) => s.engineer_id === partnerEng.user_id) : [];
  const todayJobs = engEntries.filter(s => s.schedule_date === today).length
    + partnerEntries.filter(s => s.schedule_date === today).length;
  const available = todayJobs === 0;
  const totalPT = [...engEntries, ...partnerEntries].reduce((sum, s) => sum + (getJob(s.job_id)?.pressure_test_qty || 0), 0);
  const totalVis = [...engEntries, ...partnerEntries].reduce((sum, s) => sum + (getJob(s.job_id)?.visual_qty || 0), 0);

  const weekDateStrs = weekDays.map(d => format(d, "yyyy-MM-dd"));
  const dayPosition = (entry: ScheduleEntry) => {
    const dates = [...new Set(schedule.filter(s => s.engineer_id === entry.engineer_id && s.job_id === entry.job_id).map(s => s.schedule_date))].sort();
    return { index: dates.indexOf(entry.schedule_date) + 1, count: dates.length };
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("space-y-0.5", partnerEng && "bg-primary/5 rounded-md ring-1 ring-primary/20 p-0.5")}
    >
      {/* Main grid row */}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, minmax(140px, 1fr))` }}
      >
        {/* Engineer name column */}
        <div
          ref={(node) => { if (!partnerEng) pairDropRef(node); }}
          className={cn(
            "flex flex-col justify-center gap-0.5 px-2 py-1 min-w-0 rounded transition-colors",
            isPairDropOver && !partnerEng && "bg-primary/15 ring-1 ring-primary/50"
          )}
        >
          <div className="flex items-center gap-1 min-w-0">
            {isAdmin && (
              <span {...sortAttrs} {...sortListeners} className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground" title="Drag to reorder">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            {/* Draggable engineer name */}
            <span
              ref={!partnerEng ? pairRef : undefined}
              {...(!partnerEng ? pairAttrs : {})}
              {...(!partnerEng ? pairListeners : {})}
              className={cn(
                "truncate text-sm font-medium rounded px-1 py-0.5 transition-colors",
                isAdmin && !partnerEng && "cursor-grab hover:text-primary",
                isPairDragging && "opacity-40",
                isPairDropOver && !partnerEng && "text-primary font-semibold"
              )}
              title={isAdmin && !partnerEng ? "Drag onto another engineer to pair them on this row" : undefined}
            >
              {eng.full_name}
            </span>
            {isPairDropOver && !partnerEng && (
              <span className="shrink-0 text-[9px] font-semibold text-primary">+ Pair</span>
            )}
            <span className={cn(
              "shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none",
              available ? "bg-green-500/20 text-green-700 dark:text-green-400"
                : todayJobs >= 3 ? "bg-destructive/20 text-destructive"
                : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
            )}>
              {available ? "Free" : `${todayJobs} today`}
            </span>
            {partnerEng && isAdmin && onUnpair && (
              <button onClick={onUnpair} className="shrink-0 ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Unpair">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {partnerEng && (
            <div className="flex items-center gap-1 min-w-0 pl-3 border-l-2 border-primary/40">
              <Users className="h-2.5 w-2.5 shrink-0 text-primary" />
              <span className="truncate text-xs font-medium text-primary">{partnerEng.full_name}</span>
            </div>
          )}
          {(totalPT > 0 || totalVis > 0) && (
            <div className="flex items-center gap-0.5 flex-wrap">
              {totalPT > 0 && <span className="inline-flex items-center rounded bg-primary/10 border border-primary/20 text-primary px-1 py-0.5 text-[9px] font-semibold leading-none">PT×{totalPT}</span>}
              {totalVis > 0 && <span className="inline-flex items-center rounded bg-secondary border border-border text-secondary-foreground px-1 py-0.5 text-[9px] font-semibold leading-none">Vis×{totalVis}</span>}
            </div>
          )}
        </div>

        {/* Exactly one drop zone per date, including dates covered by multi-day visits. */}
        {weekDays.map((d, colIdx) => {
          const dateStr = weekDateStrs[colIdx];
          const cellId = `cell-${eng.user_id}_${dateStr}`;
          const own = engEntries.filter(s => s.schedule_date === dateStr);
          const partner = partnerEntries.filter(s => s.schedule_date === dateStr);
          const visits = [...own, ...partner];
          const cellAdhoc = adhocEntries.filter(a => a.schedule_date === dateStr && (a.engineer_id === eng.user_id || a.engineer_id === partnerEng?.user_id));
          return (
            <DroppableCell key={cellId} id={cellId} colIdx={colIdx} isToday={isSameDay(d, new Date())} isOver={overId === cellId}
              isLeave={leaveDates.includes(dateStr) || partnerLeaveDates.includes(dateStr) || bankHolidayDates.has(dateStr)}>
              {bankHolidayDates.has(dateStr) && <div className="truncate text-[10px] text-amber-700 dark:text-amber-400">Bank holiday</div>}
              {(leaveDates.includes(dateStr) || partnerLeaveDates.includes(dateStr)) && <div className="truncate text-[10px] text-primary"><Palmtree className="inline h-3 w-3" /> On leave</div>}
              {visits.slice(0, 2).map(entry => {
                const position = dayPosition(entry);
                const engineer = entry.engineer_id === eng.user_id ? eng : partnerEng;
                return <DraggableScheduleCard key={entry.id} entry={entry} job={getJob(entry.job_id)}
                  engineerName={engineer?.full_name || "—"} dayIndex={position.index} dayCount={position.count}
                  isAdmin={isAdmin} onRemove={onRemove}
                  onAdjustSpan={onResizeSpan ? () => {
                    const dates = schedule.filter(s => s.engineer_id === entry.engineer_id && s.job_id === entry.job_id).sort((x, y) => x.schedule_date.localeCompare(y.schedule_date));
                    const last = dates[dates.length - 1];
                    if (last) void onResizeSpan(entry.job_id, entry.engineer_id, dates, [...dates.map(s => s.schedule_date), format(addDays(parseISO(last.schedule_date), 1), "yyyy-MM-dd")]);
                  } : undefined} />;
              })}
              {visits.length > 2 && <Popover>
                <PopoverTrigger asChild><Button size="sm" variant="link" className="h-5 px-0 text-[10px]">+{visits.length - 2} more</Button></PopoverTrigger>
                <PopoverContent className="w-72 max-h-80 overflow-y-auto space-y-1" align="start">
                  {visits.slice(2).map(entry => {
                    const position = dayPosition(entry);
                    return <DraggableScheduleCard key={entry.id} entry={entry} job={getJob(entry.job_id)}
                      engineerName={(entry.engineer_id === eng.user_id ? eng : partnerEng)?.full_name || "—"}
                      dayIndex={position.index} dayCount={position.count} isAdmin={isAdmin} onRemove={onRemove} />;
                  })}
                </PopoverContent>
              </Popover>}
              {cellAdhoc.map(adhoc => <DraggableAdhocCard key={adhoc.id} entry={adhoc} isAdmin={isAdmin} onRemove={onRemoveAdhoc} />)}
            </DroppableCell>
          );
        })}
      </div>
    </div>
  );
}
