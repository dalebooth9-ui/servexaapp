import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobName, category, address, customer, ramsType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a fire safety RAMS (Risk Assessment and Method Statement) expert.
Generate professional, compliance-ready RAMS content for UK fire safety work.
Return ONLY valid JSON matching this exact schema with no markdown wrapping:
{
  "description": "Brief project description (2-3 sentences)",
  "method_statement": "Step-by-step method statement (numbered list as a single string with newlines)",
  "hazards": ["hazard 1", "hazard 2", ...],
  "controls": ["control measure 1", "control measure 2", ...],
  "ppe": ["PPE item 1", "PPE item 2", ...]
}`;

    const ramsTypeLabel: Record<string, string> = {
      dry_riser: "Dry Riser System",
      sprinkler: "Sprinkler System",
      fire_extinguisher: "Fire Extinguisher",
      fire_hydrant: "Fire Hydrant",
    };

    const userPrompt = `Generate RAMS content for:
System Type: ${ramsTypeLabel[ramsType] || ramsType || "Fire Safety System"}
Job Name: ${jobName || "N/A"}
Category: ${category || "fire_safety"}
Customer: ${customer || "N/A"}
Site Address: ${address || "N/A"}

Tailor the method statement, hazards, and control measures specifically for ${ramsTypeLabel[ramsType] || "fire safety"} work in compliance with UK fire safety regulations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "fill_rams",
              description: "Fill RAMS fields with generated content",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  method_statement: { type: "string" },
                  hazards: { type: "array", items: { type: "string" } },
                  controls: { type: "array", items: { type: "string" } },
                  ppe: { type: "array", items: { type: "string" } },
                },
                required: ["description", "method_statement", "hazards", "controls", "ppe"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "fill_rams" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned from AI");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-rams-autofill error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
