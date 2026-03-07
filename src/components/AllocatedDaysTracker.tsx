import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AllocatedDaysTrackerProps {
  jobId: string;
  allocatedDays: number;
}

export default function AllocatedDaysTracker({ jobId, allocatedDays }: AllocatedDaysTrackerProps) {
  const [daysUsed, setDaysUsed] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("job_schedule")
      .select("schedule_date")
      .eq("job_id", jobId)
      .then(({ data }) => {
        if (!data) return;
        // Count unique dates scheduled
        const uniqueDates = new Set(data.map((r: any) => r.schedule_date));
        setDaysUsed(uniqueDates.size);
      });
  }, [jobId]);

  if (daysUsed === null) return null;

  const remaining = allocatedDays - daysUsed;
  const pct = Math.min(100, Math.round((daysUsed / allocatedDays) * 100));
  const overBudget = daysUsed > allocatedDays;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Days on Job</span>
        <span className={overBudget ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
          {daysUsed} / {allocatedDays} days
          {overBudget
            ? ` (${Math.abs(remaining)} over budget)`
            : remaining === 0
            ? " (budget used)"
            : ` (${remaining} remaining)`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${overBudget ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
