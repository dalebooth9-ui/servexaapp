import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { fetchSiteRisers, type SiteRiser } from "./siteRisers";

/** On-screen list on dry riser job sheets: which sticker goes on which riser. */
export default function SiteRiserStickerList({ siteId }: { siteId: string }) {
  const [risers, setRisers] = useState<SiteRiser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSiteRisers(siteId).then((r) => { if (!cancelled) setRisers(r); }).catch(() => setRisers([]));
    return () => { cancelled = true; };
  }, [siteId]);

  if (!risers || risers.length === 0) return null;

  const markFitted = async (r: SiteRiser) => {
    setBusy(r.id);
    const { error } = await supabase.rpc("mark_asset_label_placed", { _asset_id: r.id });
    setBusy(null);
    if (error) { toast.error("Couldn't save – label not marked as fitted"); return; }
    setRisers((list) => (list || []).map((x) => x.id === r.id ? { ...x, label_status: "placed", label_placed_at: new Date().toISOString() } : x));
    toast.success(`Label fitted on ${r.riser_location || r.asset_tag}`);
  };

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <h3 className="text-sm font-semibold mb-1">Riser stickers</h3>
      <p className="text-xs text-muted-foreground mb-2">Match each sticker ID to its riser, then tick when fitted.</p>
      <div className="divide-y divide-border rounded-md border">
        {risers.map((r) => (
          <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 min-w-0 truncate">{r.riser_location || "Unnamed riser"}</span>
            <span className="font-mono font-bold tracking-wider">{r.asset_tag || "—"}</span>
            <span className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={r.label_status === "placed"}
                disabled={r.label_status === "placed" || busy === r.id}
                onCheckedChange={(v) => { if (v) markFitted(r); }}
              />
              Label fitted
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
