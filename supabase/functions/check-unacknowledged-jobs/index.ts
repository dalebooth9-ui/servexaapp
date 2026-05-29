// 10am check: any job_schedule today still un-acknowledged → notify all admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const today = new Date().toISOString().split("T")[0];

    const { data: unack, error } = await supabase
      .from("job_schedule")
      .select("engineer_id, job_id")
      .eq("schedule_date", today)
      .is("acknowledged_at", null);
    if (error) throw error;
    if (!unack || unack.length === 0) {
      return new Response(JSON.stringify({ success: true, unacknowledged: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const engIds = [...new Set(unack.map((u) => u.engineer_id))];
    const jobIds = [...new Set(unack.map((u) => u.job_id))];

    const [{ data: profiles }, { data: jobs }, { data: admins }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", engIds),
      supabase.from("jobs").select("id, reference_number").in("id", jobIds),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);

    const nameOf = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
    const refOf = new Map((jobs || []).map((j) => [j.id, j.reference_number]));

    const rows: { user_id: string; title: string; message: string; job_id: string }[] = [];
    for (const u of unack) {
      const eng = nameOf.get(u.engineer_id) || "An engineer";
      const ref = refOf.get(u.job_id) || u.job_id;
      for (const a of admins || []) {
        rows.push({
          user_id: a.user_id,
          title: "Unacknowledged job",
          message: `${eng} hasn't acknowledged ${ref} scheduled for today.`,
          job_id: u.job_id,
        });
      }
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("notifications").insert(rows);
      if (insErr) throw insErr;
    }

    return new Response(JSON.stringify({ success: true, unacknowledged: unack.length, admin_alerts: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
