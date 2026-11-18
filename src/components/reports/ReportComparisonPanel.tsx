import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Wrench } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { compareSavedResponse, type ComparisonFlag, type PreviousReport, type PossibleArchive } from "@/lib/reportComparison";

type Item = { responseId: string; orgId: string; title: string; previous: PreviousReport | null; possible: PossibleArchive[]; flags: ComparisonFlag[] };
type Decision = "ok" | "needs_fixing";

/** Loads every submitted report on a job and compares each with last year's. */
export async function loadJobComparisons(jobId: string): Promise<Item[]> {
  const [{ data: job }, { data: rows }] = await Promise.all([
    supabase.from("jobs").select("site_id").eq("id", jobId).maybeSingle(),
    supabase.from("job_sheet_responses").select("id, job_id, template_id, org_id, submitted_at, responses, job_sheet_templates(name, fields)")
      .eq("job_id", jobId).eq("status", "submitted").is("archived_at", null).order("submitted_at"),
  ]);
  const out: Item[] = [];
  const ids = ((rows || []) as any[]).map((r) => r.id);
  const { data: revs } = ids.length
    ? await supabase.from("report_comparison_reviews").select("response_id, flag_key, decision").in("response_id", ids).like("flag_key", "archive_match:%")
    : { data: [] as any[] };
  for (const r of (rows || []) as any[]) {
    const fields = Array.isArray(r.job_sheet_templates?.fields) ? r.job_sheet_templates.fields : [];
    const decisions = Object.fromEntries((revs || []).filter((v: any) => v.response_id === r.id).map((v: any) => [v.flag_key, v.decision]));
    const res = await compareSavedResponse(supabase, r, fields, (job as any)?.site_id ?? null, r.job_sheet_templates?.name ?? null, decisions);
    const loc = res.answers.riser_location ? `${res.answers.riser_location}: ` : "";
    out.push({ responseId: r.id, orgId: r.org_id, title: `${loc}${r.job_sheet_templates?.name || "Report"}`, previous: res.previous, possible: res.possible, flags: res.flags });
  }
  return out;
}

export async function siteRiserCoverage(jobId: string): Promise<{ withData: number; total: number } | null> {
  const { data: job } = await supabase.from("jobs").select("site_id").eq("id", jobId).maybeSingle();
  const siteId = (job as any)?.site_id;
  if (!siteId) return null;
  const { data: risers } = await supabase.from("assets").select("id").eq("site_id", siteId).in("asset_type", ["Dry Riser", "Wet Riser"]);
  const ids = (risers || []).map((a: any) => a.id);
  if (!ids.length) return null;
  let withData = 0;
  for (const id of ids) {
    const { count } = await supabase.from("job_sheet_responses").select("id", { count: "exact", head: true })
      .eq("status", "submitted").neq("job_id", jobId).eq("responses->>riser_asset_id", id);
    if ((count || 0) > 0) withData++;
  }
  return { withData, total: ids.length };
}

export default function ReportComparisonPanel({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [coverage, setCoverage] = useState<{ withData: number; total: number } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setItems(null);
    (async () => {
      try {
        const list = await loadJobComparisons(jobId);
        const ids = list.map((i) => i.responseId);
        const { data: revs } = ids.length
          ? await supabase.from("report_comparison_reviews").select("response_id, flag_key, decision").in("response_id", ids)
          : { data: [] as any[] };
        if (!live) return;
        setDecisions(Object.fromEntries((revs || []).map((r: any) => [`${r.response_id}|${r.flag_key}`, r.decision])));
        setItems(list);
        siteRiserCoverage(jobId).then((c) => live && setCoverage(c)).catch(() => {});
      } catch (e) { if (live) setItems([]); console.warn("[comparison]", e); }
    })();
    return () => { live = false; };
  }, [jobId, reload]);

  const decide = async (item: Item, flag: { key: string }, decision: Decision, after?: () => void) => {
    const k = `${item.responseId}|${flag.key}`;
    setBusy(k);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("report_comparison_reviews").upsert({
      org_id: item.orgId, response_id: item.responseId, previous_response_id: item.previous?.responseId ?? null,
      flag_key: flag.key, decision, decided_by: u.user?.id as string, decided_at: new Date().toISOString(),
    }, { onConflict: "response_id,flag_key" });
    setBusy(null);
    if (error) return toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    setDecisions((d) => ({ ...d, [k]: decision }));
    after?.();
  };

  if (!items) return <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Comparing with last year…</div>;
  if (!items.length) return null;
  return (
    <div className="rounded border p-2 space-y-2 max-h-[38dvh] overflow-auto text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Changes since the previous report</p>
        {coverage && <span className="text-xs text-muted-foreground">{coverage.withData} of {coverage.total} risers on this site have last year's data</span>}
      </div>
      {items.map((item) => (
        <div key={item.responseId} className="space-y-1">
          <p className="text-xs font-medium">{item.title}
            {item.previous && <span className="text-muted-foreground font-normal"> — Compared with report dated {item.previous.date ? format(new Date(item.previous.date), "dd/MM/yyyy") : "unknown date"}{item.previous.source === "archive" ? ` (paper/PDF archive: ${item.previous.fileName})` : item.previous.jobReference ? ` (${item.previous.jobReference})` : ""}</span>}
          </p>
          {item.possible.slice(0, 1).map((p) => (
            <div key={p.id} className="rounded bg-muted p-2 text-xs space-y-1">
              <p>Possible previous report found: <b>{p.fileName}</b>{p.siteName ? ` — ${p.siteName}` : ""}{p.date ? `, dated ${format(new Date(p.date), "dd/MM/yyyy")}` : ""}. Is this the right one?</p>
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs" disabled={!!busy} onClick={() => decide(item, { key: `archive_match:${p.id}` }, "ok", () => setReload((n) => n + 1))}>Yes</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busy} onClick={() => decide(item, { key: `archive_match:${p.id}` }, "needs_fixing", () => setReload((n) => n + 1))}>No</Button>
              </div>
            </div>
          ))}
          {!item.previous ? <p className="text-xs text-muted-foreground">No previous report to compare with</p>
            : item.flags.length === 0 ? <p className="text-xs text-primary flex items-center gap-1"><Check className="h-3 w-3" />Matches the previous report</p>
            : item.flags.map((f) => {
              const k = `${item.responseId}|${f.key}`; const d = decisions[k];
              return (
                <div key={f.key} className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-1 border-t pt-1">
                  <div className="min-w-0">
                    <p className="text-xs"><Badge variant={f.level === "check" ? "destructive" : f.level === "unclear" ? "outline" : "secondary"} className="mr-1 text-[10px]">{f.level === "check" ? "Check" : f.level === "unclear" ? "Unclear" : "Note"}</Badge>{f.label}</p>
                    <p className="text-xs text-muted-foreground">Last year: <b>{f.previous || "—"}</b> · This year: <b>{f.current || "blank"}</b> · {f.reason}</p>
                  </div>
                  <div className="flex gap-1 items-start">
                    <Button size="sm" variant={d === "ok" ? "default" : "outline"} className="h-7 text-xs" disabled={busy === k} onClick={() => decide(item, f, "ok")}><Check className="h-3 w-3 mr-1" />OK, this is correct</Button>
                    <Button size="sm" variant={d === "needs_fixing" ? "destructive" : "outline"} className="h-7 text-xs" disabled={busy === k} onClick={() => decide(item, f, "needs_fixing")}><Wrench className="h-3 w-3 mr-1" />Needs fixing</Button>
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
