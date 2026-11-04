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
import { getGeneratingOrgBranding, getGeneratingOrgFallbackLogoUrl } from "@/lib/generatingOrgBranding";
import { resolveToSignedUrl } from "@/lib/durableStorageRef";

export default function StickerPackDialog({ siteId, siteName, customerLogoUrl }: {
  siteId: string | null; siteName: string | null; customerLogoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [risers, setRisers] = useState<SiteRiser[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
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
    return fetchSiteRisers(siteId).then((list) => {
      setRisers(list); noteLast(list);
      if (resetPick) setPicked(new Set(list.filter((r) => r.asset_tag).map((r) => r.id)));
    }).catch(() => { setRisers([]); toast.error("Couldn't load risers"); });
  };
  useEffect(() => { if (open) load(true); }, [open, siteId]);
  useEffect(() => { if (siteId) fetchSiteRisers(siteId).then(noteLast).catch(() => {}); }, [siteId]);

  const selected = useMemo(
    () => (risers || []).filter((r) => r.asset_tag && picked.has(r.id)),
    [risers, picked],
  );
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });

  const resolveLogo = async (): Promise<string | null> => {
    if (customerLogoUrl && customerLogoUrl.trim()) return null; // customer branding → QR + ID only
    const g = await getGeneratingOrgBranding();
    if (!g.isViva && g.logoUrl) return (await resolveToSignedUrl(g.logoUrl, "submissions").catch(() => null)) || g.logoUrl;
    return (await getGeneratingOrgFallbackLogoUrl()) || null;
  };

  const print = async (test: boolean) => {
    if (!test && selected.length === 0) { toast.error("No risers to print"); return; }
    setBusy(true);
    try {
      saveOffsets(offsets);
      const doc = await buildStickerPackPdf({
        items: test ? [] : selected.flatMap((r) => r.asset_tag ? [{ asset_tag: r.asset_tag }] : []),
        logoUrl: test ? null : await resolveLogo(),
        offsets,
        testPage: test,
        startPosition,
      });
      const safe = (siteName || "site").replace(/[^a-z0-9]+/gi, "-");
      doc.save(test ? "sticker-test-page.pdf" : `riser-stickers-${safe}.pdf`);
      if (!test) {
        const { error } = await supabase.rpc("mark_assets_label_printed", { _asset_ids: selected.map((r) => r.id) });
        if (error) toast.error("PDF made, but sticker status couldn't be saved as printed");
        else { toast.success(`${selected.length} sticker(s) ready to print`); load(); }
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't make the sticker PDF");
    } finally { setBusy(false); }
  };

  const addRisers = async () => {
    const locs = addLocs.map((s) => s.trim()).filter(Boolean);
    if (locs.length !== addCount) { toast.error("Enter a riser location for each riser"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("add_site_risers", { _site_id: siteId!, _locations: locs });
    setBusy(false);
    if (error) { toast.error("Couldn't add risers: " + error.message); return; }
    toast.success(`${locs.length} riser(s) added`);
    load();
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
          <Button variant="outline"><Printer className="h-4 w-4 mr-2" />Print sticker pack</Button>
        </DialogTrigger>
        {lastPrinted && <span className="text-xs text-muted-foreground">Last printed {new Date(lastPrinted).toLocaleDateString("en-GB")}</span>}
      </span>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Riser sticker pack</DialogTitle>
          <DialogDescription>Avery L4778 sheets (45.7 × 21.2 mm, 48 per A4). One sticker per dry and wet riser at {siteName || "this site"}.</DialogDescription>
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
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set(risers.filter((r) => r.asset_tag).map((r) => r.id)))}>Select all</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Select none</Button>
            </div>
            <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {risers.map((r) => {
                const on = picked.has(r.id);
                return (
                  <label key={r.id} className="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer">
                    <Checkbox checked={on} disabled={!r.asset_tag} onCheckedChange={(v) => toggle(r.id, !!v)} />
                    <span className="flex-1 truncate">{r.riser_location || "Unnamed riser"}</span>
                    <span className="font-mono font-bold">{r.asset_tag}</span>
                    <span className="text-xs text-muted-foreground w-14 text-right">{LABEL_STATUS_LABEL[r.label_status] || r.label_status}</span>
                  </label>
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
              <Button onClick={() => print(false)} disabled={busy || selected.length === 0}>
                <Printer className="h-4 w-4 mr-2" />Print {selected.length} sticker{selected.length === 1 ? "" : "s"}
              </Button>
              <Button variant="outline" onClick={() => print(true)} disabled={busy}>Print test page on plain paper</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
