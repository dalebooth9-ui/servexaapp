import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay } from "date-fns";
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
}: {
  currentDate: Date;
  schedule: ScheduleEntry[];
  jobs: Job[];
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
                    return (
                      <Tooltip key={entry.id}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 truncate">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[job?.priority || "medium"])} />
                            <span className="truncate text-[10px]">{job?.reference_number || "?"}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-semibold">{job?.reference_number} — {job?.name}</p>
                          {job?.customer && <p className="text-muted-foreground">{job.customer}</p>}
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
