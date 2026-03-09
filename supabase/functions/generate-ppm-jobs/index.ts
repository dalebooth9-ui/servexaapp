import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Mandatory auth — reject all unauthenticated requests
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token and require admin role
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role bypasses RLS — required for automated job creation
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];

    // Get all active PPM schedules that are due today or overdue
    const { data: dueSchedules, error: fetchErr } = await supabase
      .from("ppm_schedules")
      .select("*, assets(name, asset_tag, site_id, org_id)")
      .eq("status", "active")
      .lte("next_due_date", today);

    if (fetchErr) throw fetchErr;

    let generated = 0;
    const errors: string[] = [];

    for (const schedule of dueSchedules || []) {
      // Generate a PPM reference number using the database sequence
      const { data: seqData, error: seqErr } = await supabase.rpc("nextval_ppm_seq");
      if (seqErr) {
        errors.push(`Sequence error for schedule ${schedule.id}: ${seqErr.message}`);
        continue;
      }
      const seqNum = seqData || Date.now();
      const refNumber = `PPM-${String(seqNum).padStart(5, "0")}`;

      // Create the maintenance job
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .insert({
          name: schedule.title,
          reference_number: refNumber,
          status: "active",
          priority: schedule.priority,
          category: schedule.category,
          job_type: "one_off",
          asset_id: schedule.asset_id,
          site_id: schedule.assets?.site_id || null,
          org_id: schedule.assets?.org_id || null,
        })
        .select("id")
        .single();

      if (jobErr) {
        console.error(`Failed to create job for PPM ${schedule.id}:`, jobErr.message);
        errors.push(`Job creation failed for "${schedule.title}": ${jobErr.message}`);
        continue;
      }

      // Create a scheduled visit on the due date
      const { error: visitErr } = await supabase.from("job_visits").insert({
        job_id: job.id,
        scheduled_date: schedule.next_due_date,
        status: "upcoming",
      });

      if (visitErr) {
        // Non-fatal — job was created successfully
        console.warn(`Visit creation failed for job ${job.id}:`, visitErr.message);
      }

      // Advance the schedule's next_due_date by one interval
      const nextDue = new Date(schedule.next_due_date);
      switch (schedule.frequency_unit) {
        case "days":
          nextDue.setDate(nextDue.getDate() + schedule.frequency_interval);
          break;
        case "weeks":
          nextDue.setDate(nextDue.getDate() + schedule.frequency_interval * 7);
          break;
        case "months":
          nextDue.setMonth(nextDue.getMonth() + schedule.frequency_interval);
          break;
        default:
          nextDue.setMonth(nextDue.getMonth() + 1);
      }

      const { error: updateErr } = await supabase
        .from("ppm_schedules")
        .update({
          next_due_date: nextDue.toISOString().split("T")[0],
          last_generated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      if (updateErr) {
        console.warn(`Schedule update failed for ${schedule.id}:`, updateErr.message);
      }

      generated++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated,
        checked: dueSchedules?.length || 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("PPM generation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
