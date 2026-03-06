import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load compliance reminder settings from app_settings
    const { data: settingsRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "compliance_reminder_settings")
      .maybeSingle();

    const settings = (settingsRow?.value as any) || {};
    const enabledThresholds: number[] = [];
    if (settings.notify_30 !== false) enabledThresholds.push(30);
    if (settings.notify_60 === true) enabledThresholds.push(60);
    if (settings.notify_90 === true) enabledThresholds.push(90);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Get all admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (admins || []).map((a: any) => a.user_id);

    let updated = 0;
    let notified = 0;

    // --- EXPIRED records: update status ---
    const { data: expired } = await supabase
      .from("compliance_records")
      .select("id, title, record_type, expiry_date, status")
      .lt("expiry_date", todayStr)
      .not("status", "eq", "expired")
      .not("status", "eq", "not_applicable");

    for (const record of expired || []) {
      await supabase
        .from("compliance_records")
        .update({ status: "expired" })
        .eq("id", record.id);
      updated++;

      // Notify admins — check dedup key
      const dedupKey = `compliance_expired_${record.id}_${todayStr}`;
      const { data: existing } = await supabase
        .from("app_settings")
        .select("key")
        .eq("key", dedupKey)
        .maybeSingle();

      if (!existing) {
        for (const adminId of adminIds) {
          await supabase.from("notifications").insert({
            user_id: adminId,
            title: "⚠️ Compliance Expired",
            message: `${record.title} (${record.record_type.replace(/_/g, " ")}) expired on ${record.expiry_date}`,
            job_id: null,
          });
          notified++;
        }
        // Mark as notified today
        await supabase.from("app_settings").upsert({ key: dedupKey, value: { notified_at: todayStr } });
      }
    }

    // --- UPCOMING reminders at configured thresholds ---
    const maxDays = Math.max(...enabledThresholds, 0);
    if (maxDays > 0) {
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + maxDays);

      const { data: upcoming } = await supabase
        .from("compliance_records")
        .select("id, title, record_type, expiry_date, status")
        .gte("expiry_date", todayStr)
        .lte("expiry_date", maxDate.toISOString().split("T")[0])
        .not("status", "eq", "not_applicable");

      for (const record of upcoming || []) {
        const expiryDate = new Date(record.expiry_date);
        const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Find which thresholds this record crosses today
        for (const threshold of enabledThresholds) {
          if (daysLeft <= threshold) {
            // Update status
            if (record.status !== "expiring_soon" && record.status !== "expired") {
              await supabase
                .from("compliance_records")
                .update({ status: "expiring_soon" })
                .eq("id", record.id);
              updated++;
            }

            // Dedup: only notify once per record per threshold crossing
            const dedupKey = `compliance_reminder_${record.id}_${threshold}days`;
            const { data: existingDedup } = await supabase
              .from("app_settings")
              .select("key, value")
              .eq("key", dedupKey)
              .maybeSingle();

            const alreadyNotified = existingDedup?.value as any;
            // Re-notify if the last notification was more than 7 days ago (avoids spam but re-alerts)
            const lastNotifiedDate = alreadyNotified?.notified_at
              ? new Date(alreadyNotified.notified_at)
              : null;
            const daysSinceLast = lastNotifiedDate
              ? Math.floor((today.getTime() - lastNotifiedDate.getTime()) / (1000 * 60 * 60 * 24))
              : 999;

            if (!existingDedup || daysSinceLast >= 7) {
              for (const adminId of adminIds) {
                await supabase.from("notifications").insert({
                  user_id: adminId,
                  title: `🔔 Compliance Due in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""}`,
                  message: `${record.title} (${record.record_type.replace(/_/g, " ")}) expires on ${record.expiry_date}`,
                  job_id: null,
                });
                notified++;
              }
              await supabase.from("app_settings").upsert({
                key: dedupKey,
                value: { notified_at: todayStr, threshold, days_left: daysLeft },
              });
            }
            break; // Only fire on the highest applicable threshold, not all of them
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Compliance check error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
