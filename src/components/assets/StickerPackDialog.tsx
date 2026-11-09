import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Plus } from "lucide-react";
import { toast } from "sonner";
import { fetchSiteRisers, type SiteRiser } from "./siteRisers";
import { buildStickerPackPdf, loadOffsets, saveOffsets, LABEL_STATUS_LABEL, type StickerOffsets } from "@/lib/riserStickers";
import { resolveStickerBranding, missingStickerLogoNote, type StickerLogoChoice } from "@/lib/stickerBranding";
import { Link } from "react-router-dom";
import {loadJobRisers} from '@/lib/jobRisers';

const inletKey = (id: string) => `i:${id}`;
const outletKey = (id: string, n: number) => `o:${id}:${n}`;
const outletNums = (r: SiteRiser, tags: Record<string,string>) => Object.keys(tags).filter(k=>k.startsWith(`o:${r.id}:`)).map(k=>Number(k.split(':')[2])).sort((a,b)=>a-b);
const allKeys = (list: SiteRiser[], tags: Record<string,string>) => list.flatMap((r) => [...(r.asset_tag ? [inletKey(r.id)] : []), ...outletNums(r,tags).map((n) => outletKey(r.id, n))]);

export default function StickerPackDialog({ siteId, siteName, customerLogoUrl, trigger, jobId }: {
  jobId?:string; siteId: string | null; siteName: string | null; customerLogoUrl: string | null;
  /** Optional custom trigger button (e.g. the job page top row). Defaults to the outline "Print sticker pack" button. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [risers, setRisers] = useState<SiteRiser[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [outletTags, setOutletTags] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastPrinted, setLastPrinted] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<StickerOffsets>(loadOffsets());
  const [busy, setBusy] = useState(false);
  const [startPosition,setStartPosition]=useState(1);
  const [addCount, setAddCount] = useState(1);
  const [addLocs, setAddLocs] = useState<string[]>([""]);

  const noteLast = (list: SiteRiser[]) => {
    const d = list.map((r) => r.label_printed_at).filter(Boolean).sort().pop() || null;
    setLastPrinted(d);
  };
  const load = (resetPick = false) => {
    if (!siteId) { setRisers([]); return Promise.resolve(); }
    return fetchSiteRisers(siteId).then(async (list) => {
      const tags: Record<string, string> = {};
      for (let from = 0; from < list.length; from += 100) {
        const { data, error } = await supabase.rpc('ensure_riser_outlet_tags', { _asset_ids: list.slice(from, from + 100).map(r => r.id) });
        if (error) throw error;
        (data || []).forEach(t => { tags[outletKey(t.asset_id, t.outlet_number)] = t.outlet_tag; });
      }
      setOutletTags(tags);
      setRisers(list); noteLast(list);
      if (resetPick) {const membership=jobId?await loadJobRisers(jobId):null;setPicked(new Set(allKeys(membership?list.filter(r=>membership.some(m=>m.asset_id===r.id&&m.selected)):list,tags)));}
    }).catch(() => { setRisers([]); toast.error("Couldn't load risers"); });
  };
  useEffect(() => { if (open) load(true); }, [open, siteId]);
  useEffect(() => { if (siteId) fetchSiteRisers(siteId).then(noteLast).catch(() => {}); }, [siteId]);

  const selected = useMemo(
    () => (risers || []).filter((r) => r.asset_tag && picked.has(inletKey(r.id))),
    [risers, picked],
  );
  const pickedOutlets = useMemo(
    () => (risers || []).flatMap((r) => outletNums(r,outletTags).filter((n) => picked.has(outletKey(r.id, n))).map((n) => ({ riser: r, n }))),
    [risers, picked, outletTags],
  );
  const total = selected.length + pickedOutlets.length;
  const setKeys = (keys: string[], on: boolean) => setPicked((p) => { const n = new Set(p); keys.forEach((k) => on ? n.add(k) : n.delete(k)); return n; });
  const riserKeys = (r: SiteRiser) => [...(r.asset_tag ? [inletKey(r.id)] : []), ...outletNums(r,outletTags).map((n) => outletKey(r.id, n))];

  // Same opt-in as report branding: customer logo, plain when missing, else company logo.
  const [branding, setBranding] = useState<{ choice: StickerLogoChoice; logoUrl: string | null } | null>(null);
  useEffect(() => { if (!open) return; let alive = true; setBranding(null);
    resolveStickerBranding({ jobId, siteId }).then(b => { if (alive) setBranding(b); }).catch(() => { if (alive) setBranding(null); });
    return () => { alive = false; }; }, [open, jobId, siteId]);
  const resolveLogo = async (): Promise<string | null> => (branding || await resolveStickerBranding({ jobId, siteId })).logoUrl;

  const print = async (test: boolean) => {
    if (!test && total === 0) { toast.error("Nothing ticked to print"); return; }
    setBusy(true);
    try {
      saveOffsets(offsets);
      // Create any missing outlet numbers (never duplicates), then print in riser order.
      let tagMap: Record<string, { id: string; tag: string }> = {};
      const outletRiserIds = [...new Set(pickedOutlets.map((o) => o.riser.id))];
      if (!test && outletRiserIds.length) {
        const { data, error } = await supabase.rpc("ensure_riser_outlet_tags", { _asset_ids: outletRiserIds });
        if (error) throw new Error("Couldn't create outlet sticker numbers: " + error.message);
        tagMap = Object.fromEntries((data || []).map((t: any) => [outletKey(t.asset_id, t.outlet_number), { id: t.id, tag: t.outlet_tag }]));
      }
      const items: { asset_tag: string; riserId: string; outletNumber: number }[] = [];
      const outletIds: string[] = [];
      if (!test) for (const r of risers || []) {
        if (r.asset_tag && picked.has(inletKey(r.id))) items.push({ asset_tag: r.asset_tag, riserId:r.id, outletNumber:0 });
        for (const n of outletNums(r,outletTags)) {
          const t = picked.has(outletKey(r.id, n)) ? tagMap[outletKey(r.id, n)] : undefined;
          if (t) { items.push({ asset_tag: t.tag, riserId:r.id, outletNumber:n }); outletIds.push(t.id); }
        }
      }
      const doc = await buildStickerPackPdf({
        items,
        logoUrl: test ? null : await resolveLogo(),
        offsets,
        testPage: test,
        startPosition,
      });
      const safe = (siteName || "site").replace(/[^a-z0-9]+/gi, "-");
      doc.save(test ? "sticker-test-page.pdf" : `riser-stickers-${safe}.pdf`);
      if (!test) {
        const { error } = selected.length ? await supabase.rpc("mark_assets_label_printed", { _asset_ids: selected.map((r) => r.id) }) : { error: null };
        const { error: e2 } = outletIds.length ? await supabase.rpc("mark_outlet_labels_printed", { _ids: outletIds }) : { error: null };
        if (error || e2) toast.error("PDF made, but sticker status couldn't be saved as printed");
        else { toast.success(`${items.length} sticker(s) ready to print`); load(); }
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't make the sticker PDF");
    } finally { setBusy(false); }
  };

  const addRisers = async () => {
    if (!siteId) return;
    const locs = addLocs.map((s) => s.trim()).filter(Boolean);
    if (locs.length !== addCount) { toast.error("Enter a riser location for each riser"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("add_site_risers", { _site_id: siteId, _locations: locs });
    setBusy(false);
    if (error) { toast.error("Couldn't add risers: " + error.message); return; }
    toast.success(`${locs.length} riser(s) added`);
    load(true);
  };

  const setCount = (n: number) => {
    const c = Math.max(1, Math.min(50, n || 1));
    setAddCount(c);
    setAddLocs((prev) => Array.from({ length: c }, (_, i) => prev[i] || ""));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span className="inline-flex items-center gap-2">
        <DialogTrigger asChild>
          {trigger ?? <Button variant="outline"><Printer className="h-4 w-4 mr-2" />Print sticker pack</Button>}
        </DialogTrigger>
        {lastPrinted && <span className="text-xs text-muted-foreground">Last printed {new Date(lastPrinted).toLocaleDateString("en-GB")}</span>}
      </span>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Riser sticker pack</DialogTitle>
          <DialogDescription>Avery L4778 sheets (45.7 × 21.2 mm, 48 per A4). One inlet sticker per riser plus one per outlet (landing valve), dry and wet risers at {siteName || "this site"}.</DialogDescription>
          {branding?.choice.kind === "missing" && <p role="alert" className="text-sm rounded border border-destructive/40 bg-destructive/10 p-2">{missingStickerLogoNote(branding.choice.customerName)}{" "}{branding.choice.customerId && <Link className="underline font-medium" to={`/customers/${branding.choice.customerId}`}>Upload a logo</Link>}</p>}
        </DialogHeader>

        {!siteId ? <p className="text-sm text-muted-foreground">This job has no site, so there are no risers to print stickers for.</p> : risers === null ? <p className="text-sm text-muted-foreground">Loading…</p> : risers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Add risers to this site</p>
            <div className="flex items-center gap-2">
              <Label htmlFor="riser-count" className="text-sm">How many?</Label>
              <Input id="riser-count" type="number" min={1} max={50} value={addCount} onChange={(e) => setCount(parseInt(e.target.value))} className="w-20" />
            </div>
            {addLocs.map((v, i) => (
              <Input key={i} value={v} placeholder={`Riser ${i + 1} location (e.g. Stairwell A)`}
                onChange={(e) => setAddLocs((p) => p.map((x, j) => j === i ? e.target.value : x))} />
            ))}
            <Button onClick={addRisers} disabled={busy}><Plus className="h-4 w-4 mr-2" />Add risers</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set(allKeys(risers,outletTags)))}>Select all</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setKeys(risers.flatMap((r) => outletNums(r,outletTags).map((n) => outletKey(r.id, n))), true)}>Select all outlets</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Select none</Button>
            </div>
            <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {risers.map((r) => {
                const keys = riserKeys(r);
                const onCount = keys.filter((k) => picked.has(k)).length;
                const nums = outletNums(r,outletTags);
                const open = expanded.has(r.id);
                return (
                  <div key={r.id}>
                    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
                      <Checkbox checked={onCount === 0 ? false : onCount === keys.length ? true : "indeterminate"} disabled={!keys.length}
                        onCheckedChange={(v) => setKeys(keys, !!v)} aria-label={`Whole riser ${r.riser_location || ""}`} />
                      <Button type="button" variant="ghost" className="flex-1 min-w-0 truncate text-left justify-start h-auto px-0" onClick={() => setExpanded((p) => { const n = new Set(p); open ? n.delete(r.id) : n.add(r.id); return n; })}>
                        {r.riser_location || "Unnamed riser"} <span className="text-xs text-muted-foreground">({1 + nums.length} sticker{nums.length ? "s" : ""}{nums.length ? ` · ${open ? "hide" : "choose"}` : ""})</span>
                      </Button>
                      <span className="font-mono font-bold">{r.asset_tag}</span>
                      <span className="text-xs text-muted-foreground w-14 text-right">{LABEL_STATUS_LABEL[r.label_status] || r.label_status}</span>
                    </div>
                    {open && (
                      <div className="pl-10 pb-1.5 space-y-1">
                        <label className="flex items-center gap-3 text-sm cursor-pointer">
                          <Checkbox checked={picked.has(inletKey(r.id))} disabled={!r.asset_tag} onCheckedChange={(v) => setKeys([inletKey(r.id)], !!v)} />
                          <span className="flex-1">Inlet</span><span className="font-mono">{r.asset_tag}</span>
                        </label>
                        {nums.map((n) => (
                          <label key={n} className="flex items-center gap-3 text-sm cursor-pointer">
                            <Checkbox checked={picked.has(outletKey(r.id, n))} onCheckedChange={(v) => setKeys([outletKey(r.id, n)], !!v)} />
                            <span className="flex-1">Outlet {n}</span>
                            <span className="font-mono text-muted-foreground">{outletTags[outletKey(r.id, n)]}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="sticker-start">First free label position</Label>
                <Input id="sticker-start" type="number" min={1} max={48} value={startPosition} onChange={e=>setStartPosition(Math.max(1,Math.min(48,Number(e.target.value)||1)))}/>
              </div>
              <div>
                <Label className="text-xs">Nudge down (mm)</Label>
                <Input type="number" step="0.5" value={offsets.top} onChange={(e) => setOffsets({ ...offsets, top: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs">Nudge right (mm)</Label>
                <Input type="number" step="0.5" value={offsets.left} onChange={(e) => setOffsets({ ...offsets, left: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => print(false)} disabled={busy || total === 0}>
                <Printer className="h-4 w-4 mr-2" />Print {total} sticker{total === 1 ? "" : "s"}
              </Button>
              <Button variant="outline" onClick={() => print(true)} disabled={busy}>Print test page on plain paper</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
