import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isPast, parseISO, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  customer: string | null;
  pressure_test_qty: number;
  visual_qty: number;
  other_qty: number;
  other_service_type: string | null;
  site?: { name: string; address: string | null; postcode: string | null } | null;
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-amber-500",
  low: "bg-accent",
};

export default function MonthlyView({
  currentDate,
  schedule,
  jobs,
  optimisedJobOrder = [],
}: {
  currentDate: Date;
  schedule: ScheduleEntry[];
  jobs: Job[];
  optimisedJobOrder?: string[];
}) {
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

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const entries = scheduleByDate[dateStr] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={dateStr}
              className={cn(
                "min-h-[90px] rounded-md border p-1.5 text-xs transition-colors",
                !isCurrentMonth && "opacity-40",
                isToday ? "bg-primary/5 border-primary/30" : "bg-card"
              )}
            >
              <div className={cn("mb-1 font-semibold", isToday && "text-primary")}>
                {format(day, "d")}
              </div>
              {entries.length > 0 && (
                <div className="space-y-0.5">
                  {entries.slice(0, 3).map((entry) => {
                    const job = getJob(entry.job_id);
                    const isOverdue = job?.due_date && isPast(startOfDay(parseISO(job.due_date))) && !isSameDay(parseISO(job.due_date), new Date()) && job.status !== "completed";
                    const dueToday = job?.due_date && isSameDay(parseISO(job.due_date), new Date());
                    return (
                      <Tooltip key={entry.id}>
                        <TooltipTrigger asChild>
                          <div className="space-y-0">
                            <div className="flex items-center gap-1 truncate">
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[job?.priority || "medium"])} />
                              {optimisedJobOrder.length > 0 && optimisedJobOrder.indexOf(entry.job_id) >= 0 && (
                                <span className="text-[9px] font-bold text-primary shrink-0">{optimisedJobOrder.indexOf(entry.job_id) + 1}.</span>
                              )}
                              <span className="truncate text-[10px]">{[job?.site?.name, job?.name].filter(Boolean).join(" – ") || "?"}</span>
                            </div>
                            {job?.due_date && (
                              <div className={cn("text-[9px] font-mono ml-2.5", isOverdue ? "text-destructive font-semibold" : dueToday ? "text-amber-500 font-semibold" : "text-muted-foreground")}>
                                Due {format(parseISO(job.due_date), "dd/MM/yy")}
                              </div>
                            )}
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
                  {entries.length > 3 && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      +{entries.length - 3} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
