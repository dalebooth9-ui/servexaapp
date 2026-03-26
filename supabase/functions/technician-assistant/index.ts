

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Accept any Bearer token (anon key or user JWT) — AI gateway is secured by LOVABLE_API_KEY
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { messages, job_context } = await req.json();

    const systemPrompt = `You are a real-time AI assistant for field technicians at a fire safety company.
You help engineers diagnose faults, identify required parts, understand procedures, and solve problems on-site.

Current job context:
- Job: ${job_context?.job_name || "Unknown"}
- Category: ${job_context?.category || "Unknown"}
- Customer: ${job_context?.customer || "Unknown"}
- Site: ${job_context?.site || "Unknown"}
- Priority: ${job_context?.priority || "medium"}
- Description: ${job_context?.description || "None provided"}

Your capabilities:
1. **Fault Diagnosis**: Walk through systematic diagnostic steps for fire safety systems
2. **Parts Identification**: Suggest specific parts, model numbers, and quantities needed
3. **Procedures**: Provide step-by-step procedures following BS EN standards
4. **Safety**: Always highlight safety-critical steps and isolation procedures
5. **Escalation**: Advise when to escalate to specialist or halt work

Be concise, practical, and actionable. Format responses with clear headers and bullet points.
If recommending parts, always include: part name, likely part number range, quantity, and where it fits in the system.
Always consider BS 5306, BS 9990, BS 5839, BS 5266 standards as appropriate to the system type.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || []),
        ],
        stream: true,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status}`);
    }

    return new Response(aiRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (err: any) {
    console.error("technician-assistant error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
