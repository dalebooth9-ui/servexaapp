import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, Hand } from "lucide-react";
import { readOutletChecks, outletSummaryLine, STATUS_LABEL, type OutletChecks } from "@/lib/outletChecks";

type Row = { id: string; job_id: string; when: string; riser: string; assetId: string; total: number; checks: OutletChecks; jobRef?: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Office view of outlet checks per visit, for one job or one riser's history. */
export default function OutletResults({ jobId, assetId }: { jobId?: string; assetId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    (async () => {
      let q = supabase.from("job_sheet_responses").select("id, job_id, responses, submitted_at, updated_at, jobs(reference)").is("archived_at", null);
      if (jobId) q = q.eq("job_id", jobId);
      if (assetId) q = q.filter("responses->>riser_asset_id", "eq", assetId);
      const { data } = await q.order("updated_at", { ascending: false }).limit(200);
      const withChecks = (data || []).filter((r: any) => r.responses?._outlet_checks && r.responses?.riser_asset_id);
      const ids = [...new Set(withChecks.map((r: any) => String(r.responses.riser_asset_id)))];
      const { data: assets } = ids.length ? await supabase.from("assets").select("id, riser_location, asset_tag, outlets_count").in("id", ids) : { data: [] as any[] };
      const byId = new Map((assets || []).map((a: any) => [a.id, a]));
      setRows(withChecks.map((r: any) => {
        const a: any = byId.get(String(r.responses.riser_asset_id)) || {};
        const checks = readOutletChecks(r.responses);
        return {
          id: r.id, job_id: r.job_id, when: r.submitted_at || r.updated_at, assetId: a.id,
          riser: a.riser_location || a.asset_tag || "Riser", jobRef: r.jobs?.reference,
          total: Number(a.outlets_count) || Math.max(0, ...Object.keys(checks).map(Number)), checks,
        };
      }));
    })();
  }, [jobId, assetId]);

  if (rows === null) return <p className="p-4 text-sm text-muted-foreground">Loading outlet checks…</p>;
  if (!rows.length) return jobId ? null : <p className="p-4 text-sm text-muted-foreground">No outlet checks recorded yet.</p>;
  return (
    <div className="space-y-3">
      {jobId && <p className="text-sm font-semibold">Outlet checks</p>}
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40 text-sm">
            <span className="font-medium">{jobId ? r.riser : `${fmt(r.when)}${r.jobRef ? ` · ${r.jobRef}` : ""}`}</span>
            <span className="text-xs text-muted-foreground">{outletSummaryLine(r.total, r.checks)}</span>
            {assetId && <Link className="text-xs underline" to={`/jobs/${r.job_id}`}>Job</Link>}
          </div>
          <ul className="divide-y text-sm">
            {Array.from({ length: r.total }, (_, i) => i + 1).map((n) => {
              const c = r.checks[String(n)];
              return (
                <li key={n} className="flex items-center gap-2 px-3 py-1.5">
                  {c?.status === "scanned" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : c?.status === "manual" ? <Hand className="h-4 w-4" /> : <Circle className="h-4 w-4 text-destructive" />}
                  <span className="w-20">Outlet {n}</span>
                  <span className={c && c.status !== "missing" ? "" : "text-destructive"}>{c ? STATUS_LABEL[c.status] : "Not checked"}</span>
                  <span className="ml-auto text-xs text-muted-foreground text-right">
                    {[c && c.status !== "missing" ? fmt(c.at) : null, c?.by_name, c?.reason].filter(Boolean).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
