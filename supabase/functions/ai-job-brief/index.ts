import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert field service operations manager for a fire safety company. 
Generate a clear, professional job brief for engineers attending a job.
Format your response in clean markdown with sections:
## Overview
## Scope of Work
## Safety Requirements  
## Access & Site Information
## Equipment & Parts
## Completion Criteria
Keep it concise but actionable. Engineers should know exactly what to do.`;

    const userPrompt = `Generate a job brief for the following job:

Job Name: ${job.name || "N/A"}
Reference: ${job.reference_number || "N/A"}
Category: ${job.category || "N/A"}
Priority: ${job.priority || "medium"}
Customer: ${job.customer || "N/A"}
Address: ${job.address || "N/A"}
Job Type: ${job.job_type || "one_off"}
Status: ${job.status || "active"}
${job.due_date ? `Due Date: ${job.due_date}` : ""}
${job.visual_qty ? `Visual Checks Required: ${job.visual_qty}` : ""}
${job.pressure_test_qty ? `Pressure Tests Required: ${job.pressure_test_qty}` : ""}
${job.other_service_type ? `Service Type: ${job.other_service_type}` : ""}`;

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
        stream: true,
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-job-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
