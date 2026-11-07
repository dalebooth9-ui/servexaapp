import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchSiteRisers, type SiteRiser } from "@/components/assets/siteRisers";
import StickerPackDialog from "@/components/assets/StickerPackDialog";
import { loadPrintReportRows, buildVisitPdf } from "@/components/riser-visits/VisitPaperwork";
import { logReportsPrinted } from "@/lib/jobCategoryChange";

/**
 * Top-row print controls for riser jobs: "Print reports" (one paper sheet per riser)
 * and "Print sticker pack" (QR sticker picker). Renders nothing when the job's site
 * has no dry or wet risers. The Documents tab keeps its own copies of both.
 */
export default function JobPrintButtons({ jobId, siteId, siteName, customerLogoUrl }: {
  jobId: string; siteId: string | null; siteName: string | null; customerLogoUrl: string | null;
}) {
  const [hasRisers, setHasRisers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<{ risers: SiteRiser[]; ticked: string[] } | null>(null);

  useEffect(() => {
    if (!siteId) { setHasRisers(false); return; }
    let live = true;
    fetchSiteRisers(siteId).then((list) => { if (live) setHasRisers(list.length > 0); }).catch(() => {});
    return () => { live = false; };
  }, [siteId]);

  const run = async (picked?: string[]) => {
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const load = await loadPrintReportRows(jobId, picked);
      if (load.pick) { tab?.close(); setPick({ risers: load.pick, ticked: [] }); return; }
      const rows = load.rows;
      if (!rows.length) throw new Error("No engineer service sheets for this job yet. Choose a print template for this job type in Settings → Job Categories.");
      const blob = await buildVisitPdf(rows);
      const url = URL.createObjectURL(blob);
      if (!tab) throw new Error("Allow pop-ups to print paperwork");
      tab.location.href = url;
      tab.onload = () => tab.print();
      void logReportsPrinted(jobId);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e: any) {
      tab?.close();
      toast.error("Paperwork could not be generated", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!hasRisers) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => run()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        Print reports
      </Button>
      <StickerPackDialog
        siteId={siteId}
        siteName={siteName}
        customerLogoUrl={customerLogoUrl}
        trigger={
          <Button variant="outline" size="sm" className="gap-1.5 border-dashed">
            <QrCode className="h-3.5 w-3.5" /> Print sticker pack
          </Button>
        }
      />
      <Dialog open={!!pick} onOpenChange={(o) => !o && setPick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Which risers are on this job?</DialogTitle>
            <DialogDescription>No risers are linked to this job yet. Tick the ones to print a sheet for.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => pick && setPick({ ...pick, ticked: pick.risers.map((r) => r.id) })}>Select all</Button>
            <Button size="sm" variant="ghost" onClick={() => pick && setPick({ ...pick, ticked: [] })}>Select none</Button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {pick?.risers.map((r) => (
              <label key={r.id} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={pick.ticked.includes(r.id)}
                  onCheckedChange={(c) => setPick({ ...pick, ticked: c ? [...pick.ticked, r.id] : pick.ticked.filter((x) => x !== r.id) })}
                />
                {r.riser_location || "No location"}{r.asset_tag ? ` (${r.asset_tag})` : ""}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPick(null)}>Cancel</Button>
            <Button disabled={!pick?.ticked.length} onClick={() => { const p = pick!; setPick(null); void run(p.ticked); }}>Print selected</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
