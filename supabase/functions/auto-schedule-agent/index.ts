import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/emailFrom.ts";

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

  // Require admin role for all actions (execute uses service role key for side-effects)
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: claimsData.claims.sub,
    _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const { action, jobs, engineers, weekStart, context } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (action === "analyze") {
      // Analyze schedule and produce autonomous decisions + flagged exceptions
      const systemPrompt = `You are an autonomous field service scheduling agent for a fire safety company.
Your job is to analyze the current job schedule and make autonomous decisions for:
1. Rescheduling overdue/conflicted jobs
2. Identifying jobs that need customer notifications
3. Suggesting new work orders from recurring patterns

You operate AUTONOMOUSLY — only flag an exception when human intervention is truly needed (conflicts you cannot resolve, missing critical data, customer escalations, safety issues).

For each job analyze: priority, due date, engineer load, geographic clustering, customer impact.

Return ONLY valid JSON with this exact schema:
{
  "autonomous_actions": [
    {
      "type": "reschedule" | "notify_customer" | "create_workorder",
      "job_id": "string",
      "job_name": "string",
      "action_detail": "string (what the agent will do)",
      "confidence": 0-100,
      "execute": true
    }
  ],
  "exceptions": [
    {
      "type": "conflict" | "missing_data" | "escalation" | "safety",
      "job_id": "string",
      "job_name": "string",
      "reason": "string (why human input needed)",
      "suggested_action": "string",
      "priority": "high" | "medium" | "low"
    }
  ],
  "summary": "string (brief overview of what was decided)"
}`;

      const userPrompt = `Analyze and autonomously manage this schedule for week of ${weekStart}.

JOBS (${jobs?.length || 0}):
${(jobs || []).map((j: any) => `- ID: ${j.id} | ${j.reference_number} | ${j.name} | Status: ${j.status} | Priority: ${j.priority} | Due: ${j.due_date || "none"} | Customer: ${j.customer || "none"} | Engineer: ${j.assigned_engineer || "unassigned"} | Postcode: ${j.postcode || "unknown"}`).join("\n")}

ENGINEERS (${engineers?.length || 0}):
${(engineers || []).map((e: any) => `- ${e.full_name} | Jobs this week: ${e.job_count || 0} | Available: ${e.available !== false ? "yes" : "no"}`).join("\n")}

CONTEXT: ${context || "Standard week, no special constraints"}

Rules:
- AUTO-RESOLVE: overdue jobs with clear engineer availability → reschedule
- AUTO-RESOLVE: completed jobs needing customer notification → queue email
- AUTO-RESOLVE: jobs past due date pattern → suggest follow-up work order
- FLAG EXCEPTION: double-bookings you cannot resolve
- FLAG EXCEPTION: high-priority jobs with no available engineers
- FLAG EXCEPTION: jobs with missing site/customer data
- Never auto-execute anything with confidence < 70`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI gateway error: ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty AI response");

      let parsed: any;
      try { parsed = JSON.parse(content); } catch { throw new Error("Invalid JSON from AI"); }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "execute") {
      // Execute approved autonomous actions
      const { autonomous_actions } = body;
      const results: any[] = [];

      for (const act of (autonomous_actions || [])) {
        try {
          if (act.type === "reschedule" && act.new_engineer_id && act.new_date) {
            const { error } = await adminClient
              .from("job_schedule")
              .upsert({ job_id: act.job_id, engineer_id: act.new_engineer_id, schedule_date: act.new_date }, { onConflict: "job_id,engineer_id" });
            results.push({ job_id: act.job_id, type: "reschedule", success: !error, error: error?.message });
          }

          if (act.type === "notify_customer" && act.customer_email && RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: await getFromAddress("auto_schedule"),
                to: [act.customer_email],
                subject: act.email_subject || `Update on your job: ${act.job_name}`,
                html: `<p>${act.email_body || act.action_detail}</p>`,
              }),
            });
            results.push({ job_id: act.job_id, type: "notify_customer", success: true });
          }

          if (act.type === "create_workorder") {
            const { data: newJob, error } = await adminClient
              .from("jobs")
              .insert({
                name: act.workorder_name || `Follow-up: ${act.job_name}`,
                status: "active",
                priority: act.workorder_priority || "medium",
                job_type: "one_off",
                customer_id: act.customer_id || null,
                site_id: act.site_id || null,
                due_date: act.workorder_due_date || null,
                description: act.action_detail,
                created_by: claimsData.claims.sub,
              })
              .select("id, reference_number")
              .single();
            results.push({ job_id: act.job_id, type: "create_workorder", success: !error, new_job: newJob, error: error?.message });
          }
        } catch (e: any) {
          results.push({ job_id: act.job_id, type: act.type, success: false, error: e.message });
        }
      }

      return new Response(JSON.stringify({ results, executed: results.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("auto-schedule-agent error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
