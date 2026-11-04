import { supabase } from "@/integrations/supabase/client";
import { riserOrFilter, type RiserType } from "@/lib/dryRisers";

export interface SiteRiser {
  id: string;
  asset_tag: string | null;
  riser_location: string | null;
  outlets_count: number | null;
  label_status: string;
  label_placed_at: string | null;
  label_printed_at?: string | null;
  asset_type: string | null;
}

/** Site's riser assets (dry and wet, or one type) in the riser picker order. */
export async function fetchSiteRisers(siteId: string, type?: RiserType | null): Promise<SiteRiser[]> {
  const { data, error } = await supabase.from("assets")
    .select("id, asset_tag, riser_location, outlets_count, label_status, label_placed_at, label_printed_at, asset_type")
    .eq("site_id", siteId)
    .or(riserOrFilter(type))
    .neq("status", "decommissioned")
    .order("riser_location")
    .order("created_at");
  if (error) throw error;
  return (data as SiteRiser[]) || [];
}
