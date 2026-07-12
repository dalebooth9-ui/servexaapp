import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { headers, sampleRows, targetFields, entity } = await req.json();
    if (!Array.isArray(headers) || !Array.isArray(targetFields) || !entity) {
      return new Response(JSON.stringify({ error: "headers, sampleRows, targetFields, entity are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const targetList = (targetFields as Array<{ key: string; label: string; required?: boolean; hint?: string }>)
      .map((f) => `- ${f.key}${f.required ? " (required)" : ""}: ${f.label}${f.hint ? " — " + f.hint : ""}`)
      .join("\n");

    const sampleTable = [headers.join(" | "), ...(sampleRows || []).slice(0, 5).map((r: string[]) => r.join(" | "))].join("\n");

    const system = `You map spreadsheet columns from a customer-imported file to a fixed set of target fields for entity "${entity}". Return ONLY a JSON object of the form {"mapping": { targetKey: sourceHeader | null, ... }} where each targetKey is one of the listed field keys and each sourceHeader is EXACTLY one of the source headers, or null if no source column fits. Each source header may be used at most once. Do not invent headers. Do not include any prose.`;

    const user = `Target fields:\n${targetList}\n\nSource file sample (first row is headers):\n${sampleTable}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI mapping error", aiRes.status, txt);
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI mapping failed", mapping: {} }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let mapping: Record<string, string | null> = {};
    try {
      const cleaned = content.replace(/```json?/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(cleaned.substring(start, end + 1));
      mapping = parsed.mapping || parsed || {};
    } catch (e) {
      console.error("Parse mapping failed", content);
    }
    return new Response(JSON.stringify({ mapping }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("suggest-import-mapping error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
