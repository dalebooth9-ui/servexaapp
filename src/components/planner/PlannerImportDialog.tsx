import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { plainError } from "@/lib/plainError";
import { readExcelFile } from "@/lib/excelUtils";
import { toDrafts, draftProblem, type DraftEntry, type ImportSite } from "@/lib/plannerImport";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; engineers: { user_id: string; full_name: string }[]; onCreated: () => void }

const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

export default function PlannerImportDialog({ open, onOpenChange, engineers, onCreated }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<DraftEntry[] | null>(null);
  const [sites, setSites] = useState<(ImportSite & { customer_id: string | null })[]>([]);
  useEffect(() => { if (open) { setDrafts(null); setText(""); setFile(null); } }, [open]);

  const read = async () => {
    setBusy(true);
    try {
      let body: any = {};
      if (file && file.type.startsWith("image/")) body = { image: await toB64(file), mime: file.type };
      else if (file) body = { text: (await readExcelFile(file)).map((r) => r.filter(Boolean).join(" | ")).filter(Boolean).join("\n") };
      else body = { text };
      const [{ data, error }, s] = await Promise.all([
        supabase.functions.invoke("parse-planner-import", { body }),
        (async () => { const all: any[] = []; for (let f = 0; ; f += 1000) { const { data } = await supabase.from("sites").select("id, name, postcode, customer_id").is("deleted_at", null).range(f, f + 999); all.push(...(data || [])); if (!data || data.length < 1000) break; } return all; })(),
      ]);
      if (error) throw new Error((await (error as any).context?.json?.().catch(() => null))?.error || error.message);
      if (data?.error) throw new Error(data.error);
      setSites(s);
      const d = toDrafts(data.lines || [], s, engineers);
      if (!d.length) toast.info("No job lines found"); setDrafts(d);
    } catch (e) { toast.error("Could not read it", { description: plainError(e) }); }
    finally { setBusy(false); }
  };

  const upd = (i: number, patch: Partial<DraftEntry>) => setDrafts((ds) => ds!.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  const create = async () => {
    if (!drafts) return;
    const rows = drafts.filter((d) => d.include);
    const bad = rows.find((d) => draftProblem(d));
    if (bad) { toast.error("Some ticked lines need fixing", { description: `${bad.raw || bad.site}: ${draftProblem(bad)}` }); return; }
    setBusy(true);
    let made = 0;
    try {
      const { data: u } = await supabase.auth.getUser();
      for (const d of rows) {
        const site = sites.find((s) => s.id === d.site_id)!;
        const qty = d.quantity && d.quantity > 0 ? d.quantity : 1;
        const isPT = /press|test|\bpt\b/i.test(d.job_type) && !/visual/i.test(d.job_type);
        const isVis = /visual|vis\b/i.test(d.job_type);
        const { data: job, error } = await supabase.from("jobs").insert({
          name: [d.quantity ? `x${d.quantity}` : "", d.job_type || "Visit", "-", site.name].filter(Boolean).join(" "),
          site_id: site.id, customer_id: site.customer_id, customer: d.company || null, status: "active",
          pressure_test_qty: isPT ? qty : 0, visual_qty: isVis ? qty : 0,
          other_qty: !isPT && !isVis ? qty : 0, other_service_type: !isPT && !isVis ? (d.job_type || null) : null,
          time_window: d.time_window || null, brief: d.comments || null, target_month: d.date ? null : `${d.target_month}-01`,
          created_by: u.user?.id, source: "planner_import",
        } as any).select("id").single();
        if (error) throw error;
        if (d.date && d.engineer_id) {
          const { error: se } = await supabase.from("job_schedule").insert({ job_id: job.id, engineer_id: d.engineer_id, schedule_date: d.date, notes: d.comments || null, created_by: u.user?.id } as any);
          if (se) throw se;
        }
        made++;
      }
      toast.success(`${made} planner entr${made === 1 ? "y" : "ies"} created`);
      onCreated(); onOpenChange(false);
    } catch (e) { toast.error(`Stopped after ${made} entr${made === 1 ? "y" : "ies"}`, { description: plainError(e) }); if (made) onCreated(); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import from photo / paste</DialogTitle></DialogHeader>
        {!drafts ? (
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="imp-file">Photo of a weekly sheet or whiteboard, or a spreadsheet</Label>
              <Input id="imp-file" type="file" accept="image/*,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
            <div className="space-y-1"><Label htmlFor="imp-text">…or paste lines</Label>
              <Textarea id="imp-text" rows={6} disabled={!!file} placeholder={"Brondesbury Park x1 test\nMts Walford x1 test early 7am"} value={text} onChange={(e) => setText(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Nothing is created until you check the table and press Create entries.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Check each line. Amber rows were hard to read or didn't match a site/engineer.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="p-1">Use</th><th className="p-1">As written</th><th className="p-1">Company</th><th className="p-1">Site</th><th className="p-1">Job type</th><th className="p-1">Qty</th><th className="p-1">Date</th><th className="p-1">or month</th><th className="p-1">Engineer</th><th className="p-1">Time</th><th className="p-1">Comments</th></tr></thead>
                <tbody>{drafts.map((d, i) => {
                  const prob = draftProblem(d);
                  return (
                    <tr key={i} className={`border-t align-top ${d.confidence === "low" ? "bg-amber-500/10" : ""}`}>
                      <td className="p-1"><input type="checkbox" aria-label={`Use line ${i + 1}`} checked={d.include} onChange={(e) => upd(i, { include: e.target.checked })} /></td>
                      <td className="p-1 max-w-40">{d.raw}{d.confidence === "low" && <Badge variant="outline" className="ml-1 border-amber-500 text-amber-700 text-[10px]">Check</Badge>}{d.include && prob && <p className="text-destructive">{prob}</p>}</td>
                      <td className="p-1"><Input className="h-8 text-xs w-32" value={d.company} onChange={(e) => upd(i, { company: e.target.value })} /></td>
                      <td className="p-1">
                        <select aria-label={`Site for line ${i + 1}`} className="h-8 w-44 rounded border bg-background text-xs" value={d.site_id || ""} onChange={(e) => upd(i, { site_id: e.target.value || null, site_new: !e.target.value })}>
                          <option value="">{d.site ? `New site? "${d.site}"` : "Pick site…"}</option>
                          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.postcode ? ` — ${s.postcode}` : ""}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><Input className="h-8 text-xs w-28" value={d.job_type} onChange={(e) => upd(i, { job_type: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 text-xs w-14" type="number" min={1} value={d.quantity ?? ""} onChange={(e) => upd(i, { quantity: e.target.value ? parseInt(e.target.value) : null })} /></td>
                      <td className="p-1"><Input className="h-8 text-xs w-36" type="date" value={d.date} onChange={(e) => upd(i, { date: e.target.value, target_month: e.target.value ? "" : d.target_month })} /></td>
                      <td className="p-1"><Input className="h-8 text-xs w-32" type="month" value={d.target_month} disabled={!!d.date} onChange={(e) => upd(i, { target_month: e.target.value })} /></td>
                      <td className="p-1">
                        <select aria-label={`Engineer for line ${i + 1}`} className="h-8 w-32 rounded border bg-background text-xs" value={d.engineer_id || ""} onChange={(e) => upd(i, { engineer_id: e.target.value || null })}>
                          <option value="">{d.engineer ? `"${d.engineer}"?` : "—"}</option>
                          {engineers.map((e) => <option key={e.user_id} value={e.user_id}>{e.full_name}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><Input className="h-8 text-xs w-24" value={d.time_window} onChange={(e) => upd(i, { time_window: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-8 text-xs w-40" value={d.comments} onChange={(e) => upd(i, { comments: e.target.value })} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">New sites aren't created here — add them on the Sites page first, then pick them. Lines with a month only become provisional bookings.</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          {!drafts ? <Button onClick={read} disabled={busy || (!file && !text.trim())}>{busy ? "Reading…" : "Read lines"}</Button> : <>
            <Button variant="outline" onClick={() => setDrafts(null)} disabled={busy}>Start again</Button>
            <Button onClick={create} disabled={busy || !drafts.some((d) => d.include)}>{busy ? "Creating…" : `Create entries (${drafts.filter((d) => d.include).length})`}</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
