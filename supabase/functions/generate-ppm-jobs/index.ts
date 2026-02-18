import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
