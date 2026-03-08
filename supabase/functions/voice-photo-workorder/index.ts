import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const { voice_transcript, photo_base64, photo_mime_type, context } = body;

    if (!voice_transcript && !photo_base64) {
      return new Response(JSON.stringify({ error: "Provide voice_transcript or photo_base64" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `You are an expert field service work order generator for a fire safety company.
Your task is to extract structured work order data from a voice note transcript or photo description.
Be thorough, accurate, and infer reasonable defaults from fire safety industry standards.
Return ONLY valid JSON matching this exact schema:
{
  "name": "string (concise job title)",
  "description": "string (full scope of work, markdown formatted)",
  "category": "string (e.g. Dry Riser, Sprinkler, Fire Alarm, Extinguisher, Emergency Lighting)",
  "priority": "high" | "medium" | "low",
  "job_type": "one_off" | "recurring",
  "estimated_duration_hours": number,
  "required_parts": [{"name": "string", "quantity": number, "unit": "string"}],
  "safety_requirements": ["string"],
  "customer_name": "string or null",
  "site_address": "string or null",
  "due_date": "yyyy-MM-dd or null",
  "confidence": 0-100,
  "notes": "string (anything uncertain or requiring verification)"
}`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (photo_base64) {
      const mime = photo_mime_type || "image/jpeg";
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Generate a complete work order from this site photo. ${voice_transcript ? `Additional voice note context: "${voice_transcript}"` : ""} ${context ? `Extra context: ${context}` : ""}`,
          },
          { type: "image_url", image_url: { url: `data:${mime};base64,${photo_base64}` } },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Generate a complete work order from this voice note transcript:\n\n"${voice_transcript}"\n\n${context ? `Additional context: ${context}` : ""}`,
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: photo_base64 ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    let workorder: any;
    try { workorder = JSON.parse(content); } catch { throw new Error("Invalid JSON from AI"); }

    return new Response(JSON.stringify({ workorder }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("voice-photo-workorder error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
