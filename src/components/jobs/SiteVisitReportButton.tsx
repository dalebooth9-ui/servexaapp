import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPen, Pencil, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dateFormat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Row = { id: string; title: string; status: string; updated_at: string };

/** "Site Visit Report" entry on any job, plus Continue links for existing ones. */
export default function SiteVisitReportButton({ jobId, prominent = false }: { jobId: string; prominent?: boolean }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    supabase
      .from("site_visit_reports")
      .select("id, title, status, updated_at")
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setRows(((data as any[]) || []) as Row[]));
  }, [jobId]);

  return (
    <div className={prominent ? "space-y-2" : "contents"}>
      <Button
        variant="outline"
        size={prominent ? "lg" : "sm"}
        className={prominent ? "w-full h-12 gap-2 text-base" : "gap-1.5"}
        onClick={() => navigate(`/jobs/${jobId}/site-visit-report/new`)}
      >
        <ClipboardPen className={prominent ? "h-5 w-5" : "h-4 w-4"} /> Site Visit Report
      </Button>
      {prominent && rows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate(`/jobs/${jobId}/site-visit-report/${r.id}`)}
          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted"
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate text-sm font-medium">{r.title || "Untitled Site Visit Report"}</span>
          <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
        </button>
      ))}
    </div>
  );
}

type ListRow = { id: string; title: string; status: string; visit_date: string; version: number; recommendations: any; return_visit_required: boolean; parts_required: string | null };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", reviewed: "Reviewed", approved: "Approved" };

/** "Site Visit Reports" list on the job page, plus a return-visit flag for the office. */
export function SiteVisitReportList({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ListRow[]>([]);
  useEffect(() => {
    const load = () => supabase.from("site_visit_reports")
      .select("id, title, status, visit_date, version, recommendations, return_visit_required, parts_required")
      .eq("job_id", jobId).order("visit_date", { ascending: false })
      .then(({ data }) => setRows(((data as any[]) || []) as ListRow[]));
    load();
    const ch = supabase.channel(`svr-list-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_visit_reports", filter: `job_id=eq.${jobId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [jobId]);
  if (!rows.length) return null;
  const returns = rows.filter((r) => r.return_visit_required);
  return (
    <div className="mb-3 space-y-3">
      {returns.map((r) => (
        <div key={`rv-${r.id}`} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Return visit needed</p>
            <p>Parts needed: {r.parts_required?.trim() || "none listed"}</p>
            <p className="text-xs text-muted-foreground">From "{r.title || "Untitled"}". Order parts and book the visit in – no job has been created automatically.</p>
          </div>
        </div>
      ))}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Site Visit Reports</h3>
        {rows.map((r) => {
          const recs = Array.isArray(r.recommendations) ? r.recommendations : [];
          const open = recs.filter((x: any) => x?.status !== "done").length;
          return (
            <button key={r.id} type="button" onClick={() => navigate(`/jobs/${jobId}/site-visit-report/${r.id}`)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted">
              <ClipboardPen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium">{r.title || "Untitled"}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(r.visit_date)} · v{r.version} · {open} open recommendation{open === 1 ? "" : "s"}
                </span>
              </span>
              <Badge variant={r.status === "approved" ? "default" : "secondary"}>{STATUS_LABEL[r.status] || r.status}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
