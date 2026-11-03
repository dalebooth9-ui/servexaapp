import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { findDuplicateGroups, loadSiteStats, pickSiteWithMostData, type DupGroup, type SiteStat } from "@/lib/siteDuplicates";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Undo2 } from "lucide-react";
import { format } from "date-fns";

interface SiteRow { id: string; name: string; address: string | null; postcode: string | null; site_type: string | null }

export default function MergeDuplicateSitesDialog({ open, onOpenChange, onChanged }: {
  open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sites, setSites] = useState<Map<string, SiteRow>>(new Map());
  const [stats, setStats] = useState<Map<string, SiteStat>>(new Map());
  const [custNames, setCustNames] = useState<Map<string, string>>(new Map());
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [hasUndo, setHasUndo] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, links, custs, st, log] = await Promise.all([
        fetchAllRows<SiteRow>("sites", "id,name,address,postcode,site_type", "id"),
        fetchAllRows<any>("customer_sites", "id,customer_id,site_id", "id"),
        fetchAllRows<any>("customers", "id,name", "id"),
        loadSiteStats(supabase),
        supabase.from("site_merge_log" as any).select("id").is("undone_at", null).limit(1),
      ]);
      const cn = new Map<string, string>(custs.map((c: any) => [c.id, c.name]));
      const byS = new Map<string, string[]>();
      for (const l of links) { if (!byS.has(l.site_id)) byS.set(l.site_id, []); byS.get(l.site_id)!.push(l.customer_id); }
      const g = findDuplicateGroups(s.map((x) => ({ ...x, customer_ids: byS.get(x.id) ?? [] })), cn);
      const k: Record<string, string> = {}, inc: Record<string, boolean> = {};
      for (const gr of g) {
        k[gr.key] = pickSiteWithMostData(gr.siteIds.map((id) => ({ id })), st)!.id;
        inc[gr.key] = gr.kind === "customer" && gr.reason !== "postcode";
      }
      setSites(new Map(s.map((x) => [x.id, x]))); setStats(st); setCustNames(cn);
      setGroups(g); setKeep(k); setInclude(inc); setHasUndo(((log as any).data || []).length > 0);
    } catch (e: any) {
      toast({ title: "Could not load sites", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const selected = useMemo(() => groups.filter((g) => include[g.key]), [groups, include]);

  async function merge() {
    if (!selected.length) return;
    setBusy(true);
    const payload = selected.map((g) => ({ keep: keep[g.key], dups: g.siteIds.filter((i) => i !== keep[g.key]) }));
    const { error } = await supabase.rpc("merge_sites" as any, { _groups: payload });
    setBusy(false);
    if (error) { toast({ title: "Merge failed — nothing was changed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Merged ${selected.length} group${selected.length === 1 ? "" : "s"}` });
    onChanged?.(); load();
  }

  async function undo() {
    setBusy(true);
    const { data, error } = await supabase.rpc("undo_last_site_merge" as any);
    setBusy(false);
    if (error) { toast({ title: "Undo failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: data ? `Restored ${data} site${data === 1 ? "" : "s"}` : "Nothing to undo" });
    onChanged?.(); load();
  }

  const reasonLabel = (g: DupGroup) => g.kind === "possible" ? "Possible — different customers"
    : g.reason === "postcode" ? "Same customer · same postcode" : g.reason === "name" ? "Same customer · same name" : "Same customer · same name & postcode";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge duplicate sites</DialogTitle>
          <DialogDescription>Everything linked to the other copies moves to the copy marked Keep. Merged copies are hidden, not deleted, and can be restored with Undo.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking sites…</div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No duplicate sites found.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Checkbox checked={!!include[g.key]} onCheckedChange={(v) => setInclude((p) => ({ ...p, [g.key]: !!v }))} />
                  <span className="font-medium">{sites.get(g.siteIds[0])?.name}</span>
                  <Badge variant={g.kind === "possible" ? "outline" : "secondary"}>{reasonLabel(g)}</Badge>
                  {g.customerId && <span className="text-xs text-muted-foreground">{custNames.get(g.customerId)}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="p-1">Keep</th><th className="p-1">Name</th><th className="p-1">Address</th><th className="p-1">Postcode</th>
                        <th className="p-1">Buildings</th><th className="p-1">Assets</th><th className="p-1">Jobs</th><th className="p-1">Defects</th>
                        <th className="p-1">Reports</th><th className="p-1">Agreements</th><th className="p-1">Documents</th><th className="p-1">Last activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.siteIds.map((id) => {
                        const s = sites.get(id); const st = stats.get(id);
                        return (
                          <tr key={id} className="border-t">
                            <td className="p-1"><input type="radio" name={g.key} checked={keep[g.key] === id} onChange={() => setKeep((p) => ({ ...p, [g.key]: id }))} aria-label="Keep this copy" /></td>
                            <td className="p-1 font-medium">{s?.name}</td>
                            <td className="p-1">{s?.address || "—"}</td>
                            <td className="p-1">{s?.postcode || "—"}</td>
                            <td className="p-1">{st?.buildings ?? 0}</td><td className="p-1">{st?.assets ?? 0}</td>
                            <td className="p-1">{st?.jobs ?? 0}</td><td className="p-1">{st?.defects ?? 0}</td>
                            <td className="p-1">{st?.reports ?? 0}</td><td className="p-1">{st?.agreements ?? 0}</td>
                            <td className="p-1">{st?.documents ?? 0}</td>
                            <td className="p-1">{st?.last_activity ? format(new Date(st.last_activity), "dd/MM/yyyy") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={undo} disabled={busy || !hasUndo}><Undo2 className="mr-2 h-4 w-4" /> Undo last merge</Button>
          <Button onClick={merge} disabled={busy || loading || !selected.length}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Merge selected ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
