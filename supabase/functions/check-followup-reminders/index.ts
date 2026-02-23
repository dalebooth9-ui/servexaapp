import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find upcoming visits on follow-up jobs due within 1 month
    const now = new Date();
    const oneMonthFromNow = new Date(now);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    const todayStr = now.toISOString().split("T")[0];
    const cutoffStr = oneMonthFromNow.toISOString().split("T")[0];

    // Get upcoming visits in the 1-month window for follow-up jobs
    const { data: visits, error: visitErr } = await supabase
      .from("job_visits")
      .select("id, scheduled_date, job_id, jobs!inner(id, name, reference_number, status)")
      .eq("status", "upcoming")
      .gte("scheduled_date", todayStr)
      .lte("scheduled_date", cutoffStr);

    if (visitErr) throw visitErr;

    // Filter to follow-up jobs only (name starts with "6m Visual" or "12m Pressure Test")
    const followUpVisits = (visits || []).filter((v: any) => {
      const name = v.jobs?.name || "";
      return name.startsWith("6m Visual") || name.startsWith("12m Pressure Test");
    });

    if (followUpVisits.length === 0) {
      return new Response(JSON.stringify({ message: "No follow-up reminders due", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all admin user IDs
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins || []).map((a: any) => a.user_id);
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ message: "No admins found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing notifications to avoid duplicates (same job_id, same day)
    let created = 0;
    for (const visit of followUpVisits) {
      const job = visit.jobs;
      const jobId = job.id;

      // Skip completed/archived jobs
      if (job.status === "completed" || job.status === "archived") continue;

      // Check if we already notified today for this job
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("job_id", jobId)
        .gte("created_at", todayStr + "T00:00:00Z")
        .lte("created_at", todayStr + "T23:59:59Z")
        .limit(1);

      if (existing && existing.length > 0) continue;

      const daysUntil = Math.ceil(
        (new Date(visit.scheduled_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isVisual = job.name.startsWith("6m Visual");
      const typeLabel = isVisual ? "Visual Inspection" : "Pressure Test";

      // Create notification for each admin
      const notifications = adminIds.map((uid: string) => ({
        user_id: uid,
        title: `${typeLabel} Due Soon`,
        message: `${job.reference_number} – ${job.name} is scheduled in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${visit.scheduled_date}). Contact the customer to arrange access.`,
        job_id: jobId,
      }));

      const { error: insertErr } = await supabase.from("notifications").insert(notifications);
      if (!insertErr) created += notifications.length;
    }

    return new Response(JSON.stringify({ message: "Reminders processed", created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
