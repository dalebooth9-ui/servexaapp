import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACTOR_LABELS: Record<string, string> = {
  working_at_height: "Working at height",
  hot_works: "Hot works",
  confined_space: "Confined space",
  asbestos_present: "Asbestos present",
  live_systems: "Live / energised systems",
  occupied_building: "Occupied / public building",
  lone_working: "Lone working",
  manual_handling: "Manual handling",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { site_name, client_name, site_address, works_description, factors } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const factorList = Object.entries(factors || {})
      .filter(([, v]) => v)
      .map(([k]) => FACTOR_LABELS[k] || k.replace(/_/g, " "))
      .join(", ") || "none flagged";

    const systemPrompt = `You are a senior UK fire-protection RAMS author (BS 9990, BS 5306, BS 5839, BS 7273, EN 12845).
Produce a draft Risk Assessment and Method Statement for the works described, tailored to fire protection trades.
Return ONLY a function call with the requested schema. Be concise, specific, and UK-compliant.
Risk ratings use 1-5 likelihood (L) and 1-5 severity (S); risk = L*S. Provide pre-control and post-control ratings.`;

    const userPrompt = `Site: ${site_name || "(no site)"}
Client: ${client_name || "(no client)"}
Address: ${site_address || "(no address)"}
Risk factors flagged: ${factorList}

Description of works:
${works_description || "(none provided)"}

Generate hazards covering the described works AND every flagged factor (including lone working and manual handling if flagged). Include welfare arrangements.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "draft_rams",
            description: "Return a draft RAMS",
            parameters: {
              type: "object",
              properties: {
                risk_assessment: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      hazard: { type: "string" },
                      who_at_risk: { type: "string" },
                      l_pre: { type: "integer" },
                      s_pre: { type: "integer" },
                      controls: { type: "string" },
                      l_post: { type: "integer" },
                      s_post: { type: "integer" },
                    },
                    required: ["hazard", "who_at_risk", "l_pre", "s_pre", "controls", "l_post", "s_post"],
                    additionalProperties: false,
                  },
                },
                method_statement: {
                  type: "object",
                  properties: {
                    sequence: { type: "array", items: { type: "string" } },
                    ppe: { type: "array", items: { type: "string" } },
                    plant_equipment: { type: "array", items: { type: "string" } },
                    emergency_arrangements: { type: "string" },
                    welfare: { type: "string" },
                  },
                  required: ["sequence", "ppe", "plant_equipment", "emergency_arrangements", "welfare"],
                  additionalProperties: false,
                },
              },
              required: ["risk_assessment", "method_statement"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "draft_rams" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit, please retry shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const txt = await response.text();
      throw new Error(`AI gateway ${response.status}: ${txt}`);
    }

    const data = await response.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) throw new Error("No tool call returned");
    const result = JSON.parse(tc.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-generate-rams error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
