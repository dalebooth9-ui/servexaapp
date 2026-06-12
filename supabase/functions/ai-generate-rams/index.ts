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

    const flagged = Object.entries(factors || {})
      .filter(([, v]) => v)
      .map(([k]) => FACTOR_LABELS[k] || k.replace(/_/g, " "));
    const factorList = flagged.length ? flagged.join(", ") : "none flagged";

    const systemPrompt = `You are a senior UK fire-protection Health & Safety Advisor authoring Risk Assessments and Method Statements (RAMS) for fire-protection contractors.

Author the RAMS in compliance with UK legislation and standards, using correct UK construction and fire-safety terminology, including:
- Health and Safety at Work etc. Act 1974 (HASAWA)
- Construction (Design and Management) Regulations 2015 (CDM 2015) — roles of Client, Principal Designer, Principal Contractor
- Management of Health and Safety at Work Regulations 1999
- Work at Height Regulations 2005, Confined Spaces Regulations 1997, Control of Asbestos Regulations 2012, Manual Handling Operations Regulations 1992, PPE at Work Regulations 2022, Electricity at Work Regulations 1989, Hot Work / DSEAR / RIDDOR where relevant
- Fire standards: BS 9990, BS 5306, BS 5839, BS 7273, EN 12845

STRICT RULES:
1. Only include hazards that are genuinely relevant to the works described OR to a flagged risk factor. Do NOT pad with generic hazards that don't apply.
2. Every flagged risk factor must produce at least one hazard row.
3. Risk ratings are categorical: "Low", "Medium" or "High" only (no numbers).
4. Initial rating = before controls. Residual rating = after controls have been applied.
5. Control measures must be specific and actionable (e.g. "MEWP operator IPAF trained, daily pre-use inspection, exclusion zone barriered at ground level"), not vague.
6. Sequence of works must be numbered, logical steps from arrival on site to leaving site.
7. PPE, plant & equipment, emergency and welfare arrangements must reflect a UK fire-protection site.
8. Return ONLY the function call — no prose.`;

    const userPrompt = `Site: ${site_name || "(no site)"}
Client: ${client_name || "(no client)"}
Site address: ${site_address || "(no address)"}

Flagged risk factors: ${factorList}

Description of works:
${works_description || "(none provided)"}

Generate a Draft RAMS tailored to these works only.`;

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
            description: "Return a UK-compliant draft RAMS for fire-protection works",
            parameters: {
              type: "object",
              properties: {
                risk_assessment: {
                  type: "array",
                  description: "Hazard rows. Only hazards relevant to the works and flagged factors.",
                  items: {
                    type: "object",
                    properties: {
                      hazard: { type: "string", description: "The hazard itself, e.g. 'Falls from height while accessing landing valves'" },
                      who_at_risk: { type: "string", description: "Who is at risk, e.g. 'Operatives, building occupants, members of the public'" },
                      initial_risk_rating: { type: "string", enum: ["Low", "Medium", "High"], description: "Risk before controls" },
                      control_measures: { type: "string", description: "Specific control measures (PPE, procedures, training, isolations, permits, etc.)" },
                      residual_risk_rating: { type: "string", enum: ["Low", "Medium", "High"], description: "Risk after controls applied" },
                    },
                    required: ["hazard", "who_at_risk", "initial_risk_rating", "control_measures", "residual_risk_rating"],
                    additionalProperties: false,
                  },
                },
                method_statement: {
                  type: "object",
                  properties: {
                    sequence: {
                      type: "array",
                      description: "Numbered, logical sequence of works from arrival to departure",
                      items: { type: "string" },
                    },
                    ppe: { type: "array", items: { type: "string" }, description: "PPE required (e.g. 'Hi-vis vest', 'Safety helmet to EN 397', 'Cut-resistant gloves')" },
                    plant_equipment: { type: "array", items: { type: "string" }, description: "Plant and equipment (e.g. 'MEWP/podium step', 'Calibrated pressure test pump', 'LOTO kit')" },
                    emergency_arrangements: { type: "string", description: "Emergency arrangements — first aid, fire, evacuation routes, RIDDOR reporting, nearest A&E if relevant" },
                    welfare_arrangements: { type: "string", description: "Welfare provision on site or arranged off-site (toilets, drinking water, breaks, rest area)" },
                  },
                  required: ["sequence", "ppe", "plant_equipment", "emergency_arrangements", "welfare_arrangements"],
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

    // Normalise welfare key for downstream consumers that used "welfare"
    if (result?.method_statement?.welfare_arrangements && !result.method_statement.welfare) {
      result.method_statement.welfare = result.method_statement.welfare_arrangements;
    }

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
