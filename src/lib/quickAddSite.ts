import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_REGION_NAME = "General";
export const DEFAULT_BUILDING_NAME = "Main building";

/**
 * Creates a site from just a name and address. A default region (reused if it
 * already exists) and a default building are made so the optional structure is in place.
 */
export async function quickAddSite(input: { name: string; address: string; customerId?: string | null }) {
  const name = input.name.trim();
  const address = input.address.trim() || null;
  if (!name) throw new Error("Please enter a site name.");
  const { data: region } = await supabase.from("sites").select("id").eq("site_type", "region").ilike("name", DEFAULT_REGION_NAME).is("deleted_at" as any, null).limit(1).maybeSingle();
  let regionId = region?.id as string | undefined;
  if (!regionId) {
    const { data, error } = await supabase.from("sites").insert({ name: DEFAULT_REGION_NAME, site_type: "region" } as any).select("id").single();
    if (error) throw error;
    regionId = data.id;
  }
  const { data: site, error } = await supabase.from("sites").insert({ name, address, site_type: "site", parent_id: regionId } as any).select("id, name, address, postcode").single();
  if (error) throw error;
  await supabase.from("sites").insert({ name: DEFAULT_BUILDING_NAME, address, site_type: "building", parent_id: site.id } as any);
  if (input.customerId) {
    const { error: linkErr } = await supabase.from("customer_sites" as any).insert({ customer_id: input.customerId, site_id: site.id });
    if (linkErr) throw linkErr;
  }
  return site as { id: string; name: string; address: string | null; postcode: string | null };
}

/** Existing (non-merged) sites to compare a new name against. */
export async function loadSiteNamesForCheck(customerId?: string | null): Promise<{ id: string; name: string }[]> {
  let q = supabase.from("sites").select("id, name").in("site_type", ["site", "building"]).is("deleted_at" as any, null).limit(1000);
  if (customerId) {
    const { data: links } = await supabase.from("customer_sites").select("site_id").eq("customer_id", customerId);
    const ids = (links || []).map((l: any) => l.site_id);
    if (!ids.length) return [];
    q = q.in("id", ids.slice(0, 500));
  }
  const { data } = await q;
  return (data || []) as any;
}
