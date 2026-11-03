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
  siteId: string; siteName: string | null; customerLogoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [risers, setRisers] = useState<SiteRiser[] | null>(null);
  const [includePlaced, setIncludePlaced] = useState(false);
  const [offsets, setOffsets] = useState<StickerOffsets>(loadOffsets());
  const [busy, setBusy] = useState(false);
  const [addCount, setAddCount] = useState(1);
  const [addLocs, setAddLocs] = useState<string[]>([""]);

  const load = () => fetchSiteRisers(siteId).then(setRisers).catch(() => { setRisers([]); toast.error("Couldn't load risers"); });
  useEffect(() => { if (open) load(); }, [open, siteId]);

  const selected = useMemo(
    () => (risers || []).filter((r) => r.asset_tag && (includePlaced || r.label_status !== "placed")),
    [risers, includePlaced],
  );

  const resolveLogo = async (): Promise<string | null> => {
    if (customerLogoUrl && customerLogoUrl.trim()) return null; // customer branding → QR + ID only
    const g = await getGeneratingOrgBranding();
    if (g.logoUrl) return (await resolveToSignedUrl(g.logoUrl, "submissions").catch(() => null)) || g.logoUrl;
    return (await getGeneratingOrgFallbackLogoUrl()) || null;
  };

  const print = async (test: boolean) => {
    if (!test && selected.length === 0) { toast.error("No risers to print"); return; }
    setBusy(true);
    try {
      saveOffsets(offsets);
      const doc = await buildStickerPackPdf({
        items: test ? [] : selected.map((r) => ({ asset_tag: r.asset_tag! })),
        logoUrl: test ? null : await resolveLogo(),
        offsets,
        testPage: test,
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
    const { error } = await supabase.rpc("add_site_risers", { _site_id: siteId, _locations: locs });
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
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Printer className="h-4 w-4 mr-2" />Print sticker pack</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Riser sticker pack</DialogTitle>
          <DialogDescription>Avery L4778 sheets (45.7 × 21.2 mm, 48 per A4). One sticker per dry riser at {siteName || "this site"}.</DialogDescription>
        </DialogHeader>

        {risers === null ? <p className="text-sm text-muted-foreground">Loading…</p> : risers.length === 0 ? (
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
            <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {risers.map((r) => {
                const on = selected.some((s) => s.id === r.id);
                return (
                  <div key={r.id} className={`flex items-center gap-3 px-3 py-1.5 text-sm ${on ? "" : "opacity-50"}`}>
                    <span className="flex-1 truncate">{r.riser_location || "Unnamed riser"}</span>
                    <span className="font-mono font-bold">{r.asset_tag}</span>
                    <span className="text-xs text-muted-foreground w-14 text-right">{LABEL_STATUS_LABEL[r.label_status] || r.label_status}</span>
                  </div>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includePlaced} onCheckedChange={(v) => setIncludePlaced(!!v)} />
              Include risers that already have a placed sticker
            </label>
            <div className="grid grid-cols-2 gap-3">
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
