import { useMemo } from "react";
import { format, isSameDay, isPast, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { X, GripVertical, AlertTriangle } from "lucide-react";
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
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

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
};

function extractPostcodeArea(job: Job): string {
  // Prefer site postcode
  if (job.site?.postcode) {
    const match = job.site.postcode.match(/([A-Z]{1,2}\d)/i);
    return match ? match[1].toUpperCase() : job.site.postcode.toUpperCase();
  }
  if (!job.address) return "No area";
  const match = job.address.match(/([A-Z]{1,2}\d)/i);
  return match ? match[1].toUpperCase() : "No area";
}

// Draggable job card for the unallocated sidebar
function DraggableUnallocatedJob({ job }: { job: Job }) {
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
        isOverdue ? "border-l-destructive bg-destructive/10 ring-2 ring-destructive/50" : isDueToday ? "border-l-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40" : PRIORITY_BG[job.priority] || "border-l-muted",
        isDragging && "opacity-30"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-medium text-primary">{job.reference_number}</span>
        {isOverdue ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground">
            <AlertTriangle className="h-2.5 w-2.5" /> OVERDUE
          </span>
        ) : isDueToday ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            DUE TODAY
          </span>
        ) : job.due_date ? (
          <span className="text-[9px] font-mono text-muted-foreground">
            Due {format(new Date(job.due_date), "dd/MM/yy")}
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
      {(job.pressure_test_qty > 0 || job.visual_qty > 0 || (job.other_qty > 0 && job.other_service_type)) && (
        <div className="flex flex-wrap gap-1 mt-0.5">
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
  );
}

// Draggable scheduled entry card
function DraggableScheduleCard({
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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative rounded-md border-l-4 bg-card p-1.5 text-[11px] shadow-sm",
        PRIORITY_BG[job.priority] || "border-l-muted",
        isDragging && "opacity-30",
        isAdmin && "cursor-grab"
      )}
    >
      <div className="flex items-start gap-1">
        {isAdmin && (
          <span {...attributes} {...listeners} className="mt-0.5 shrink-0 text-muted-foreground">
            <GripVertical className="h-3 w-3" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <Link to={`/jobs/${job.id}`} className="font-mono font-semibold text-primary hover:underline">
              {job.reference_number}
            </Link>
            {STATUS_INDICATOR[job.status] && (
              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none", STATUS_INDICATOR[job.status].class)}>
                {STATUS_INDICATOR[job.status].label}
              </span>
            )}
          </div>
          <div className="truncate text-foreground">{job.name}</div>
          {job.due_date && (() => {
            const isOverdue = isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date());
            const dueToday = isSameDay(parseISO(job.due_date), new Date());
            return (
              <div className={cn("text-[9px] font-mono font-semibold", isOverdue ? "text-destructive" : dueToday ? "text-amber-500" : "text-muted-foreground")}>
                Due {format(parseISO(job.due_date), "dd/MM/yy")}
              </div>
            );
          })()}
          {(job.site?.name || job.site?.postcode) && (
            <div className="truncate text-muted-foreground text-[10px]">
              📍 {job.site.name}{job.site.postcode ? ` · ${job.site.postcode}` : ""}
            </div>
          )}
          {entry.notes && <div className="truncate text-muted-foreground italic">{entry.notes}</div>}
          {(job.pressure_test_qty > 0 || job.visual_qty > 0 || (job.other_qty > 0 && job.other_service_type)) && (
            <div className="flex flex-wrap gap-1 mt-0.5">
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
            onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
            className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
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
}: {
  id: string;
  children: React.ReactNode;
  isToday: boolean;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[80px] rounded-md border p-1.5 space-y-1 transition-colors",
        isToday && "bg-primary/5 border-primary/20",
        isOver && "bg-primary/10 border-primary ring-1 ring-primary/30",
        !isToday && !isOver && "bg-card"
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
  isAdmin,
  onAssign,
  onMove,
  onRemove,
  onEngineerReorder,
}: {
  weekDays: Date[];
  engineers: Engineer[];
  schedule: ScheduleEntry[];
  jobs: Job[];
  unallocatedJobs: Job[];
  isAdmin: boolean;
  onAssign: (jobId: string, engineerId: string, date: string) => Promise<void>;
  onMove: (entryId: string, newEngineerId: string, newDate: string) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
  onEngineerReorder: (newOrder: string[]) => void;
}) {
  const [activeItem, setActiveItem] = useState<any>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const getJob = (id: string) => jobs.find((j) => j.id === id);

  // Group unallocated jobs: overdue first (sorted by due_date asc), then by postcode area
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
    // Sort overdue by due_date ascending (most overdue first)
    overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    // Group rest by postcode area, sorted by due_date then created_at
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
    if (!over) return;

    const targetId = over.id as string;

    // Engineer row reorder (sortable items have engineer user_id as id)
    const activeData = active.data.current;
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
    }
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
                              <DraggableUnallocatedJob key={job.id} job={job} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
                return (
                  <div key={d.toISOString()} className={cn(
                    "rounded-md px-2 py-1 text-center text-xs font-semibold",
                    isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}>
                    <div>{format(d, "EEE")}</div>
                    <div className="text-[10px]">{format(d, "dd/MM")}</div>
                  </div>
                );
              })}
            </div>

            {/* Engineer rows — sortable by admin */}
            <ScrollArea className="h-[calc(100vh-320px)]">
              <SortableContext items={engineers.map((e) => e.user_id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {engineers.map((eng) => (
                    <SortableEngineerRow
                      key={eng.user_id}
                      eng={eng}
                      weekDays={weekDays}
                      schedule={schedule}
                      overId={overId}
                      isAdmin={isAdmin}
                      getJob={getJob}
                      onRemove={onRemove}
                    />
                  ))}
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
      </DragOverlay>
    </DndContext>
  );
}

// Sortable engineer row
function SortableEngineerRow({
  eng,
  weekDays,
  schedule,
  overId,
  isAdmin,
  getJob,
  onRemove,
}: {
  eng: Engineer;
  weekDays: Date[];
  schedule: ScheduleEntry[];
  overId: string | null;
  isAdmin: boolean;
  getJob: (id: string) => Job | undefined;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: eng.user_id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const engEntries = schedule.filter((s) => s.engineer_id === eng.user_id);
  const totalJobs = engEntries.length;
  const todayJobs = schedule.filter(
    (s) => s.engineer_id === eng.user_id && s.schedule_date === format(new Date(), "yyyy-MM-dd")
  ).length;
  const available = todayJobs === 0;

  const totalPT = engEntries.reduce((sum, s) => {
    const job = getJob(s.job_id);
    return sum + (job?.pressure_test_qty || 0);
  }, 0);
  const totalVis = engEntries.reduce((sum, s) => {
    const job = getJob(s.job_id);
    return sum + (job?.visual_qty || 0);
  }, 0);
  const totalOther = engEntries.reduce((sum, s) => {
    const job = getJob(s.job_id);
    return sum + (job?.other_qty || 0);
  }, 0);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, gridTemplateColumns: `140px repeat(${weekDays.length}, 1fr)` }}
      className="grid gap-1"
    >
      <div className="flex items-center gap-1 px-2 text-sm font-medium truncate">
          {isAdmin && (
            <span
              {...attributes}
              {...listeners}
              className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
              title="Drag to reorder"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="truncate">{eng.full_name}</span>
          <span
            className={cn(
              "shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none",
              available
                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                : todayJobs >= 3
                  ? "bg-destructive/20 text-destructive"
                  : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
            )}
            title={`${totalJobs} jobs this period, ${todayJobs} today`}
          >
            {available ? "Free" : `${todayJobs} today`}
          </span>
          {(totalPT > 0 || totalVis > 0 || totalOther > 0) && (
            <div className="flex items-center gap-0.5 flex-wrap">
              {totalPT > 0 && <span className="inline-flex items-center rounded bg-primary/10 border border-primary/20 text-primary px-1 py-0.5 text-[9px] font-semibold leading-none">PT×{totalPT}</span>}
              {totalVis > 0 && <span className="inline-flex items-center rounded bg-secondary border border-border text-secondary-foreground px-1 py-0.5 text-[9px] font-semibold leading-none">Vis×{totalVis}</span>}
              {totalOther > 0 && <span className="inline-flex items-center rounded bg-accent border border-border text-accent-foreground px-1 py-0.5 text-[9px] font-semibold leading-none">×{totalOther}</span>}
            </div>
          )}
        </div>
        {weekDays.map((d) => {
          const dateStr = format(d, "yyyy-MM-dd");
          const cellId = `cell-${eng.user_id}_${dateStr}`;
          const cellEntries = schedule.filter(
            (s) => s.engineer_id === eng.user_id && s.schedule_date === dateStr
          );
          const isToday = isSameDay(d, new Date());
          return (
            <DroppableCell key={cellId} id={cellId} isToday={isToday} isOver={overId === cellId}>
              {cellEntries.map((entry) => (
                <DraggableScheduleCard
                  key={entry.id}
                  entry={entry}
                  job={getJob(entry.job_id)}
                  isAdmin={isAdmin}
                  onRemove={onRemove}
                />
              ))}
            </DroppableCell>
          );
        })}
    </div>
  );
}
