import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY not configured");

    const { waypoints, origin } = await req.json();
    // waypoints: Array of { address: string, job_id: string }
    // origin: { lat: number, lng: number } | { address: string } | null

    if (!waypoints || waypoints.length < 2) {
      return new Response(JSON.stringify({ optimised: waypoints || [], legs: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let originStr: string;
    if (origin && typeof (origin as any).lat === "number" && typeof (origin as any).lng === "number") {
      originStr = `${(origin as any).lat},${(origin as any).lng}`;
    } else if (origin && typeof (origin as any).address === "string") {
      originStr = (origin as any).address;
    } else {
      originStr = waypoints[0].address;
    }
    const destinationStr = waypoints[waypoints.length - 1].address;
    // When an explicit origin is provided, all waypoints are intermediate stops
    const hasExplicitOrigin = origin != null;
    const intermediatesArr = hasExplicitOrigin
      ? waypoints.slice(0, -1).map((w: any) => w.address)
      : (waypoints.length > 2 ? waypoints.slice(1, -1).map((w: any) => w.address) : []);
    const intermediates = intermediatesArr.join("|");

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", originStr);
    url.searchParams.set("destination", destinationStr);
    if (intermediates) {
      url.searchParams.set("waypoints", `optimize:true|${intermediates}`);
    }
    // Live traffic: ask Google for traffic-aware durations and pick the best route now
    url.searchParams.set("departure_time", "now");
    url.searchParams.set("traffic_model", "best_guess");
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    let data: any;
    try {
      const resp = await fetch(url.toString());
      data = await resp.json();
    } catch (fetchErr) {
      return new Response(JSON.stringify({ error: "Route optimisation failed", reason: "NETWORK_ERROR" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data.status !== "OK") {
      return new Response(JSON.stringify({ error: "Route optimisation failed", reason: data.status || "UNKNOWN" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const route = data.routes[0];
    const waypointOrder = route.waypoint_order || [];

    // Reorder waypoints based on Google's optimisation
    let optimised = waypoints;
    if (waypointOrder.length > 0) {
      if (hasExplicitOrigin) {
        // All waypoints (except last) are intermediates when origin is explicit
        const middle = waypointOrder.map((i: number) => waypoints[i]);
        optimised = [...middle, waypoints[waypoints.length - 1]];
      } else {
        const middle = waypointOrder.map((i: number) => waypoints[i + 1]); // +1 because origin is waypoints[0]
        optimised = [waypoints[0], ...middle, waypoints[waypoints.length - 1]];
      }
    }

    const legs = route.legs.map((leg: any) => ({
      distance: leg.distance.text,
      duration: leg.duration.text,
      duration_in_traffic: leg.duration_in_traffic?.text ?? null,
      duration_in_traffic_seconds: leg.duration_in_traffic?.value ?? null,
      start_address: leg.start_address,
      end_address: leg.end_address,
    }));

    const totalDistance = route.legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0);
    const totalDuration = route.legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0);
    const totalDurationTraffic = route.legs.reduce(
      (sum: number, leg: any) => sum + (leg.duration_in_traffic?.value ?? leg.duration.value),
      0,
    );

    return new Response(JSON.stringify({
      optimised,
      legs,
      total_distance_km: Math.round(totalDistance / 100) / 10,
      total_duration_mins: Math.round(totalDuration / 60),
      total_duration_in_traffic_mins: Math.round(totalDurationTraffic / 60),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
