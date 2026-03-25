import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { lat, lng, address } = body;

    const apiKey = Deno.env.get("WHAT3WORDS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "WHAT3WORDS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Address → words (geocode the address first via W3W autosuggest or just return null if only address) ---
    // Since W3W doesn't geocode raw addresses directly, we use the lat/lng path only.
    // For address-based lookups we fall back gracefully.
    if (address && typeof address === "string") {
      // W3W does not offer address→coordinates; return null gracefully
      return new Response(JSON.stringify({ words: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latNum = typeof lat === "number" ? lat : parseFloat(lat);
    const lngNum = typeof lng === "number" ? lng : parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return new Response(JSON.stringify({ error: "lat and lng must be valid numbers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&language=en&format=json&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      const bodyText = await response.text();
      return new Response(JSON.stringify({ error: `W3W API error [${response.status}]: ${bodyText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const words = data.words as string | undefined;

    return new Response(JSON.stringify({ words: words ? `///${words}` : null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

