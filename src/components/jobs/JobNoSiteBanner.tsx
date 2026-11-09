import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { fetchSiteRisers } from "@/components/assets/siteRisers";
import { notifyJobRisers } from "@/lib/jobRisers";
import { requireCurrentOrgId } from "@/lib/tenantQueries";

type SiteOpt = { id: string; name: string; postcode: string | null; address: string | null; suggested: boolean };

/** Admin banner for jobs without a site or risers; links/creates a site and puts its risers on the job. */
export default function JobNoSiteBanner({ jobId, siteId, customerId, address, onChanged }: {
  jobId: string; siteId: string | null; customerId: string | null; address: string | null; onChanged: () => void;
}) {
  const [riserCount, setRiserCount] = useState<number | null>(null);
  const [mode, setMode] = useState<"link" | "create" | null>(null);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [pick, setPick] = useState("");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [addr, setAddr] = useState(address || "");
  const [postcode, setPostcode] = useState("");
  const [risers, setRisers] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!siteId) { setRiserCount(0); return; }
    void fetchSiteRisers(siteId).then((r) => setRiserCount(r.length));
  }, [siteId]);

  // Customer's own sites are suggested first.
  useEffect(() => {
    if (mode !== "link") return;
    let live = true;
    (async () => {
      let ids: string[] = [];
      if (customerId) {
        const { data } = await supabase.from("customer_sites").select("site_id").eq("customer_id", customerId);
        ids = (data || []).map((l: any) => l.site_id).filter(Boolean);
      }
      const out: SiteOpt[] = [];
      if (ids.length) {
        const { data } = await supabase.from("sites").select("id,name,postcode,address").in("id", ids.slice(0, 200));
        out.push(...((data || []) as any[]).map((s) => ({ ...s, suggested: true })));
      }
      const term = search.trim();
      if (term.length >= 2) {
        const { data } = await supabase.from("sites").select("id,name,postcode,address").or(`name.ilike.%${term.replace(/[,%()]/g, "")}%,postcode.ilike.%${term.replace(/[,%()]/g, "")}%`).limit(30);
        for (const s of (data || []) as any[]) if (!out.some((o) => o.id === s.id)) out.push({ ...s, suggested: false });
      }
      if (live) setSites(out);
    })();
    return () => { live = false; };
  }, [mode, customerId, search]);

  if (riserCount === null || riserCount > 0) return null;

  const attach = async (newSiteId: string, siteAddress?: string | null) => {
    const upd: any = { site_id: newSiteId };
    if (!address && siteAddress) upd.address = siteAddress;
    const { error } = await supabase.from("jobs").update(upd).eq("id", jobId);
    if (error) throw error;
    const list = await fetchSiteRisers(newSiteId);
    for (const r of list) {
      const { error: e } = await supabase.rpc("set_job_riser", { _job_id: jobId, _asset_id: r.id, _selected: true });
      if (e) throw e;
    }
    notifyJobRisers(jobId);
    return list.length;
  };

  const doLink = async () => {
    const s = sites.find((x) => x.id === pick);
    if (!s) return;
    setBusy(true);
    try {
      const n = await attach(s.id, s.address);
      toast.success(n ? `Linked to ${s.name}. ${n} riser${n === 1 ? "" : "s"} added to this job.` : `Linked to ${s.name}. This site has no risers yet.`);
      setMode(null); onChanged();
    } catch (e: any) { toast.error(e.message || "Couldn't link the site"); }
    setBusy(false);
  };

  const doCreate = async () => {
    const locs = risers.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!name.trim() || !locs.length) return;
    setBusy(true);
    try {
      const orgId = await requireCurrentOrgId();
      const { data: site, error } = await supabase.from("sites").insert({ name: name.trim(), site_type: "site", address: addr.trim() || null, postcode: postcode.trim() || null, org_id: orgId } as any).select("id").single();
      if (error || !site) throw error || new Error("Couldn't create the site");
      if (customerId) {
        const { error: le } = await supabase.from("customer_sites").insert({ customer_id: customerId, site_id: site.id, org_id: orgId } as any);
        if (le) throw le;
      }
      const { error: re } = await supabase.rpc("add_site_risers", { _site_id: site.id, _locations: locs });
      if (re) throw re;
      const n = await attach(site.id, addr.trim() || null);
      toast.success(`Site created with ${n} riser${n === 1 ? "" : "s"} on this job.`);
      setMode(null); onChanged();
    } catch (e: any) { toast.error(e.message || "Couldn't create the site"); }
    setBusy(false);
  };

  const suggested = sites.filter((s) => s.suggested);
  return (
    <>
      <div className="mb-6 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="flex-1 font-medium">This job has no site or risers yet, so reports and stickers can't be printed.</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setMode("link")} className="gap-1.5"><Link2 className="h-4 w-4" />Link to an existing site</Button>
          <Button size="sm" variant="outline" onClick={() => { setName(""); setMode("create"); }} className="gap-1.5"><Plus className="h-4 w-4" />Create a new site and risers</Button>
        </div>
      </div>

      <Dialog open={mode === "link"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link to an existing site</DialogTitle></DialogHeader>
          {customerId && (suggested.length
            ? <p className="text-sm text-muted-foreground">Suggested: {suggested.length} site{suggested.length === 1 ? "" : "s"} belong to this job's customer.</p>
            : <p className="text-sm text-muted-foreground">This job's customer has no sites yet. Search all sites below.</p>)}
          <Input placeholder="Search sites by name or postcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger><SelectValue placeholder="Choose a site" /></SelectTrigger>
            <SelectContent>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.suggested ? "★ " : ""}{s.name}{s.postcode ? ` — ${s.postcode}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button disabled={!pick || busy} onClick={() => void doLink()}>Link site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "create"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create a new site and risers</DialogTitle></DialogHeader>
          <Input placeholder="Site name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Address" value={addr} onChange={(e) => setAddr(e.target.value)} />
          <Input placeholder="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          <div className="space-y-1">
            <p className="text-sm font-medium">Riser locations (one per line)</p>
            <Textarea rows={4} placeholder={"North stair\nSouth stair"} value={risers} onChange={(e) => setRisers(e.target.value)} />
          </div>
          {!customerId && <p className="text-xs text-muted-foreground">This job has no customer, so the site won't be linked to one yet.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button disabled={busy || !name.trim() || !risers.trim()} onClick={() => void doCreate()}>Create and add to job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
