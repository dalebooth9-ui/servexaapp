import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-stream-mode",
};

serve(async (req) => {
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
    const body = await req.json();
    const { job } = body;
    // Non-streaming mode is requested via header or body flag
    const streamMode = req.headers.get("x-stream-mode") !== "false" && body.stream !== false;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert field service operations manager for a UK fire safety company specialising in dry risers, sprinkler systems, fire extinguishers, and fire hydrants.
Generate a clear, professional job brief for engineers attending a job.
Format your response in clean markdown with sections:
## Overview
## Scope of Work
## Safety Requirements  
## Access & Site Information
## Equipment & Parts
## Completion Criteria
Keep it concise but actionable. Engineers should know exactly what to do.

CRITICAL DOMAIN RULES — you must follow these exactly:
- Dry riser pressure tests are ALWAYS hydraulic (water-filled) tests in accordance with BS 9990:2015. NEVER reference air pressure tests for dry risers — air pressure testing is NOT part of BS 9990:2015 and must never be mentioned.
- Dry riser annual service and pressure test: test pressure is typically 12 bar for 15 minutes per BS 9990:2015 clause 7.
- Dry riser visual inspection: no pressure test involved — visual checks only per BS 9990:2015.
- Sprinkler systems: reference BS EN 12845:2015.
- Fire extinguishers: reference BS 5306-3:2017.
- Fire hydrants: reference BS 9990:2015 / NFCC Guidelines (6-month check).
- Always use UK English spelling and British Standards references.`;

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
        stream: streamMode,
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

    if (streamMode) {
      // Return SSE stream for the interactive dialog
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    } else {
      // Return full JSON for background save
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("ai-job-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
