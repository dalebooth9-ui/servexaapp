/**
 * JobCompletionFlagsBadge — admin-only summary of soft-gate reasons logged
 * for THIS job. Renders nothing when there are no flags or the viewer isn't
 * an admin. Keeps the "un-completed jobs with reasons" impossible to miss
 * without adding a new page.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  engineer_id: string;
};

const REASON_LABEL: Record<string, string> = {
  no_access: "No access",
  multi_day: "Multi-day job",
  parts_required: "Parts required",
  office_told_me: "Office told me to",
  other: "Other",
};

export default function JobCompletionFlagsBadge({ jobId, isAdmin }: { jobId: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("job_completion_flags")
      .select("id, reason, note, created_at, engineer_id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [jobId, isAdmin]);

  if (!isAdmin || rows.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {rows.length} completion flag{rows.length === 1 ? "" : "s"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="text-sm font-semibold mb-2">Engineer moved on without completing</p>
        <ul className="space-y-2 max-h-64 overflow-auto">
          {rows.map((r) => (
            <li key={r.id} className="text-xs border-b pb-2 last:border-none">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{REASON_LABEL[r.reason] ?? r.reason}</Badge>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
              </div>
              {r.note && <p className="mt-1 text-muted-foreground">{r.note}</p>}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
