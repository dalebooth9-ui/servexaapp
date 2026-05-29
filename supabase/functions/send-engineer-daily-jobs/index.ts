// Daily 7am push: insert one "Today's jobs" notification per engineer scheduled today.
// Engineers see it via realtime in NotificationBell.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
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

    const { data: schedules, error } = await supabase
      .from("job_schedule")
      .select("engineer_id, job_id")
      .eq("schedule_date", today);
    if (error) throw error;

    // group by engineer
    const byEng = new Map<string, string[]>();
    (schedules || []).forEach((s) => {
      const arr = byEng.get(s.engineer_id) || [];
      arr.push(s.job_id);
      byEng.set(s.engineer_id, arr);
    });

    const rows: { user_id: string; title: string; message: string; job_id: string | null }[] = [];
    for (const [engineerId, jobIds] of byEng.entries()) {
      const n = jobIds.length;
      rows.push({
        user_id: engineerId,
        title: "Today's jobs",
        message: `You have ${n} job${n === 1 ? "" : "s"} scheduled today. Tap to view & acknowledge.`,
        job_id: jobIds[0] ?? null,
      });
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("notifications").insert(rows);
      if (insErr) throw insErr;
    }

    return new Response(JSON.stringify({ success: true, engineers_notified: rows.length, date: today }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
