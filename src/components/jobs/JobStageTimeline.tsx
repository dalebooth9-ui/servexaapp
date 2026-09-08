import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Read-only horizontal stage indicator for a job.
 * Every stage is derived from data that already exists — nothing is stored for it.
 */

const STAGES = [
  "Booked",
  "Scheduled",
  "On site",
  "Report complete",
  "Reviewed",
  "Sent to customer",
  "Invoiced",
] as const;

export default function JobStageTimeline({ jobId, status }: { jobId: string; status: string }) {
  const [done, setDone] = useState<Record<string, boolean>>({ Booked: true });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [sched, sheets, subs, emails, invoices] = await Promise.all([
        supabase.from("job_schedule").select("id").eq("job_id", jobId).limit(1),
        supabase.from("job_sheet_responses").select("id, status, submitted_at, last_amended_at").eq("job_id", jobId),
        supabase.from("submissions").select("id").eq("job_id", jobId).limit(1),
        supabase.from("job_emails").select("id").eq("job_id", jobId).eq("direction", "outbound").limit(1),
        supabase.from("invoices").select("id").eq("job_id", jobId).eq("document_type", "invoice").limit(1),
      ]);

      const sheetRows = sheets.data || [];
      const reportComplete = sheetRows.some((r: any) => !!r.submitted_at || r.status === "submitted" || r.status === "approved");
      const reviewed =
        sheetRows.some((r: any) => r.status === "approved" || !!r.last_amended_at) ||
        ["completed", "archived"].includes(status);

      if (!mounted) return;
      setDone({
        Booked: true,
        Scheduled: (sched.data || []).length > 0 || ["scheduled", "in_progress", "pending_review", "completed", "archived"].includes(status),
        "On site": (subs.data || []).length > 0 || sheetRows.length > 0 || ["in_progress", "pending_review", "completed", "archived"].includes(status),
        "Report complete": reportComplete,
        Reviewed: reviewed,
        "Sent to customer": (emails.data || []).length > 0,
        Invoiced: (invoices.data || []).length > 0,
      });
    };
    load();
    return () => { mounted = false; };
  }, [jobId, status]);

  // The current stage is the last completed one.
  const lastDoneIdx = STAGES.reduce((acc, s, i) => (done[s] ? i : acc), 0);

  return (
    <div className="mb-6 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1" aria-label="Job progress">
        {STAGES.map((stage, i) => {
          const complete = !!done[stage];
          const current = i === lastDoneIdx;
          return (
            <li key={stage} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                  complete
                    ? current
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                {complete && <Check className="h-3 w-3" />}
                {stage}
              </div>
              {i < STAGES.length - 1 && (
                <span className={cn("h-px w-4", complete ? "bg-primary/40" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
