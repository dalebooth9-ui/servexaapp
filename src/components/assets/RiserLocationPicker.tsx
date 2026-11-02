import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OTHER = "__other__";

interface Riser { id: string; riser_location: string | null; outlets_count: number | null; asset_tag: string | null }

/**
 * Riser Location picker for dry riser job sheets. Lists the site's Dry Riser
 * assets; picking one stores its exact riser_location text plus riser_asset_id
 * so the asset sync links the report to that riser. "Other / new riser" lets
 * the engineer type a new location (riser_asset_id cleared).
 */
export default function RiserLocationPicker({
  siteId, value, assetId, locked, onChange,
}: {
  siteId: string | null;
  value: string;
  assetId: string | null;
  locked?: boolean;
  onChange: (location: string, assetId: string | null) => void;
}) {
  const [risers, setRisers] = useState<Riser[] | null>(null);
  const [other, setOther] = useState(false);

  useEffect(() => {
    if (!siteId) { setRisers([]); return; }
    let cancelled = false;
    supabase.from("assets")
      .select("id, riser_location, outlets_count, asset_tag")
      .eq("site_id", siteId)
      .or("asset_type.ilike.dry%riser%,category.ilike.dry%riser%")
      .neq("status", "decommissioned")
      .order("riser_location")
      .then(({ data }) => { if (!cancelled) setRisers((data as Riser[]) || []); });
    return () => { cancelled = true; };
  }, [siteId]);

  const list = (risers || []).filter((r) => r.riser_location && r.riser_location.trim());
  const selected = assetId && list.some((r) => r.id === assetId) ? assetId : null;
  const showText = other || (!selected && !!value) || (risers !== null && list.length === 0);

  if (risers !== null && list.length === 0) {
    return (
      <Input value={value || ""} disabled={locked} onChange={(e) => onChange(e.target.value, null)}
        placeholder="Type the riser location" className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full" />
    );
  }

  return (
    <div className="w-full space-y-1">
      <Select
        disabled={locked}
        value={selected ?? (showText ? OTHER : "")}
        onValueChange={(v) => {
          if (v === OTHER) { setOther(true); onChange("", null); return; }
          const r = list.find((x) => x.id === v);
          setOther(false);
          if (r) onChange(r.riser_location!, r.id);
        }}
      >
        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pick the riser" /></SelectTrigger>
        <SelectContent>
          {list.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.riser_location}{r.outlets_count != null ? ` · ${r.outlets_count} outlets` : ""}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Other / new riser</SelectItem>
        </SelectContent>
      </Select>
      {showText && (
        <Input value={value || ""} disabled={locked} onChange={(e) => onChange(e.target.value, null)}
          placeholder="Type the new riser location" className="h-7 text-xs w-full" />
      )}
    </div>
  );
}
