import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Phone, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

type Row = {
  schedule_id: string;
  job_id: string;
  reference_number: string;
  job_name: string;
  customer: string | null;
  engineer_id: string;
  engineer_name: string;
  engineer_phone: string | null;
  acknowledged_at: string | null;
  status: string;
  has_submission: boolean;
};

type Bucket = {
  key: "unacknowledged" | "not_started" | "missed";
  title: string;
  description: string;
  rows: Row[];
};

export default function AtRiskJobsCard() {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<Bucket[]>([]);

  const refresh = async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const now = new Date();
    const hour = now.getHours();

    // 1. Schedules today
    const { data: schedules } = await supabase
      .from("job_schedule")
      .select("id, job_id, engineer_id, acknowledged_at")
      .eq("schedule_date", today);

    if (!schedules || schedules.length === 0) {
      setBuckets([]);
      setLoading(false);
      return;
    }

    const jobIds = [...new Set(schedules.map((s) => s.job_id))];
    const engIds = [...new Set(schedules.map((s) => s.engineer_id))];

    const [{ data: jobs }, { data: profiles }, { data: subs }] = await Promise.all([
      supabase.from("jobs").select("id, name, reference_number, customer, status").in("id", jobIds),
      supabase.from("profiles").select("user_id, full_name, whatsapp_number").in("user_id", engIds),
      supabase.from("submissions").select("job_id, created_at").in("job_id", jobIds).gte("created_at", `${today}T00:00:00`),
    ]);

    const jobMap = new Map((jobs || []).map((j) => [j.id, j]));
    const profMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const subSet = new Set((subs || []).map((s) => s.job_id));

    const rows: Row[] = schedules.map((s: any) => {
      const j: any = jobMap.get(s.job_id);
      const p: any = profMap.get(s.engineer_id);
      return {
        schedule_id: s.id,
        job_id: s.job_id,
        reference_number: j?.reference_number || "—",
        job_name: j?.name || "Untitled",
        customer: j?.customer || null,
        engineer_id: s.engineer_id,
        engineer_name: p?.full_name || "Unknown engineer",
        engineer_phone: p?.whatsapp_number || null,
        acknowledged_at: s.acknowledged_at,
        status: j?.status || "scheduled",
        has_submission: subSet.has(s.job_id),
      };
    });

    const unacknowledged = hour >= 9
      ? rows.filter((r) => !r.acknowledged_at)
      : [];
    const notStarted = hour >= 14
      ? rows.filter((r) => r.acknowledged_at && !r.has_submission && !["in_progress", "completed"].includes(r.status))
      : [];
    const missed = hour >= 17
      ? rows.filter((r) => !r.has_submission && r.status !== "completed")
      : [];

    setBuckets([
      { key: "unacknowledged", title: "Unacknowledged", description: "Engineer hasn't confirmed they've seen the job (after 9am).", rows: unacknowledged },
      { key: "not_started", title: "Not started", description: "Acknowledged but no activity by 2pm.", rows: notStarted },
      { key: "missed", title: "End-of-day at risk", description: "No submissions and not completed by 5pm.", rows: missed },
    ]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const total = buckets.reduce((sum, b) => sum + b.rows.length, 0);
  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking today's jobs…
        </CardContent>
      </Card>
    );
  }
  if (total === 0) return null;

  return (
    <Card className="mb-6 border-amber-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          At-risk jobs today
          <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
            {total}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {buckets.filter((b) => b.rows.length > 0).map((b) => (
          <div key={b.key}>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="text-sm font-semibold">{b.title}</h4>
              <Badge variant="secondary" className="text-[10px]">{b.rows.length}</Badge>
              <p className="text-xs text-muted-foreground ml-1">{b.description}</p>
            </div>
            <div className="space-y-1.5">
              {b.rows.map((r) => (
                <div key={r.schedule_id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{r.reference_number}</span>
                      <span className="font-medium truncate">{r.job_name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.engineer_name}{r.customer ? ` • ${r.customer}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.engineer_phone && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                        <a href={`tel:${r.engineer_phone}`} title="Call engineer">
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Link to={`/jobs/${r.job_id}`}>
                        Open <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
