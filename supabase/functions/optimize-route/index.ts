// Routes API-based route optimiser.
// Uses a server-side Google Maps key (GOOGLE_MAPS_SERVER_KEY) so we're not bound
// by browser referer restrictions and can use the modern Routes API, which is
// required for newly-created Google Cloud projects (legacy Directions API is
// no longer enabled for new projects).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Waypoint = { address: string; job_id: string };
type OriginInput =
  | { lat: number; lng: number }
  | { address: string }
  | null
  | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const SERVER_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
  if (!SERVER_KEY) {
    return json({
      error: "server_key_missing",
      message:
        "GOOGLE_MAPS_SERVER_KEY is not configured. Add it in Project Settings → Secrets (a server-side, non-referer-restricted Google Maps key with Routes API + Geocoding API enabled).",
    }, 503);
  }

  let body: { waypoints?: Waypoint[]; origin?: OriginInput };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  const waypoints = Array.isArray(body.waypoints) ? body.waypoints : [];
  if (waypoints.length < 2) {
    return json({ optimised: waypoints, legs: [], total_distance_km: 0, total_duration_mins: 0, total_duration_in_traffic_mins: 0 });
  }
  const origin = body.origin ?? null;
  const hasExplicitOrigin = origin != null;

  // Compose the ordered list of stops the way we'll ask Routes API to reason about them.
  // If an explicit origin is provided, it's the START, all waypoints are intermediates (last one becomes destination).
  // Otherwise waypoints[0] is origin, waypoints[last] is destination, middle are intermediates.
  const originWp: { address?: string; latLng?: { latitude: number; longitude: number } } = (() => {
    if (origin && typeof (origin as any).lat === "number") {
      return { latLng: { latitude: (origin as any).lat, longitude: (origin as any).lng } };
    }
    if (origin && typeof (origin as any).address === "string") {
      return { address: (origin as any).address };
    }
    return { address: waypoints[0].address };
  })();

  const destinationAddress = waypoints[waypoints.length - 1].address;
  const intermediateWps: Waypoint[] = hasExplicitOrigin
    ? waypoints.slice(0, -1)
    : waypoints.slice(1, -1);

  const routesBody = {
    origin: originWp.latLng
      ? { location: { latLng: originWp.latLng } }
      : { address: originWp.address },
    destination: { address: destinationAddress },
    intermediates: intermediateWps.map((w) => ({ address: w.address })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    optimizeWaypointOrder: true,
    languageCode: "en-GB",
    regionCode: "GB",
    units: "METRIC",
    departureTime: new Date(Date.now() + 60_000).toISOString(),
  };

  const fieldMask = [
    "routes.optimizedIntermediateWaypointIndex",
    "routes.polyline.encodedPolyline",
    "routes.duration",
    "routes.distanceMeters",
    "routes.legs.duration",
    "routes.legs.staticDuration",
    "routes.legs.distanceMeters",
    "routes.legs.startLocation",
    "routes.legs.endLocation",
  ].join(",");

  let apiRes: Response;
  try {
    apiRes = await fetch(
      `https://routes.googleapis.com/directions/v2:computeRoutes?key=${SERVER_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(routesBody),
      },
    );
  } catch (err) {
    return json({ error: "network_error", message: (err as Error).message }, 502);
  }

  const text = await apiRes.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

  if (!apiRes.ok) {
    const gErr = payload?.error;
    return json({
      error: "routes_api_error",
      status: apiRes.status,
      google_status: gErr?.status,
      google_code: gErr?.code,
      message: gErr?.message || text || "Routes API request failed",
      details: gErr?.details,
    }, apiRes.status);
  }

  const route = payload?.routes?.[0];
  if (!route) {
    return json({ error: "no_route", message: "Routes API returned no routes.", raw: payload }, 400);
  }

  const order: number[] = Array.isArray(route.optimizedIntermediateWaypointIndex)
    ? route.optimizedIntermediateWaypointIndex
    : [];

  // Reorder waypoints array using the returned intermediate order.
  let optimised: Waypoint[] = waypoints;
  if (order.length > 0) {
    if (hasExplicitOrigin) {
      const middle = order.map((i: number) => intermediateWps[i]).filter(Boolean);
      optimised = [...middle, waypoints[waypoints.length - 1]];
    } else {
      const middle = order.map((i: number) => waypoints[i + 1]).filter(Boolean);
      optimised = [waypoints[0], ...middle, waypoints[waypoints.length - 1]];
    }
  }

  // Parse Google duration strings like "1234s"
  const parseSecs = (s: unknown): number => {
    if (typeof s === "string" && s.endsWith("s")) return Number(s.slice(0, -1)) || 0;
    if (typeof s === "number") return s;
    return 0;
  };

  const legs = (route.legs ?? []).map((leg: any) => {
    const trafficSecs = parseSecs(leg.duration);
    const baseSecs = parseSecs(leg.staticDuration) || trafficSecs;
    return {
      distance: `${((leg.distanceMeters ?? 0) / 1000).toFixed(1)} km`,
      duration: `${Math.round(baseSecs / 60)} min`,
      duration_in_traffic: `${Math.round(trafficSecs / 60)} min`,
      duration_in_traffic_seconds: trafficSecs,
      start_address: "",
      end_address: "",
    };
  });

  const totalMeters = route.distanceMeters ?? 0;
  const totalTrafficSecs = parseSecs(route.duration);
  const totalBaseSecs = (route.legs ?? []).reduce(
    (acc: number, l: any) => acc + (parseSecs(l.staticDuration) || parseSecs(l.duration)),
    0,
  ) || totalTrafficSecs;

  return json({
    optimised,
    legs,
    total_distance_km: Math.round(totalMeters / 100) / 10,
    total_duration_mins: Math.round(totalBaseSecs / 60),
    total_duration_in_traffic_mins: Math.round(totalTrafficSecs / 60),
    encoded_polyline: route.polyline?.encodedPolyline ?? null,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
