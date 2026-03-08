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
    // Use service role to bypass RLS for automated job creation
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Optional: validate caller is an admin (when called manually from UI)
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (user) {
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
      }
    }

    const today = new Date().toISOString().split("T")[0];

    // Get all active PPM schedules that are due
    const { data: dueSchedules, error: fetchErr } = await supabase
      .from("ppm_schedules")
      .select("*, assets(name, asset_tag, site_id, org_id)")
      .eq("status", "active")
      .lte("next_due_date", today);

    if (fetchErr) throw fetchErr;

    let generated = 0;
    const errors: string[] = [];

    for (const schedule of dueSchedules || []) {
      // Generate a reference number using the PPM sequence
      const { data: seqData, error: seqErr } = await supabase.rpc("nextval_ppm_seq");
      if (seqErr) {
        errors.push(`Sequence error for schedule ${schedule.id}: ${seqErr.message}`);
        continue;
      }
      const seqNum = seqData || Date.now();
      const refNumber = `PPM-${String(seqNum).padStart(5, "0")}`;

      // Create the job — use service role so created_by is not required for RLS
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

      // Create a scheduled visit for the generated job
      const { error: visitErr } = await supabase.from("job_visits").insert({
        job_id: job.id,
        scheduled_date: schedule.next_due_date,
        status: "upcoming",
      });

      if (visitErr) {
        console.warn(`Visit creation failed for job ${job.id}:`, visitErr.message);
        // Non-fatal — job was created, visit can be added manually
      }

      // Calculate next due date
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

      // Advance the schedule's next due date
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().split("T")[0];

    // Get all active PPM schedules that are due
    const { data: dueSchedules, error: fetchErr } = await supabase
      .from("ppm_schedules")
      .select("*, assets(name, asset_tag, site_id)")
      .eq("status", "active")
      .lte("next_due_date", today);

    if (fetchErr) throw fetchErr;

    let generated = 0;

    for (const schedule of dueSchedules || []) {
      // Generate a reference number
      const { data: seqData } = await supabase.rpc("nextval_ppm_seq");
      const seqNum = seqData || Date.now();
      const refNumber = `PPM-${String(seqNum).padStart(5, "0")}`;

      // Create the job
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
        })
        .select("id")
        .single();

      if (jobErr) {
        console.error(`Failed to create job for PPM ${schedule.id}:`, jobErr.message);
        continue;
      }

      // Create a visit for the job
      await supabase.from("job_visits").insert({
        job_id: job.id,
        scheduled_date: schedule.next_due_date,
        status: "upcoming",
      });

      // Calculate next due date
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
      }

      // Update the schedule
      await supabase
        .from("ppm_schedules")
        .update({
          next_due_date: nextDue.toISOString().split("T")[0],
          last_generated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      generated++;
    }

    return new Response(
      JSON.stringify({ success: true, generated, checked: dueSchedules?.length || 0 }),
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
