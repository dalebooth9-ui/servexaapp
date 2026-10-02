import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPen, Pencil } from "lucide-react";
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

export function SiteVisitReportList({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("site_visit_reports").select("id, title, status, updated_at").eq("job_id", jobId).order("updated_at", { ascending: false })
      .then(({ data }) => setRows(((data as any[]) || []) as Row[]));
  }, [jobId]);
  if (!rows.length) return null;
  return (
    <div className="mb-3 space-y-2">
      {rows.map((r) => (
        <button key={r.id} type="button" onClick={() => navigate(`/jobs/${jobId}/site-visit-report/${r.id}`)}
          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted">
          <ClipboardPen className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate text-sm font-medium">Site Visit Report — {r.title || "Untitled"}</span>
          <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
        </button>
      ))}
    </div>
  );
}
