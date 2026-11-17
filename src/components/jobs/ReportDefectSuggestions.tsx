import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { suggestDefectsFromReport, type DefectSuggestion } from "@/lib/reportDefectSuggestions";

type Pending = { responseId: string; reportName: string; riser: string | null; items: DefectSuggestion[] };

/** Shows possible defects found in a job's submitted reports for one-tap confirmation. */
export default function ReportDefectSuggestions({ jobId, onCreated }: { jobId: string; onCreated: () => void }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [charge, setCharge] = useState<Record<string, string>>({}); // "" = chargeable, else no-charge reason
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: resps } = await supabase
      .from("job_sheet_responses")
      .select("id, responses, status, template:job_sheet_templates(name)")
      .eq("job_id", jobId)
      .in("status", ["submitted", "completed", "filed"])
      .order("updated_at", { ascending: false });
    const ids = (resps || []).map((r: any) => r.id);
    if (!ids.length) { setPending([]); return; }
    const [{ data: existing }, { data: dismissed }] = await Promise.all([
      supabase.from("defects").select("source_response_id, source_key").eq("job_id", jobId).not("source_key", "is", null),
      supabase.from("report_defect_dismissals").select("response_id, source_key").in("response_id", ids),
    ]);
    const done = new Set([
      ...(existing || []).map((d: any) => `${d.source_response_id}|${d.source_key}`),
      ...(dismissed || []).map((d: any) => `${d.response_id}|${d.source_key}`),
    ]);
    // Same problem already raised from another report on this job (e.g. a resubmitted copy).
    const jobKeys = new Set((existing || []).map((d: any) => d.source_key));
    const out: Pending[] = [];
    const tick: Record<string, boolean> = {};
    const shown = new Set<string>();
    for (const r of resps as any[]) {
      const items = suggestDefectsFromReport(r.responses).filter(s => !done.has(`${r.id}|suggest:${s.key}`) && !jobKeys.has(`suggest:${s.key}`) && !shown.has(s.key));
      items.forEach(s => shown.add(s.key));
      if (!items.length) continue;
      items.forEach(s => { tick[`${r.id}|${s.key}`] = true; });
      const resp = r.responses || {};
      out.push({ responseId: r.id, reportName: r.template?.name || "Report", riser: resp.riser_location || null, items });
    }
    setTicked(tick);
    setPending(out);
  };

  useEffect(() => { void load(); }, [jobId]);

  const confirm = async (p: Pending) => {
    setBusy(p.responseId);
    const chosen = p.items.filter(s => ticked[`${p.responseId}|${s.key}`]);
    const skipped = p.items.filter(s => !ticked[`${p.responseId}|${s.key}`]).map(s => s.key);
    const { data, error } = await supabase.rpc("confirm_report_defect_suggestions" as any, {
      _response_id: p.responseId,
      _items: chosen.map(s => ({
        key: s.key, title: s.title, description: s.description, works_required: s.works_required,
        materials_required: s.materials_required, photo: s.photo, location: p.riser,
        chargeable: charge[`${p.responseId}|${s.key}`] === undefined,
        no_charge_reason: charge[`${p.responseId}|${s.key}`] || null,
      })),
      _dismiss: skipped,
    });
    setBusy(null);
    if (error) { toast.error(`Couldn't add the defects: ${error.message}`); return; }
    toast.success(`${data ?? chosen.length} defect${chosen.length === 1 ? "" : "s"} added`);
    await load();
    onCreated();
  };

  if (!pending.length) return null;
  return (
    <div className="space-y-3">
      {pending.map(p => (
        <div key={p.responseId} className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            We found {p.items.length} possible defect{p.items.length === 1 ? "" : "s"} from this report
            <span className="text-xs font-normal text-muted-foreground">({p.reportName}{p.riser ? ` · ${p.riser}` : ""})</span>
          </p>
          {p.items.map(s => {
            const k = `${p.responseId}|${s.key}`;
            return (
              <div key={k} className="rounded border bg-background p-2 space-y-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={!!ticked[k]} onCheckedChange={v => setTicked(t => ({ ...t, [k]: !!v }))} className="mt-0.5" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">Works: {s.works_required}{s.materials_required ? ` · Materials: ${s.materials_required}` : ""}{s.photoCaption ? ` · Photo: "${s.photoCaption}"` : ""}</p>
                </div>
              </label>
              <div className="flex flex-wrap items-center gap-1 pl-6">
                <Button type="button" size="sm" variant={charge[k] === undefined ? "default" : "outline"} className="h-7 text-xs"
                  onClick={() => setCharge(c => { const n = { ...c }; delete n[k]; return n; })}>Chargeable</Button>
                {["Our install", "Engineer error"].map(reason => (
                  <Button key={reason} type="button" size="sm" variant={charge[k] === reason ? "default" : "outline"} className="h-7 text-xs"
                    onClick={() => setCharge(c => ({ ...c, [k]: reason }))}>No charge ({reason.toLowerCase()})</Button>
                ))}
              </div>
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button size="sm" disabled={busy === p.responseId} onClick={() => confirm(p)}>
              {busy === p.responseId ? "Adding…" : "Add ticked defects"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Unticked suggestions are dismissed for this report.</p>
        </div>
      ))}
    </div>
  );
}
