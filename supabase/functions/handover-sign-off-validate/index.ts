import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) return new Response(JSON.stringify({ error: "Token required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up token
    const { data: record, error: tokErr } = await supabase
      .from("installation_handover_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokErr || !record) return new Response(JSON.stringify({ error: "Invalid or expired link" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
    if (new Date(record.expires_at) < new Date()) return new Response(JSON.stringify({ error: "This link has expired" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 410 });

    // Fetch project
    const { data: project } = await supabase
      .from("installation_projects")
      .select("*")
      .eq("id", record.project_id)
      .single();

    // Fetch issues
    const { data: issues } = await supabase
      .from("installation_issues")
      .select("id, title, status, priority, area, description")
      .eq("project_id", record.project_id)
      .order("sort_order");

    // Fetch checklist
    const { data: checklist } = await supabase
      .from("pre_completion_checklist_items")
      .select("id, label, checked, category")
      .eq("job_id", record.job_id)
      .order("sort_order");

    return new Response(
      JSON.stringify({ record, project, issues: issues || [], checklist: checklist || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
