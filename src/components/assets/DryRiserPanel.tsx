import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Pencil, MoveRight, Merge } from "lucide-react";
import { format } from "date-fns";
import { openStorageRef } from "@/components/assets/openStorageRef";

interface RiserAsset {
  id: string; asset_tag: string | null; riser_location: string | null; outlets_count: number | null; status: string;
  notes: string | null; site_id: string | null; last_inspection_at: string | null; last_inspection_type: string | null;
  last_inspection_result: string | null;
}
interface HistoryRow {
  id: string; inspection_date: string | null; report_date_text: string | null; inspection_type: string | null;
  template_name: string | null; result_summary: string | null; report_link: string | null; report_file: string | null; job_id: string | null;
}
interface DefectRow { id: string; title: string; severity: string; status: string; created_at: string }

const STATUSES = ["operational", "maintenance", "faulty", "decommissioned"];
const fmt = (d: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "—");

/** Dry riser header, history and open defects, plus office edit / move / merge. */
export default function DryRiserPanel({ assetId, isAdmin, onChanged }: { assetId: string; isAdmin: boolean; onChanged?: () => void }) {
  const { toast } = useToast();
  const [a, setA] = useState<RiserAsset | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [form, setForm] = useState({ riser_location: "", outlets_count: "", status: "operational", notes: "" });
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [targetSite, setTargetSite] = useState("");
  const [others, setOthers] = useState<{ id: string; asset_tag: string | null; riser_location: string | null }[]>([]);
  const [mergeId, setMergeId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: asset }, { data: h }, { data: d }] = await Promise.all([
      supabase.from("assets").select("id, asset_tag, riser_location, outlets_count, status, notes, site_id, last_inspection_at, last_inspection_type, last_inspection_result").eq("id", assetId).maybeSingle(),
      supabase.from("asset_service_history").select("id, inspection_date, report_date_text, inspection_type, template_name, result_summary, report_link, report_file, job_id").eq("asset_id", assetId).order("inspection_date", { ascending: false, nullsFirst: false }),
      supabase.from("defects").select("id, title, severity, status, created_at").eq("asset_id", assetId).neq("status", "resolved").order("created_at", { ascending: false }),
    ]);
    setA(asset as any); setHistory((h as any) || []); setDefects((d as any) || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [assetId]);

  if (!a) return null;

  const openEdit = () => {
    setForm({ riser_location: a.riser_location || "", outlets_count: a.outlets_count?.toString() ?? "", status: a.status, notes: a.notes || "" });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    setBusy(true);
    const outlets = form.outlets_count.trim() === "" ? null : parseInt(form.outlets_count, 10);
    if (outlets != null && (isNaN(outlets) || outlets < 0)) { setBusy(false); toast({ title: "Outlets must be a whole number", variant: "destructive" }); return; }
    const { error } = await supabase.from("assets").update({
      riser_location: form.riser_location.trim() || null, outlets_count: outlets, status: form.status, notes: form.notes.trim() || null, updated_at: new Date().toISOString(),
    }).eq("id", a.id);
    setBusy(false);
    if (error) { toast({ title: "Not saved", description: error.message, variant: "destructive" }); return; }
    setEditOpen(false); toast({ title: "Riser updated" }); load(); onChanged?.();
  };
  const openMove = async () => {
    const { data } = await supabase.from("sites").select("id, name").order("name").limit(5000);
    setSites((data as any) || []); setTargetSite(""); setMoveOpen(true);
  };
  const doMove = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("move_asset_site", { _asset_id: a.id, _site_id: targetSite });
    setBusy(false);
    if (error) { toast({ title: "Couldn't move riser", description: error.message, variant: "destructive" }); return; }
    setMoveOpen(false); toast({ title: "Riser moved" }); load(); onChanged?.();
  };
  const openMerge = async () => {
    let q = supabase.from("assets").select("id, asset_tag, riser_location").or("asset_type.ilike.dry%riser%,category.ilike.dry%riser%").neq("id", a.id).neq("status", "decommissioned");
    if (a.site_id) q = q.eq("site_id", a.site_id);
    const { data } = await q.limit(500);
    setOthers((data as any) || []); setMergeId(""); setMergeOpen(true);
  };
  const doMerge = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("merge_assets", { _keep_id: a.id, _remove_id: mergeId });
    setBusy(false);
    if (error) { toast({ title: "Couldn't merge", description: error.message, variant: "destructive" }); return; }
    setMergeOpen(false); toast({ title: "Risers merged", description: "History and defects moved to this riser." }); load(); onChanged?.();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Riser location</p>
              <p className="text-3xl font-bold leading-tight">{a.riser_location || <span className="text-muted-foreground">Not set</span>}</p>
              {a.asset_tag && <p className="font-mono text-sm text-muted-foreground mt-1">{a.asset_tag}</p>}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
                <Button size="sm" variant="outline" onClick={openMove}><MoveRight className="h-4 w-4 mr-1.5" />Move site</Button>
                <Button size="sm" variant="outline" onClick={openMerge}><Merge className="h-4 w-4 mr-1.5" />Merge duplicate</Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Outlets</p><p className="text-lg font-semibold">{a.outlets_count ?? "—"}</p></div>
            <div><p className="text-muted-foreground text-xs">Status</p><Badge variant={a.status === "faulty" ? "destructive" : "secondary"} className="capitalize mt-1">{a.status}</Badge></div>
            <div><p className="text-muted-foreground text-xs">Last inspection</p><p className="font-medium">{fmt(a.last_inspection_at)}{a.last_inspection_type ? ` · ${a.last_inspection_type.replace(/_/g, " ")}` : ""}</p></div>
            <div><p className="text-muted-foreground text-xs">Last result</p><p className="font-medium">{a.last_inspection_result || "—"}</p></div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          <TabsTrigger value="defects">Open defects ({defects.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card><CardContent className="p-0">
            {history.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No history yet.</p> : (
              <ul className="divide-y">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">{h.inspection_date ? fmt(h.inspection_date) : h.report_date_text || "—"} · {(h.inspection_type || h.template_name || "Report").replace(/_/g, " ")}</p>
                      {h.result_summary && <p className="text-xs text-muted-foreground">{h.result_summary}</p>}
                    </div>
                    <div className="flex gap-2">
                      {h.job_id && <Button asChild size="sm" variant="ghost"><Link to={`/jobs/${h.job_id}`}>Job</Link></Button>}
                      {(h.report_link || h.report_file) && (
                        <Button size="sm" variant="ghost" onClick={() => openStorageRef(h.report_link || h.report_file!)}>
                          <ExternalLink className="h-4 w-4 mr-1" />Report
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="defects">
          <Card><CardContent className="p-0">
            {defects.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No open defects.</p> : (
              <ul className="divide-y">
                {defects.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>{d.title}</span>
                    <span className="flex gap-2"><Badge variant="outline" className="capitalize">{d.severity}</Badge><Badge variant="secondary" className="capitalize">{d.status.replace(/_/g, " ")}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit dry riser</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-sm font-medium">Riser location</label><Input value={form.riser_location} onChange={(e) => setForm({ ...form, riser_location: e.target.value })} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Number of outlets</label><Input type="number" min={0} value={form.outlets_count} onChange={(e) => setForm({ ...form, outlets_count: e.target.value })} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium">Notes</label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={saveEdit} disabled={busy}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move riser to another site</DialogTitle></DialogHeader>
          <Select value={targetSite} onValueChange={setTargetSite}>
            <SelectTrigger><SelectValue placeholder="Pick a site" /></SelectTrigger>
            <SelectContent>{sites.filter((s) => s.id !== a.site_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Its history and defects move with it.</p>
          <DialogFooter><Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button><Button onClick={doMove} disabled={!targetSite || busy}>Move</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge a duplicate into this riser</DialogTitle></DialogHeader>
          {others.length === 0 ? <p className="text-sm text-muted-foreground">No other dry risers at this site.</p> : (
            <Select value={mergeId} onValueChange={setMergeId}>
              <SelectTrigger><SelectValue placeholder="Pick the duplicate" /></SelectTrigger>
              <SelectContent>{others.map((o) => <SelectItem key={o.id} value={o.id}>{o.riser_location || "No location"} {o.asset_tag ? `(${o.asset_tag})` : ""}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">The duplicate's history, defects and review flags move to this riser. The duplicate is marked decommissioned, not deleted.</p>
          <DialogFooter><Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button><Button onClick={doMerge} disabled={!mergeId || busy}>Merge</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
