import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CompactVisitRow from "./CompactVisitRow";

interface DayPanelJob {
  id: string;
  reference_number: string;
  name: string;
  status: string;
  priority: string;
  site?: { name: string; postcode: string | null } | null;
}

export interface DayPanelEntry {
  id: string;
  job_id: string;
  sort_order: number | null;
  job?: DayPanelJob;
}

function SortableRow({ entry, onRemove }: { entry: DayPanelEntry; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const job = entry.job;
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <CompactVisitRow
        refNumber={job?.reference_number || "—"}
        jobId={job?.id || ""}
        title={job?.name || "Untitled"}
        siteName={job?.site?.name}
        postcode={job?.site?.postcode}
        priority={job?.priority}
        status={job?.status}
        dragHandleProps={listeners}
        onRemove={() => onRemove(entry.id)}
      />
    </div>
  );
}

export default function DayPanel({
  open,
  onOpenChange,
  engineerId,
  engineerName,
  date,
  onRemove,
  onOptimiseRoute,
  onOpenMap,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  engineerId: string;
  engineerName: string;
  date: string; // yyyy-MM-dd
  onRemove: (entryId: string) => Promise<void> | void;
  onOptimiseRoute?: () => void;
  onOpenMap?: () => void;
}) {
  const [entries, setEntries] = useState<DayPanelEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: sched, error } = await supabase
        .from("job_schedule")
        .select("id, job_id, sort_order, created_at")
        .eq("engineer_id", engineerId)
        .eq("schedule_date", date)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) {
        sonnerToast.error("Could not load day");
        setLoading(false);
        return;
      }
      const jobIds = (sched || []).map((s: any) => s.job_id);
      let jobsById: Record<string, DayPanelJob> = {};
      if (jobIds.length > 0) {
        const { data: jobsData } = await supabase
          .from("jobs")
          .select("id, reference_number, name, status, priority, site_id")
          .in("id", jobIds);
        const siteIds = Array.from(new Set((jobsData || []).map((j: any) => j.site_id).filter(Boolean)));
        let sitesById: Record<string, { name: string; postcode: string | null }> = {};
        if (siteIds.length > 0) {
          const { data: sitesData } = await supabase
            .from("sites")
            .select("id, name, postcode")
            .in("id", siteIds);
          (sitesData || []).forEach((s: any) => {
            sitesById[s.id] = { name: s.name, postcode: s.postcode };
          });
        }
        (jobsData || []).forEach((j: any) => {
          jobsById[j.id] = {
            id: j.id,
            reference_number: j.reference_number,
            name: j.name,
            status: j.status,
            priority: j.priority,
            site: j.site_id ? sitesById[j.site_id] : null,
          };
        });
      }
      if (cancelled) return;
      setEntries(
        (sched || []).map((s: any) => ({
          id: s.id,
          job_id: s.job_id,
          sort_order: s.sort_order,
          job: jobsById[s.job_id],
        }))
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, engineerId, date]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(entries, oldIndex, newIndex);
    setEntries(reordered);
    // Persist sort_order
    const updates = reordered.map((e, i) => ({ id: e.id, sort_order: i + 1 }));
    const results = await Promise.all(
      updates.map((u) =>
        supabase.from("job_schedule").update({ sort_order: u.sort_order } as any).eq("id", u.id)
      )
    );
    const failed = results.some((r) => r.error);
    if (failed) sonnerToast.error("Could not save new order");
  };

  const handleRemove = async (id: string) => {
    await onRemove(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const parsed = useMemo(() => {
    try { return parseISO(date); } catch { return new Date(); }
  }, [date]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {engineerName} · {format(parsed, "EEE dd MMM")}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {entries.length} {entries.length === 1 ? "visit" : "visits"}
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex gap-2 mt-2">
          {onOptimiseRoute && (
            <Button size="sm" variant="outline" onClick={onOptimiseRoute}>Optimise route</Button>
          )}
          {onOpenMap && (
            <Button size="sm" variant="outline" onClick={onOpenMap}>View on map</Button>
          )}
        </div>
        <div className="mt-3 flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No visits.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {entries.map((e) => (
                    <SortableRow key={e.id} entry={e} onRemove={handleRemove} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Drag the handle to reorder the day. Order is saved automatically.</p>
      </SheetContent>
    </Sheet>
  );
}
