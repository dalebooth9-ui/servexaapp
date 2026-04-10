import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("REACT_APP_GOOGLE_MAPS_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Google Maps API key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: Record<string, string> = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch { /* no body */ }

  // Proxy mode: geocode an address server-side (never exposes the key)
  if (body.address) {
    const encoded = encodeURIComponent(body.address);
    const mapsRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`
    );
    const mapsData = await mapsRes.json();
    return new Response(JSON.stringify(mapsData), {
      status: mapsRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Proxy mode: fetch a static map image server-side and stream it back
  if (body.staticmap) {
    // body.staticmap is the full query string (without the key)
    const mapsRes = await fetch(
      `https://maps.googleapis.com/maps/api/staticmap?${body.staticmap}&key=${apiKey}`
    );
    if (!mapsRes.ok) {
      return new Response(JSON.stringify({ error: "Static map fetch failed" }), {
        status: mapsRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const imgBuffer = await mapsRes.arrayBuffer();
    return new Response(imgBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": mapsRes.headers.get("content-type") || "image/png",
      },
    });
  }

  // Maps JavaScript SDK key — required so the <script> tag can load the SDK.
  // Restrict this key in Google Cloud Console to your domain (HTTP referrer
  // restriction) and to Maps JS API only to prevent abuse.
  return new Response(
    JSON.stringify({ apiKey }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
