import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing } from "lucide-react";

/** Office dashboard: job follow-up reminders that are due (today or earlier) and not done. */
export default function FollowUpsDue() {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data } = await supabase.from("job_follow_ups").select("id, due_date, note, job_id, jobs(reference_number, name)")
      .is("done_at", null).lte("due_date", today).order("due_date").limit(50);
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  if (!rows?.length) return null;
  const done = async (id: string) => { await supabase.from("job_follow_ups").update({ done_at: new Date().toISOString() } as any).eq("id", id); load(); };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-primary" />Follow-ups due ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" aria-label={`Mark done: ${r.note}`} onChange={() => done(r.id)} />
            <span className="font-mono text-xs text-muted-foreground">{format(new Date(`${r.due_date}T12:00:00`), "dd/MM/yyyy")}</span>
            <Link to={`/jobs/${r.job_id}`} className="font-medium text-primary hover:underline">{r.jobs?.reference_number}</Link>
            <span className="break-words">{r.note}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
