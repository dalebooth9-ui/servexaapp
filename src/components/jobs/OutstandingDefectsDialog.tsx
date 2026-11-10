import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ClipboardPlus } from "lucide-react";
import { toast } from "sonner";
import { attachmentMessage, suggestWorksAndMaterials, type DefectAttachmentResult } from "@/lib/defectCarryForward";

type Row = { id: string; title: string; description: string | null; site_id: string | null; works_required: string | null; materials_required: string | null; scheduled_job_id: string | null };
export default function OutstandingDefectsDialog({ jobId, siteId, onAdded }: { jobId: string; siteId: string | null; onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DefectAttachmentResult[]>([]);
  useEffect(() => {
    if (!open) return;
    setBusy(true); setResults([]); setSelected(new Set());
    supabase.rpc("outstanding_defects_for_job", { p_job: jobId }).then(({ data, error }) => {
      setBusy(false);
      if (error) { toast.error(`Could not load outstanding defects: ${error.message}`); return; }
      setRows((data || []).map(r => { const s = suggestWorksAndMaterials(r.title, r.description); return { ...r, works_required: r.works_required ?? s.works, materials_required: r.materials_required ?? s.materials }; }));
    });
  }, [open, jobId]);
  const save = async () => {
    setBusy(true);
    try {
      for (const r of rows.filter(r => selected.has(r.id))) {
        const { error } = await supabase.from("defects").update({ works_required: r.works_required, materials_required: r.materials_required }).eq("id", r.id);
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc("attach_defects_to_job", { p_defect_ids: [...selected], p_job: jobId });
      if (error) throw error;
      setResults(data || []); onAdded?.(); window.dispatchEvent(new CustomEvent("carried-defects-changed", { detail: { jobId } }));
    } catch (e: any) { toast.error(e.message || "Could not add outstanding defects"); }
    finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><ClipboardPlus className="mr-1.5 h-4 w-4" />Add outstanding defects</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Add outstanding defects</DialogTitle></DialogHeader>
      {busy && <Loader2 className="h-5 w-5 animate-spin" />}
      {!busy && !rows.length && <p className="text-sm text-muted-foreground">No outstanding defects for this customer or site.</p>}
      {rows.map(r => <div key={r.id} className="border-b py-3 space-y-2">
        <label className="flex items-start gap-3"><Checkbox aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); if (checked) next.add(r.id); else next.delete(r.id); return next; })} /><span className="text-sm font-medium">{r.title}</span></label>
        {r.site_id !== siteId && <p className="text-sm text-muted-foreground">Different or missing site — selecting confirms adding to this job.</p>}
        {r.scheduled_job_id === jobId && <p className="text-xs text-primary">Already on this job's service report</p>}
        <label className="block text-xs">Works required<Textarea value={r.works_required || ""} onChange={e => setRows(prev => prev.map(x => x.id === r.id ? { ...x, works_required: e.target.value } : x))} /></label>
        <label className="block text-xs">Materials required<Textarea value={r.materials_required || ""} onChange={e => setRows(prev => prev.map(x => x.id === r.id ? { ...x, materials_required: e.target.value } : x))} /></label>
        {results.filter(x => x.defect_id === r.id).map(x => <p key={x.defect_id} role="status" className={x.outcome === "scheduled" ? "text-sm text-primary" : "text-sm text-destructive"}>{attachmentMessage(x)}</p>)}
      </div>)}
      <Button disabled={busy || !selected.size} onClick={save}>Add selected to this job's report</Button>
    </DialogContent></Dialog>
  </>;
}