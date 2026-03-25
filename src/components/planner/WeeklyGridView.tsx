import { useMemo, useState, useEffect, useRef } from "react";
import { format, isSameDay, isPast, parseISO, startOfDay, isWithinInterval, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { X, GripVertical, AlertTriangle, CalendarDays, Palmtree, Users } from "lucide-react";
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
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AdhocEntryCard from "./AdhocEntryCard";
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

const STATUS_INDICATOR: Record<string, { label: string; class: string }> = {
  active: { label: "Active", class: "bg-primary/20 text-primary" },
  completed: { label: "Done", class: "bg-green-500/20 text-green-700 dark:text-green-400" },
  archived: { label: "Archived", class: "bg-muted text-muted-foreground" },
  revisit: { label: "Revisit", class: "bg-orange-500/20 text-orange-600 dark:text-orange-400" },
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
}: {
  job: Job;
  onMultiDay: (job: Job) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unalloc-${job.id}`,
    data: { type: "unallocated", job },
  });

  const isOverdue = job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date());
  const isDueToday = job.due_date && isSameDay(parseISO(job.due_date), new Date());

  return (
    <div
      className={cn(
        "group relative rounded-md border-l-4 bg-card p-2 text-xs shadow-sm hover:shadow transition-shadow",
        isOverdue ? "border-l-destructive bg-destructive/10 ring-2 ring-destructive/50" : isDueToday ? "border-l-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40" : PRIORITY_BG[job.priority] || "border-l-muted",
        isDragging && "opacity-30"
      )}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab absolute inset-0 rounded-md"
        style={{ zIndex: 0 }}
      />
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onMultiDay(job); }}
        className="absolute top-1.5 right-1.5 z-10 rounded p-0.5 bg-card/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all"
        title="Schedule multiple days"
      >
        <CalendarDays className="h-3 w-3" />
      </button>
      <div className="relative z-[1]">
        <div className="flex items-center justify-between gap-1 mb-0.5 pr-5">
          <Link
            to={`/jobs/${job.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="font-mono font-medium text-primary hover:underline z-10"
          >
            {job.reference_number}
          </Link>
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
        {((job as any).customers?.name || job.customer) && <div className="text-muted-foreground truncate">{(job as any).customers?.name || job.customer}</div>}
        {(job.site?.name || job.site?.postcode) && (
          <div className="text-muted-foreground truncate">
            {job.site.name}{job.site.postcode ? ` · ${job.site.postcode}` : ""}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-0.5">
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

// Spanning multi-day job card
function SpanningJobCard({
  entries,
  job,
  span,
  isAdmin,
  onRemove,
  pairedEngineers,
  isFirst,
  isContinuation,
  onResizeStart,
}: {
  entries: ScheduleEntry[];
  job: Job | undefined;
  span: number;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  pairedEngineers?: Engineer[];
  isFirst: boolean;
  isContinuation: boolean;
  onResizeStart?: (e: React.PointerEvent) => void;
}) {
  if (!job) return null;
  const isOverdue = job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date()) && job.status !== "completed";
  const dueToday = job.due_date && isSameDay(parseISO(job.due_date), new Date());
  const entry = entries[0];

  return (
    <div
      className={cn(
        "relative rounded-md border-l-4 bg-card px-2 py-1.5 text-[11px] shadow-sm h-full flex flex-col justify-center min-h-[52px]",
        PRIORITY_BG[job.priority] || "border-l-muted",
        span > 1 && "rounded-r-md",
        isContinuation && "border-l-0 rounded-l-none border-l-transparent pl-1.5"
      )}
      style={{
        background: span > 1
          ? `linear-gradient(90deg, hsl(var(--card)) 0%, hsl(var(--primary)/0.04) 100%)`
          : undefined,
      }}
    >
      {/* Day count badge for multi-day */}
      {span > 1 && (
        <div className="absolute top-1 right-6 flex items-center gap-0.5">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none">
            <CalendarDays className="h-2.5 w-2.5" />{span}d
          </span>
        </div>
      )}
      <div className="flex items-start gap-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            <Link to={`/jobs/${job.id}`} className="font-mono font-semibold text-primary hover:underline shrink-0 text-[11px]">
              {job.reference_number}
            </Link>
            {STATUS_INDICATOR[job.status] && (
              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0", STATUS_INDICATOR[job.status].class)}>
                {STATUS_INDICATOR[job.status].label}
              </span>
            )}
            {isOverdue && (
              <span className="inline-flex items-center gap-0.5 rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground shrink-0">
                <AlertTriangle className="h-2 w-2" /> OVR
              </span>
            )}
            {dueToday && !isOverdue && (
              <span className="inline-flex items-center rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shrink-0">TODAY</span>
            )}
          </div>
          <div className="truncate text-foreground font-medium">{job.name}</div>
          {(job.site?.name || job.site?.postcode) && (
            <div className="truncate text-muted-foreground text-[10px]">
              📍 {job.site.name}{job.site.postcode ? ` · ${job.site.postcode}` : ""}
            </div>
          )}
          {entry?.notes && (
            <div
              className="truncate italic text-[10px] font-medium"
              style={entry.notes_color ? { color: entry.notes_color } : { color: "hsl(var(--muted-foreground))" }}
            >
              {entry.notes}
            </div>
          )}
          {pairedEngineers && pairedEngineers.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <Users className="h-2.5 w-2.5 text-primary shrink-0" />
              {pairedEngineers.map((pe) => (
                <span key={pe.user_id} className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-medium leading-none">
                  {pe.full_name.split(" ")[0]}
                </span>
              ))}
            </div>
          )}
          {(job.category === "installation" || job.pressure_test_qty > 0 || job.visual_qty > 0 || (job.other_qty > 0 && job.other_service_type)) && (
            <div className="flex flex-wrap gap-0.5 mt-0.5">
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
          )}
        </div>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); entries.forEach(e2 => onRemove(e2.id)); }}
            className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {/* Resize handle — right edge */}
      {isAdmin && onResizeStart && (
        <div
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
          className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize group/resize rounded-r-md hover:bg-primary/20 transition-colors z-10"
          title="Drag to extend or shrink across days"
        >
          <div className="w-0.5 h-5 rounded-full bg-primary/30 group-hover/resize:bg-primary/70 transition-colors" />
        </div>
      )}
    </div>
  );
}

// Single-day schedule card (droppable for pairing)
function DraggableScheduleCard({
  entry,
  job,
  isAdmin,
  onRemove,
  pairedEngineers,
  onResizeStart,
}: {
  entry: ScheduleEntry;
  job: Job | undefined;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  pairedEngineers?: Engineer[];
  onResizeStart?: (e: React.PointerEvent) => void;
}) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: `sched-${entry.id}`,
    data: { type: "scheduled", entry, job },
    disabled: !isAdmin,
  });

  if (!job) return null;
  const isOverdue = job.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date()) && job.status !== "completed";
  const dueToday = job.due_date && isSameDay(parseISO(job.due_date), new Date());

  return (
    <div
      ref={isAdmin ? dragRef : undefined}
      {...(isAdmin ? attributes : {})}
      {...(isAdmin ? listeners : {})}
      className={cn(
        "group relative rounded-md border-l-4 bg-card p-1.5 text-[11px] shadow-sm transition-colors",
        PRIORITY_BG[job.priority] || "border-l-muted",
        isDragging && "opacity-30",
        isAdmin && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Drag hint — visible on hover for admins */}
      {isAdmin && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <GripVertical className="h-3 w-3 text-muted-foreground/60" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <Link
              to={`/jobs/${job.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="font-mono font-semibold text-primary hover:underline shrink-0"
            >
              {job.reference_number}
            </Link>
            {STATUS_INDICATOR[job.status] && (
              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0", STATUS_INDICATOR[job.status].class)}>
                {STATUS_INDICATOR[job.status].label}
              </span>
            )}
          </div>
          {job.due_date && (() => {
            return isOverdue ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground shrink-0">
                <AlertTriangle className="h-2 w-2" /> OVERDUE
              </span>
            ) : dueToday ? (
              <span className="inline-flex items-center rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shrink-0">
                TODAY
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-muted border border-border px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground shrink-0">
                {format(parseISO(job.due_date!), "dd/MM/yy")}
              </span>
            );
          })()}
        </div>
        <div className="truncate text-foreground">{job.name}</div>
        {(job.site?.name || job.site?.postcode) && (
          <div className="truncate text-muted-foreground text-[10px]">
            📍 {job.site.name}{job.site.postcode ? ` · ${job.site.postcode}` : ""}
          </div>
        )}
        {entry.notes && (
          <div
            className="truncate italic text-[10px] font-medium"
            style={entry.notes_color ? { color: entry.notes_color } : { color: "hsl(var(--muted-foreground))" }}
          >
            {entry.notes}
          </div>
        )}
        {pairedEngineers && pairedEngineers.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <Users className="h-2.5 w-2.5 text-primary shrink-0" />
            {pairedEngineers.map((pe) => (
              <span key={pe.user_id} className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-medium leading-none">
                {pe.full_name.split(" ")[0]}
              </span>
            ))}
          </div>
        )}
        {(job.category === "installation" || job.pressure_test_qty > 0 || job.visual_qty > 0 || (job.other_qty > 0 && job.other_service_type)) && (
          <div className="flex flex-wrap gap-1 mt-0.5">
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
        )}
      </div>
      {isAdmin && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
          className="absolute bottom-1 right-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity z-10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
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
    <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}>
      <div className={cn(isAdmin && "cursor-grab")} {...attributes} {...listeners}>
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
        "min-h-[80px] rounded-md border p-1.5 space-y-1 transition-colors",
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
}) {
  const [activeItem, setActiveItem] = useState<any>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [leaveMap, setLeaveMap] = useState<Map<string, string[]>>(new Map());
  const [bankHolidayDates, setBankHolidayDates] = useState<Set<string>>(new Set());
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4">
        {/* Unallocated sidebar */}
        {isAdmin && (
          <div className="w-[220px] shrink-0">
            <DroppableUnallocatedZone>
              <h3 className="mb-2 text-sm font-semibold">Unallocated Jobs</h3>
              <ScrollArea className="h-[calc(100vh-300px)]">
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
                            <span className="text-[10px] text-muted-foreground">{areaJobs.length}</span>
                          </div>
                          <div className="space-y-1">
                            {areaJobs.map((job) => (
                              <DraggableUnallocatedJob
                                key={job.id}
                                job={job}
                                onMultiDay={onMultiDaySchedule}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
            </DroppableUnallocatedZone>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)` }}>
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
    </DndContext>
  );
}

// Compute multi-day spans for a set of schedule entries within the visible weekDays
function computeSpans(
  entries: ScheduleEntry[],
  weekDays: Date[]
): Array<{ jobId: string; startColIndex: number; span: number; entries: ScheduleEntry[]; isContinuation: boolean }> {
  const weekDateStrs = weekDays.map(d => format(d, "yyyy-MM-dd"));

  // Group entries by job
  const byJob = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    const arr = byJob.get(e.job_id) || [];
    arr.push(e);
    byJob.set(e.job_id, arr);
  }

  const spans: Array<{ jobId: string; startColIndex: number; span: number; entries: ScheduleEntry[]; isContinuation: boolean }> = [];

  for (const [jobId, jobEntries] of byJob) {
    // Find which column indices this job occupies
    const colIndices = jobEntries
      .map(e => weekDateStrs.indexOf(e.schedule_date))
      .filter(i => i !== -1)
      .sort((a, b) => a - b);

    if (colIndices.length === 0) continue;

    if (colIndices.length === 1) {
      spans.push({ jobId, startColIndex: colIndices[0], span: 1, entries: jobEntries, isContinuation: false });
      continue;
    }

    // Group consecutive columns into runs
    let runStart = colIndices[0];
    let runEnd = colIndices[0];
    for (let i = 1; i <= colIndices.length; i++) {
      if (i < colIndices.length && colIndices[i] === runEnd + 1) {
        runEnd = colIndices[i];
      } else {
        const runEntries = jobEntries.filter(e => {
          const idx = weekDateStrs.indexOf(e.schedule_date);
          return idx >= runStart && idx <= runEnd;
        });
        spans.push({
          jobId,
          startColIndex: runStart,
          span: runEnd - runStart + 1,
          entries: runEntries,
          isContinuation: false,
        });
        if (i < colIndices.length) {
          runStart = colIndices[i];
          runEnd = colIndices[i];
        }
      }
    }
  }

  return spans;
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

  // Resize state: tracks which span is being resized and the live preview column count
  const [resizingSpanKey, setResizingSpanKey] = useState<string | null>(null);
  const [resizePreviewSpan, setResizePreviewSpan] = useState<number>(1);
  const resizeDataRef = useRef<{
    spanKey: string;
    jobId: string;
    engineerId: string;
    startColIndex: number;
    existingEntries: ScheduleEntry[];
    cellRects: DOMRect[];
  } | null>(null);

  // Build a ref for the grid row element to measure cell positions
  const gridRowRef = useRef<HTMLDivElement | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const engEntries = schedule.filter((s) => s.engineer_id === eng.user_id);
  const partnerEntries = partnerEng ? schedule.filter((s) => s.engineer_id === partnerEng.user_id) : [];
  const todayJobs = engEntries.filter(s => s.schedule_date === today).length
    + partnerEntries.filter(s => s.schedule_date === today).length;
  const available = todayJobs === 0;
  const totalPT = [...engEntries, ...partnerEntries].reduce((sum, s) => sum + (getJob(s.job_id)?.pressure_test_qty || 0), 0);
  const totalVis = [...engEntries, ...partnerEntries].reduce((sum, s) => sum + (getJob(s.job_id)?.visual_qty || 0), 0);

  // Compute spans for this engineer (and partner)
  const engSpans = useMemo(() => computeSpans(engEntries, weekDays), [engEntries, weekDays]);
  const partnerSpans = useMemo(() => partnerEng ? computeSpans(partnerEntries, weekDays) : [], [partnerEntries, weekDays, partnerEng]);

  // Track which column indices are covered by multi-day spans (span > 1, not start col) — these show empty in cells
  const engCoveredCols = useMemo(() => {
    const covered = new Set<number>();
    for (const s of engSpans) {
      if (s.span > 1) {
        for (let i = s.startColIndex + 1; i < s.startColIndex + s.span; i++) covered.add(i);
      }
    }
    return covered;
  }, [engSpans]);

  const partnerCoveredCols = useMemo(() => {
    const covered = new Set<number>();
    for (const s of partnerSpans) {
      if (s.span > 1) {
        for (let i = s.startColIndex + 1; i < s.startColIndex + s.span; i++) covered.add(i);
      }
    }
    return covered;
  }, [partnerSpans]);

  const weekDateStrs = weekDays.map(d => format(d, "yyyy-MM-dd"));

  // Resize handler: captures pointer, measures cell positions, updates preview and commits on pointerup
  const handleResizeStart = (
    e: React.PointerEvent,
    spanKey: string,
    jobId: string,
    engineerId: string,
    startColIndex: number,
    existingEntries: ScheduleEntry[]
  ) => {
    if (!onResizeSpan) return;
    e.stopPropagation();
    e.preventDefault();

    // Measure cell positions from the grid row
    const gridEl = gridRowRef.current;
    if (!gridEl) return;
    const cells = Array.from(gridEl.querySelectorAll<HTMLElement>("[data-day-col]"));
    const cellRects = cells.map(c => c.getBoundingClientRect());

    resizeDataRef.current = { spanKey, jobId, engineerId, startColIndex, existingEntries, cellRects };
    setResizingSpanKey(spanKey);
    setResizePreviewSpan(existingEntries.length || 1);

    const getColFromX = (x: number) => {
      let best = startColIndex;
      for (let i = startColIndex; i < cellRects.length; i++) {
        const r = cellRects[i];
        if (x >= r.left - 8 && x <= r.right + 8) { best = i; break; }
        if (x > r.right) best = i;
      }
      return Math.max(startColIndex, best);
    };

    const onMove = (me: PointerEvent) => {
      if (!resizeDataRef.current) return;
      const col = getColFromX(me.clientX);
      setResizePreviewSpan(col - startColIndex + 1);
    };

    const onUp = async (ue: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (!resizeDataRef.current) { setResizingSpanKey(null); return; }
      const col = getColFromX(ue.clientX);
      const newSpan = Math.max(1, col - startColIndex + 1);
      const newDates = weekDateStrs.slice(startColIndex, startColIndex + newSpan);
      setResizingSpanKey(null);
      resizeDataRef.current = null;
      await onResizeSpan!(jobId, engineerId, existingEntries, newDates);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };


  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("space-y-0.5", partnerEng && "bg-primary/5 rounded-md ring-1 ring-primary/20 p-0.5")}
    >
      {/* Main grid row */}
      <div
        ref={gridRowRef}
        className="grid gap-1"
        style={{ gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)` }}
      >
        {/* Engineer name column */}
        <div className="flex flex-col justify-center gap-0.5 px-2 py-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            {isAdmin && (
              <span {...sortAttrs} {...sortListeners} className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground" title="Drag to reorder">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            {/* Droppable + draggable engineer name */}
            <span
              ref={(node) => {
                if (!partnerEng) {
                  pairRef(node);
                  pairDropRef(node);
                }
              }}
              {...(!partnerEng ? pairAttrs : {})}
              {...(!partnerEng ? pairListeners : {})}
              className={cn(
                "truncate text-sm font-medium rounded px-1 py-0.5 transition-colors",
                isAdmin && !partnerEng && "cursor-grab hover:text-primary",
                isPairDragging && "opacity-40",
                isPairDropOver && !partnerEng && "bg-primary/20 text-primary ring-1 ring-primary/50"
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

        {/* Day cells — render spanning cards OR individual cards */}
        {weekDays.map((d, colIdx) => {
          const dateStr = weekDateStrs[colIdx];
          const cellId = `cell-${eng.user_id}_${dateStr}`;
          const isToday = isSameDay(d, new Date());
          const isOnLeave = leaveDates.includes(dateStr);
          const isPartnerOnLeave = partnerLeaveDates.includes(dateStr);
          const isBankHoliday = bankHolidayDates.has(dateStr);

          // Single-day entries at this column (jobs that don't span)
          const singleEngEntries = engSpans
            .filter(s => s.span === 1 && s.startColIndex === colIdx)
            .flatMap(s => s.entries);
          const spanStartsHere = engSpans.filter(s => s.span > 1 && s.startColIndex === colIdx);
          const partnerSingleEntries = partnerSpans
            .filter(s => s.span === 1 && s.startColIndex === colIdx)
            .flatMap(s => s.entries);
          const partnerSpanStartsHere = partnerSpans.filter(s => s.span > 1 && s.startColIndex === colIdx);

          const cellAdhoc = adhocEntries.filter(a => a.engineer_id === eng.user_id && a.schedule_date === dateStr);
          const partnerCellAdhoc = partnerEng
            ? adhocEntries.filter(a => a.engineer_id === partnerEng.user_id && a.schedule_date === dateStr)
            : [];

          const hasAnyContent = singleEngEntries.length + spanStartsHere.length + cellAdhoc.length
            + partnerSingleEntries.length + partnerSpanStartsHere.length + partnerCellAdhoc.length > 0;

          // If this column is covered (continuation of a span), render a transparent connector cell
          if (engCoveredCols.has(colIdx) && partnerCoveredCols.has(colIdx)) {
            // Both covered — empty connector (transparent, no drop target)
            return (
              <div
                key={cellId}
                data-day-col={colIdx}
                className={cn(
                  "min-h-[80px] rounded-md border border-dashed border-primary/10 p-1 transition-colors",
                  isToday && "bg-primary/3"
                )}
              />
            );
          }

          // Determine live preview span for a span being resized at this col
          const getEffectiveSpan = (spanItem: { jobId: string; startColIndex: number; span: number }) => {
            const key = `${spanItem.jobId}-${eng.user_id}`;
            if (resizingSpanKey === key) return resizePreviewSpan;
            return spanItem.span;
          };

          // Build cell content
          const content = (
            <>
              {isBankHoliday && !hasAnyContent && (
                <div className="flex items-center gap-1 rounded px-1.5 py-1 bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                  🏦 Bank Holiday
                </div>
              )}
              {isBankHoliday && hasAnyContent && (
                <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium mb-0.5 px-0.5">🏦 Bank Hol</div>
              )}
              {isOnLeave && (
                <div className="flex items-center gap-1 text-[10px] font-medium text-primary px-0.5 mb-0.5">
                  <Palmtree className="h-3 w-3 shrink-0" />{eng.full_name.split(" ")[0]} on leave
                </div>
              )}
              {isPartnerOnLeave && partnerEng && (
                <div className="flex items-center gap-1 text-[10px] font-medium text-primary px-0.5 mb-0.5">
                  <Palmtree className="h-3 w-3 shrink-0" />{partnerEng.full_name.split(" ")[0]} on leave
                </div>
              )}
              {/* Spanning multi-day job cards starting here */}
              {spanStartsHere.map((spanItem) => {
                const job = getJob(spanItem.jobId);
                const paired = allEngineers.filter(
                  (e) => e.user_id !== eng.user_id &&
                    schedule.some((s) => s.job_id === spanItem.jobId && s.engineer_id === e.user_id && weekDateStrs.includes(s.schedule_date))
                );
                const effectiveSpan = getEffectiveSpan(spanItem);
                const spanKey = `${spanItem.jobId}-${eng.user_id}`;
                return (
                  <div
                    key={`span-${spanItem.jobId}-${colIdx}`}
                    className={cn("group", resizingSpanKey === spanKey && "select-none")}
                    style={{
                      gridColumn: `span ${Math.min(effectiveSpan, weekDays.length - colIdx)}`,
                    }}
                  >
                    <SpanningJobCard
                      entries={spanItem.entries}
                      job={job}
                      span={effectiveSpan}
                      isAdmin={isAdmin}
                      onRemove={onRemove}
                      pairedEngineers={paired}
                      isFirst={true}
                      isContinuation={false}
                      onResizeStart={onResizeSpan ? (e) => handleResizeStart(e, spanKey, spanItem.jobId, eng.user_id, colIdx, spanItem.entries) : undefined}
                    />
                  </div>
                );
              })}
              {/* Single-day cards */}
              {singleEngEntries.map((entry) => {
                const paired = allEngineers.filter(
                  (e) => e.user_id !== eng.user_id &&
                    schedule.some((s) => s.job_id === entry.job_id && s.engineer_id === e.user_id && s.schedule_date === dateStr)
                );
                return <DraggableScheduleCard key={entry.id} entry={entry} job={getJob(entry.job_id)} isAdmin={isAdmin} onRemove={onRemove} pairedEngineers={paired} />;
              })}
              {cellAdhoc.map((adhoc) => (
                <DraggableAdhocCard key={adhoc.id} entry={adhoc} isAdmin={isAdmin} onRemove={onRemoveAdhoc} />
              ))}
              {/* Partner entries */}
              {partnerEng && (partnerSingleEntries.length > 0 || partnerSpanStartsHere.length > 0 || partnerCellAdhoc.length > 0) && (
                <>
                  {(singleEngEntries.length > 0 || spanStartsHere.length > 0 || cellAdhoc.length > 0) && (
                    <div className="border-t border-primary/30 my-0.5" />
                  )}
                  {partnerSpanStartsHere.map((spanItem) => {
                    const job = getJob(spanItem.jobId);
                    const paired = allEngineers.filter(
                      (e) => e.user_id !== partnerEng.user_id &&
                        schedule.some((s) => s.job_id === spanItem.jobId && s.engineer_id === e.user_id && weekDateStrs.includes(s.schedule_date))
                    );
                    const effectiveSpan = getEffectiveSpan(spanItem);
                    const spanKey = `${spanItem.jobId}-${partnerEng.user_id}`;
                    return (
                      <div key={`pspan-${spanItem.jobId}-${colIdx}`} className={cn("group", resizingSpanKey === spanKey && "select-none")}>
                        <SpanningJobCard
                          entries={spanItem.entries}
                          job={job}
                          span={effectiveSpan}
                          isAdmin={isAdmin}
                          onRemove={onRemove}
                          pairedEngineers={paired}
                          isFirst={true}
                          isContinuation={false}
                          onResizeStart={onResizeSpan ? (e) => handleResizeStart(e, spanKey, spanItem.jobId, partnerEng.user_id, colIdx, spanItem.entries) : undefined}
                        />
                      </div>
                    );
                  })}
                  {partnerSingleEntries.map((entry) => {
                    const paired = allEngineers.filter(
                      (e) => e.user_id !== partnerEng.user_id &&
                        schedule.some((s) => s.job_id === entry.job_id && s.engineer_id === e.user_id && s.schedule_date === dateStr)
                    );
                    return <DraggableScheduleCard key={entry.id} entry={entry} job={getJob(entry.job_id)} isAdmin={isAdmin} onRemove={onRemove} pairedEngineers={paired} />;
                  })}
                  {partnerCellAdhoc.map((adhoc) => (
                    <DraggableAdhocCard key={adhoc.id} entry={adhoc} isAdmin={isAdmin} onRemove={onRemoveAdhoc} />
                  ))}
                </>
              )}
            </>
          );

          return (
            <DroppableCell key={cellId} id={cellId} isToday={isToday} isOver={overId === cellId} isLeave={(isOnLeave || isPartnerOnLeave) && !hasAnyContent || isBankHoliday} colIdx={colIdx}>
              {content}
            </DroppableCell>
          );
        })}
      </div>
    </div>
  );
}
