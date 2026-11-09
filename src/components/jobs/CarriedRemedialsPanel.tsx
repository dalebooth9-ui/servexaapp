import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { loadCarriedRemedials, type CarriedRemedial } from "@/lib/defectCarryForward";

/** Remedial works carried forward onto this job's visit. Engineers mark each
 *  Done (defect completed) or Not done (stays open, moves to the next visit). */
export default function CarriedRemedialsPanel({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<CarriedRemedial[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const all = await loadCarriedRemedials(jobId);
      setRows(all);
      setComments(c => Object.fromEntries(all.map(r => [r.id, c[r.id] ?? r.carry_comment ?? ""])));
    } catch { setRows([]); }
  };
  useEffect(() => { load(); }, [jobId]);

  const record = async (id: string, done: boolean) => {
    setBusy(id);
    const { data, error } = await (supabase as any).rpc("record_carried_remedial", { p_defect: id, p_done: done, p_comment: comments[id] || null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(done ? "Marked done" : data === "carried" ? "Not done. Carried to the next visit." : "Not done. Kept open for the office.");
    load();
  };

  if (!rows.length) return null;
  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide">
          <Wrench className="h-4 w-4" /> Remedial works outstanding from previous visit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="font-medium">{r.riser || "Site"}: {r.title}</div>
            <div><span className="text-muted-foreground">Works required:</span> {r.works_required || "—"}</div>
            <div><span className="text-muted-foreground">Materials required:</span> {r.materials_required || "—"}</div>
            <Textarea placeholder="Comments" value={comments[r.id] || ""} onChange={e => setComments({ ...comments, [r.id]: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => record(r.id, true)} disabled={busy === r.id}>
                {busy === r.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Done
              </Button>
              <Button size="sm" variant="outline" onClick={() => record(r.id, false)} disabled={busy === r.id}>Not done</Button>
              {r.carry_outcome === "not_done" && <span className="text-xs text-amber-700 dark:text-amber-400">Marked not done</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
