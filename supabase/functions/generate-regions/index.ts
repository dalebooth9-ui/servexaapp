import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UK postcode area → region name mapping
const POSTCODE_REGIONS: Record<string, string> = {
  // London
  E: "London", EC: "London", N: "London", NW: "London", SE: "London", SW: "London",
  W: "London", WC: "London", BR: "London", CR: "London", DA: "London", EN: "London",
  HA: "London", IG: "London", KT: "London", RM: "London", SM: "London", TW: "London",
  UB: "London", WD: "London",
  // South East
  BN: "South East", CT: "South East", GU: "South East", ME: "South East", MK: "South East",
  OX: "South East", PO: "South East", RG: "South East", RH: "South East", SL: "South East",
  SO: "South East", TN: "South East", HP: "South East",
  // South West
  BA: "South West", BH: "South West", BS: "South West", DT: "South West", EX: "South West",
  GL: "South West", PL: "South West", SN: "South West", SP: "South West", TA: "South West",
  TQ: "South West", TR: "South West",
  // East of England
  AL: "East of England", CB: "East of England", CM: "East of England", CO: "East of England",
  IP: "East of England", LU: "East of England", NR: "East of England", PE: "East of England",
  SG: "East of England", SS: "East of England",
  // West Midlands
  B: "West Midlands", CV: "West Midlands", DY: "West Midlands", HR: "West Midlands",
  ST: "West Midlands", TF: "West Midlands", WR: "West Midlands", WS: "West Midlands",
  WV: "West Midlands",
  // East Midlands
  DE: "East Midlands", LE: "East Midlands", LN: "East Midlands", NG: "East Midlands",
  NN: "East Midlands",
  // Yorkshire & Humber
  BD: "Yorkshire & Humber", DN: "Yorkshire & Humber", HD: "Yorkshire & Humber",
  HG: "Yorkshire & Humber", HU: "Yorkshire & Humber", HX: "Yorkshire & Humber",
  LS: "Yorkshire & Humber", S: "Yorkshire & Humber", WF: "Yorkshire & Humber",
  YO: "Yorkshire & Humber",
  // North West
  BB: "North West", BL: "North West", CA: "North West", CH: "North West",
  CW: "North West", FY: "North West", L: "North West", LA: "North West",
  M: "North West", OL: "North West", PR: "North West", SK: "North West",
  WA: "North West", WN: "North West",
  // North East
  DH: "North East", DL: "North East", NE: "North East", SR: "North East",
  TS: "North East",
  // Wales
  CF: "Wales", LD: "Wales", LL: "Wales", NP: "Wales", SA: "Wales", SY: "Wales",
  // Scotland
  AB: "Scotland", DD: "Scotland", DG: "Scotland", EH: "Scotland", FK: "Scotland",
  G: "Scotland", IV: "Scotland", KA: "Scotland", KW: "Scotland", KY: "Scotland",
  ML: "Scotland", PA: "Scotland", PH: "Scotland", TD: "Scotland", ZE: "Scotland",
  // Northern Ireland
  BT: "Northern Ireland",
};

function getRegionFromPostcode(postcode: string): string {
  if (!postcode) return "Unassigned Region";
  const clean = postcode.toUpperCase().replace(/\s/g, "");
  // Try 2-letter match first, then 1-letter
  const two = clean.substring(0, 2).replace(/[0-9]/g, "");
  const one = clean.substring(0, 1);
  return POSTCODE_REGIONS[two] || POSTCODE_REGIONS[one] || "Other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: isAdmin } = await supabase.rpc("is_admin_direct", { _user_id: user.id });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });

    // Fetch all top-level sites (site_type = 'site', no parent)
    const { data: topSites, error: fetchErr } = await supabase
      .from("sites")
      .select("id, postcode, parent_id")
      .eq("site_type", "site")
      .is("parent_id", null);

    if (fetchErr) throw fetchErr;
    if (!topSites || topSites.length === 0) {
      return new Response(JSON.stringify({ message: "No unparented sites found", created: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Group sites by region
    const regionGroups = new Map<string, string[]>();
    for (const site of topSites) {
      const region = getRegionFromPostcode(site.postcode || "");
      if (!regionGroups.has(region)) regionGroups.set(region, []);
      regionGroups.get(region)!.push(site.id);
    }

    // Check for existing regions
    const { data: existingRegions } = await supabase
      .from("sites")
      .select("id, name")
      .eq("site_type", "region");

    const existingMap = new Map<string, string>();
    for (const r of existingRegions || []) {
      existingMap.set(r.name, r.id);
    }

    let created = 0;
    let updated = 0;

    for (const [regionName, siteIds] of regionGroups.entries()) {
      let regionId = existingMap.get(regionName);

      if (!regionId) {
        // Create region
        const { data: newRegion, error: insertErr } = await supabase
          .from("sites")
          .insert({ name: regionName, site_type: "region" })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        regionId = newRegion.id;
        created++;
      }

      // Update sites to have this region as parent
      const { error: updateErr } = await supabase
        .from("sites")
        .update({ parent_id: regionId })
        .in("id", siteIds);
      if (updateErr) throw updateErr;
      updated += siteIds.length;
    }

    return new Response(
      JSON.stringify({ message: `Created ${created} regions, assigned ${updated} sites`, created, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
