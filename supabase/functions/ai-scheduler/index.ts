import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth guard
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { jobs, engineers, weekStart, existingSchedule } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (!jobs?.length || !engineers?.length) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert field service scheduler for a fire safety company.
Your job is to assign unscheduled jobs to engineers across a working week (Monday to Friday).

Rules:
- Distribute jobs evenly across engineers and days
- Prioritise HIGH priority jobs first, then MEDIUM, then LOW
- Schedule jobs with closer due dates earlier in the week
- Each engineer should not have more than 4-5 jobs per day
- Spread work geographically where possible (group nearby postcodes on same day)
- Return ONLY valid JSON matching the exact schema requested
- Use dates in yyyy-MM-dd format
- Only use engineer IDs and job IDs from the provided lists`;

    const userPrompt = `Schedule these ${jobs.length} unscheduled jobs for ${engineers.length} engineers.

Week starts: ${weekStart} (Mon). Working days: Mon, Tue, Wed, Thu, Fri.

ENGINEERS:
${engineers.map((e: any) => `- ID: ${e.user_id} | Name: ${e.full_name}`).join("\n")}

UNSCHEDULED JOBS:
${jobs.map((j: any) => `- ID: ${j.id} | Name: ${j.name} | Priority: ${j.priority} | Due: ${j.due_date || "none"} | Postcode: ${j.site?.postcode || j.address || "unknown"} | Customer: ${j.customer || "none"}`).join("\n")}

ALREADY SCHEDULED THIS WEEK (for context/load balancing):
${existingSchedule?.length ? existingSchedule.map((s: any) => `- Engineer: ${s.engineer_id} | Date: ${s.schedule_date}`).join("\n") : "None"}

Return a JSON object with a "suggestions" array. Each item:
{
  "job_id": "string",
  "engineer_id": "string", 
  "date": "yyyy-MM-dd",
  "reason": "brief reason (max 10 words)"
}`;

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
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from AI");

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Invalid JSON from AI");
    }

    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    // Validate each suggestion has required fields
    const valid = suggestions.filter(
      (s: any) =>
        typeof s.job_id === "string" &&
        typeof s.engineer_id === "string" &&
        typeof s.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(s.date)
    );

    return new Response(JSON.stringify({ suggestions: valid, total: valid.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("AI scheduler error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
