import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth guard — require authenticated admin user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const token = authHeader.replace("Bearer ", "");
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch PPM schedules with asset info
    const today = new Date().toISOString().split("T")[0];
    const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data: ppmData, error: ppmError } = await supabase
      .from("ppm_schedules")
      .select("*, assets(name, category, status, site_id, sites(name, address))")
      .eq("status", "active")
      .lte("next_due_date", sixtyDaysFromNow)
      .order("next_due_date", { ascending: true })
      .limit(50);

    if (ppmError) throw ppmError;

    if (!ppmData || ppmData.length === 0) {
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to analyse patterns and generate insights
    const systemPrompt = `You are a predictive maintenance AI for a fire safety company.
Analyse the provided PPM (Planned Preventive Maintenance) data and generate actionable alerts.
Return ONLY valid JSON with no markdown. Use the fill_alerts tool.`;

    const userPrompt = `Analyse these upcoming and overdue PPM schedules and generate priority alerts:

${ppmData.map(p => `
- ID: ${p.id}
  Asset: ${(p as any).assets?.name || "Unknown"} (${(p as any).assets?.category || "general"})
  Site: ${(p as any).assets?.sites?.name || "Unknown site"}
  Task: ${p.title}
  Next Due: ${p.next_due_date}
  Status: ${new Date(p.next_due_date) < new Date(today) ? "OVERDUE" : "UPCOMING"}
  Priority: ${p.priority}
  Frequency: Every ${p.frequency_interval} ${p.frequency_unit}
`).join("")}

Generate a concise alert for each, highlighting overdue items first. Rate severity as critical (overdue), high (due within 7 days), medium (due within 30 days), or low (due within 60 days).`;

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
              name: "fill_alerts",
              description: "Return predictive maintenance alerts",
              parameters: {
                type: "object",
                properties: {
                  alerts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ppm_id: { type: "string" },
                        asset_name: { type: "string" },
                        site_name: { type: "string" },
                        task: { type: "string" },
                        next_due_date: { type: "string" },
                        severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                        message: { type: "string" },
                        recommendation: { type: "string" },
                      },
                      required: ["ppm_id", "asset_name", "task", "next_due_date", "severity", "message", "recommendation"],
                    },
                  },
                },
                required: ["alerts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "fill_alerts" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fallback: return raw PPM data without AI insights
      const rawAlerts = ppmData.map(p => ({
        ppm_id: p.id,
        asset_name: (p as any).assets?.name || "Unknown asset",
        site_name: (p as any).assets?.sites?.name || "Unknown site",
        task: p.title,
        next_due_date: p.next_due_date,
        severity: new Date(p.next_due_date) < new Date(today) ? "critical"
          : new Date(p.next_due_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ? "high"
          : new Date(p.next_due_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ? "medium"
          : "low",
        message: `${p.title} is ${new Date(p.next_due_date) < new Date(today) ? "overdue" : "due soon"}`,
        recommendation: `Schedule maintenance for ${(p as any).assets?.name || "this asset"}`,
      }));
      return new Response(JSON.stringify({ alerts: rawAlerts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-predictive-maintenance error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
