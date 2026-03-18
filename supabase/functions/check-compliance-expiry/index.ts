import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Branded email wrapper
function buildEmailHtml(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff;">
      <div style="background: #1e40af; color: #ffffff; padding: 18px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Servexa</h2>
        <p style="margin: 3px 0 0; font-size: 12px; opacity: 0.75;">Compliance & Fire Safety Management</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <h3 style="margin: 0 0 16px; font-size: 16px; color: #111827;">${title}</h3>
        ${bodyHtml}
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
        <p style="font-size: 11px; color: #9ca3af; margin: 0;">
          This is an automated notification from Servexa. Log in to manage your compliance records.
        </p>
      </div>
    </div>
  `;
}

async function sendEmail(
  resendKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Servexa <noreply@vivafire.co.uk>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Resend error sending to ${to}:`, err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth guard — admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: claimsData.claims.sub, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allow manual "force" runs to bypass daily dedup
    let forceRun = false;
    try {
      const body = await req.json();
      forceRun = body?.force === true;
    } catch (_) { /* no body is fine */ }

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
    const emailEnabled: boolean = settings.email_notifications !== false; // default on

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Get all admins + their emails via auth schema
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (admins || []).map((a: any) => a.user_id);

    // Fetch admin emails from auth.users via service role
    const adminEmails: { id: string; email: string; name: string }[] = [];
    for (const adminId of adminIds) {
      const { data: userData } = await supabase.auth.admin.getUserById(adminId);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", adminId)
        .maybeSingle();
      if (userData?.user?.email) {
        adminEmails.push({
          id: adminId,
          email: userData.user.email,
          name: profileData?.full_name || "Admin",
        });
      }
    }

    let updated = 0;
    let notified = 0;
    let emailed = 0;

    // --- EXPIRED records: update status ---
    const { data: expired } = await supabase
      .from("compliance_records")
      .select("id, title, record_type, expiry_date, status")
      .lt("expiry_date", todayStr)
      .not("status", "eq", "expired")
      .not("status", "eq", "not_applicable");

    // Batch expired records into a single email per admin
    const expiredRecords = expired || [];

    for (const record of expiredRecords) {
      await supabase
        .from("compliance_records")
        .update({ status: "expired" })
        .eq("id", record.id);
      updated++;

      // In-app notifications — deduplicated per record per day
      const dedupKey = `compliance_expired_${record.id}_${todayStr}`;
      const { data: existing } = await supabase
        .from("app_settings")
        .select("key")
        .eq("key", dedupKey)
        .maybeSingle();

      if (!existing || forceRun) {
        for (const adminId of adminIds) {
          await supabase.from("notifications").insert({
            user_id: adminId,
            title: "⚠️ Compliance Expired",
            message: `${record.title} (${record.record_type.replace(/_/g, " ")}) expired on ${record.expiry_date}`,
            job_id: null,
          });
          notified++;
        }
        if (!forceRun) {
          await supabase.from("app_settings").upsert({ key: dedupKey, value: { notified_at: todayStr } });
        }
      }
    }

    // Send one batched email per admin for all expired records today
    if (emailEnabled && RESEND_API_KEY && expiredRecords.length > 0) {
      const emailDedupKey = `compliance_email_expired_batch_${todayStr}`;
      const { data: emailAlreadySent } = await supabase
        .from("app_settings")
        .select("key")
        .eq("key", emailDedupKey)
        .maybeSingle();

      if (!emailAlreadySent) {
        const rows = expiredRecords.map((r) =>
          `<tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-weight: 500; color: #111827;">${r.title}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #6b7280; text-transform: capitalize;">${r.record_type.replace(/_/g, " ")}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #dc2626; font-weight: 600;">${r.expiry_date}</td>
          </tr>`
        ).join("");

        const bodyHtml = `
          <p style="margin: 0 0 16px; color: #374151;">The following compliance record${expiredRecords.length > 1 ? "s have" : " has"} <strong style="color: #dc2626;">expired</strong> and require immediate attention:</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Certificate</th>
                <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Type</th>
                <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Expired On</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin: 0; font-size: 13px; color: #6b7280;">Please log in to Servexa to renew or update these records.</p>
        `;

        for (const admin of adminEmails) {
          await sendEmail(
            RESEND_API_KEY,
            admin.email,
            `⚠️ ${expiredRecords.length} Compliance Record${expiredRecords.length > 1 ? "s" : ""} Expired`,
            buildEmailHtml("Compliance Records Expired", bodyHtml),
          );
          emailed++;
        }
        await supabase.from("app_settings").upsert({ key: emailDedupKey, value: { sent_at: todayStr, count: expiredRecords.length } });
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

      // Group records by threshold for batched emails
      const byThreshold: Record<number, typeof upcoming> = {};

      for (const record of upcoming || []) {
        const expiryDate = new Date(record.expiry_date);
        const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

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

            // In-app notification dedup
            const dedupKey = `compliance_reminder_${record.id}_${threshold}days`;
            const { data: existingDedup } = await supabase
              .from("app_settings")
              .select("key, value")
              .eq("key", dedupKey)
              .maybeSingle();

            const alreadyNotified = existingDedup?.value as any;
            const lastNotifiedDate = alreadyNotified?.notified_at
              ? new Date(alreadyNotified.notified_at)
              : null;
            const daysSinceLast = lastNotifiedDate
              ? Math.floor((today.getTime() - lastNotifiedDate.getTime()) / (1000 * 60 * 60 * 24))
              : 999;

            if (!existingDedup || daysSinceLast >= 7 || forceRun) {
              for (const adminId of adminIds) {
                await supabase.from("notifications").insert({
                  user_id: adminId,
                  title: `🔔 Compliance Due in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""}`,
                  message: `${record.title} (${record.record_type.replace(/_/g, " ")}) expires on ${record.expiry_date}`,
                  job_id: null,
                });
                notified++;
              }
              if (!forceRun) await supabase.from("app_settings").upsert({
                key: dedupKey,
                value: { notified_at: todayStr, threshold, days_left: daysLeft },
              });

              // Track for batched email
              if (emailEnabled && RESEND_API_KEY) {
                if (!byThreshold[threshold]) byThreshold[threshold] = [];
                (byThreshold[threshold] as any[]).push({ ...record, days_left: daysLeft });
              }
            }
            break;
          }
        }
      }

      // Send one batched email per threshold per day
      for (const [threshold, records] of Object.entries(byThreshold)) {
        if (!records || records.length === 0) continue;
        const emailDedupKey = `compliance_email_reminder_${threshold}days_${todayStr}`;
        const { data: emailAlreadySent } = await supabase
          .from("app_settings")
          .select("key")
          .eq("key", emailDedupKey)
          .maybeSingle();

        if (!emailAlreadySent) {
          const sortedRecords = [...records].sort((a, b) => (a.days_left as number) - (b.days_left as number));
          const rows = sortedRecords.map((r: any) => {
            const urgencyColor = r.days_left <= 7 ? "#dc2626" : r.days_left <= 30 ? "#d97706" : "#059669";
            return `<tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-weight: 500; color: #111827;">${r.title}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #6b7280; text-transform: capitalize;">${r.record_type.replace(/_/g, " ")}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #374151;">${r.expiry_date}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-weight: 700; color: ${urgencyColor};">${r.days_left} day${r.days_left !== 1 ? "s" : ""}</td>
            </tr>`;
          }).join("");

          const bodyHtml = `
            <p style="margin: 0 0 16px; color: #374151;">The following compliance record${sortedRecords.length > 1 ? "s are" : " is"} expiring within <strong>${threshold} days</strong>:</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Certificate</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Type</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Expiry Date</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Days Left</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="margin: 0; font-size: 13px; color: #6b7280;">Log in to Servexa to review and renew these certificates before they expire.</p>
          `;

          const subject = `🔔 ${sortedRecords.length} Compliance Record${sortedRecords.length > 1 ? "s" : ""} Expiring Within ${threshold} Days`;
          for (const admin of adminEmails) {
            await sendEmail(
              RESEND_API_KEY!,
              admin.email,
              subject,
              buildEmailHtml(`Compliance Expiry Reminder — ${threshold} Days`, bodyHtml),
            );
            emailed++;
          }
          await supabase.from("app_settings").upsert({
            key: emailDedupKey,
            value: { sent_at: todayStr, threshold: Number(threshold), count: sortedRecords.length },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated, notified, emailed }),
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
