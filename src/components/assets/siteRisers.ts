import { supabase } from "@/integrations/supabase/client";

export interface SiteRiser {
  id: string;
  asset_tag: string | null;
  riser_location: string | null;
  outlets_count: number | null;
  label_status: string;
  label_placed_at: string | null;
}

/** Site's Dry Riser assets in the same order as the job sheet riser picker. */
export async function fetchSiteRisers(siteId: string): Promise<SiteRiser[]> {
  const { data, error } = await supabase.from("assets")
    .select("id, asset_tag, riser_location, outlets_count, label_status, label_placed_at")
    .eq("site_id", siteId)
    .or("asset_type.ilike.dry%riser%,category.ilike.dry%riser%")
    .neq("status", "decommissioned")
    .order("riser_location")
    .order("created_at");
  if (error) throw error;
  return (data as SiteRiser[]) || [];
}
