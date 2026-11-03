import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { openStorageRef } from "@/components/assets/openStorageRef";

interface Riser { id: string; riser_location: string | null; outlets_count: number | null; last_inspection_result: string | null; asset_tag: string | null; label_status?: string }
interface SiteHist { id: string; inspection_date: string | null; report_date_text: string | null; inspection_type: string | null; template_name: string | null; result_summary: string | null; report_link: string | null; report_file: string | null }

/** Site-level dry riser list and history entries that aren't tied to one riser. */
export default function SiteDryRisers({ siteId, showRisers = true, showSiteHistory = true }: { siteId: string; showRisers?: boolean; showSiteHistory?: boolean }) {
  const [risers, setRisers] = useState<Riser[]>([]);
  const [hist, setHist] = useState<SiteHist[]>([]);
  const [notPlaced, setNotPlaced] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      const [{ data: r }, { data: h }] = await Promise.all([
        supabase.from("assets").select("id, riser_location, outlets_count, last_inspection_result, asset_tag, label_status")
          .eq("site_id", siteId).or("asset_type.ilike.dry%riser%,category.ilike.dry%riser%").neq("status", "decommissioned").order("riser_location"),
        supabase.from("asset_service_history").select("id, inspection_date, report_date_text, inspection_type, template_name, result_summary, report_link, report_file")
          .eq("site_id", siteId).is("asset_id", null).order("inspection_date", { ascending: false, nullsFirst: false }).limit(100),
      ]);
      if (off) return;
      setRisers((r as any) || []); setHist((h as any) || []);
    })();
    return () => { off = true; };
  }, [siteId]);

  if (risers.length === 0 && hist.length === 0) return null;

  return (
    <div className="space-y-3">
      {showRisers && risers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dry risers</p>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={notPlaced} onChange={(e) => setNotPlaced(e.target.checked)} /> Printed but not placed
            </label>
          </div>
          <ul className="divide-y rounded-md border text-sm">
            {risers.filter((r) => !notPlaced || r.label_status === "printed").map((r) => (
              <li key={r.id}>
                <Link to={`/assets/${r.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50">
                  <span className="font-medium">{r.riser_location || "No location"}</span>
                  <span className="text-xs text-muted-foreground">{r.outlets_count ?? "—"} outlets · {r.last_inspection_result || "no result"} · Sticker: {r.label_status || "none"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showSiteHistory && hist.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Site reports (not linked to a riser)</p>
          <ul className="divide-y rounded-md border text-sm">
            {hist.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>{h.inspection_date ? format(new Date(h.inspection_date), "dd/MM/yyyy") : h.report_date_text || "—"} · {(h.inspection_type || h.template_name || "Report").replace(/_/g, " ")}{h.result_summary ? ` · ${h.result_summary}` : ""}</span>
                {(h.report_link || h.report_file) && (
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => openStorageRef(h.report_link || h.report_file!)}>Report</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
