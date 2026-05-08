import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_RED = "#dc2626";
const BRAND_DARK = "#111827";
const BRAND_GRAY = "#6b7280";
const BRAND_LIGHT = "#f9fafb";
const BRAND_BORDER = "#e5e7eb";

function kpiCard(label: string, value: string, delta?: string, deltaGood?: boolean): string {
  const deltaHtml = delta
    ? `<div style="font-size:11px;color:${deltaGood ? "#16a34a" : "#dc2626"};margin-top:2px;">${deltaGood ? "▲" : "▼"} ${delta} vs prev week</div>`
    : "";
  return `
    <td style="padding:4px;">
      <div style="background:#ffffff;border:1px solid ${BRAND_BORDER};border-radius:8px;padding:14px 16px;min-width:110px;">
        <div style="font-size:22px;font-weight:700;color:${BRAND_DARK};line-height:1;">${value}</div>
        ${deltaHtml}
        <div style="font-size:11px;color:${BRAND_GRAY};margin-top:4px;">${label}</div>
      </div>
    </td>`;
}

function sectionTitle(title: string): string {
  return `<tr><td style="padding:20px 0 8px;"><div style="font-size:14px;font-weight:700;color:${BRAND_DARK};border-bottom:2px solid ${BRAND_RED};padding-bottom:4px;display:inline-block;">${title}</div></td></tr>`;
}

function tableRow(cells: string[], isHeader = false, isAlt = false): string {
  const bg = isHeader ? BRAND_LIGHT : isAlt ? "#f9fafb" : "#ffffff";
  const fw = isHeader ? "600" : "400";
  const color = isHeader ? BRAND_GRAY : BRAND_DARK;
  return `<tr style="background:${bg};">${cells
    .map(
      (c, i) =>
        `<td style="padding:8px 10px;font-size:12px;font-weight:${fw};color:${color};text-align:${i === 0 ? "left" : "right"};border-bottom:1px solid ${BRAND_BORDER};">${c}</td>`,
    )
    .join("")}</tr>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth check — require valid admin JWT always (no header bypass) ──
    const authHeader = req.headers.get("Authorization");
    let callerIsAdmin = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (!claimsError && claimsData?.claims) {
        const userId = claimsData.claims.sub;
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .single();
        callerIsAdmin = !!roleData;
      }
    }
    if (!callerIsAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Date ranges ──
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const isTest = body?.test === true;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1) - 7); // last Monday
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const prevStart = new Date(weekStart);
    prevStart.setDate(weekStart.getDate() - 7);
    const prevEnd = new Date(weekStart);
    prevEnd.setMilliseconds(-1);

    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;

    // ── Fetch data ──
    const [
      jobsRes, prevJobsRes,
      completedRes, prevCompletedRes,
      invoicesRes, prevInvoicesRes,
      assignmentsRes, submissionsRes,
      clockRes, profilesRes,
    ] = await Promise.all([
      supabase.from("jobs").select("id,status,category,customer").gte("created_at", weekStart.toISOString()).lte("created_at", weekEnd.toISOString()),
      supabase.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", prevStart.toISOString()).lte("created_at", prevEnd.toISOString()),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", weekStart.toISOString()).lte("updated_at", weekEnd.toISOString()),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", prevStart.toISOString()).lte("updated_at", prevEnd.toISOString()),
      supabase.from("invoices").select("id,total,status,customer_name").gte("created_at", weekStart.toISOString()).lte("created_at", weekEnd.toISOString()),
      supabase.from("invoices").select("total,status").gte("created_at", prevStart.toISOString()).lte("created_at", prevEnd.toISOString()),
      supabase.from("job_assignments").select("engineer_id,job_id").gte("assigned_at", weekStart.toISOString()).lte("assigned_at", weekEnd.toISOString()),
      supabase.from("submissions").select("id,engineer_id").gte("created_at", weekStart.toISOString()).lte("created_at", weekEnd.toISOString()),
      supabase.from("time_clock").select("user_id,total_minutes").gte("clock_in_at", weekStart.toISOString()).lte("clock_in_at", weekEnd.toISOString()),
      supabase.from("profiles").select("user_id,full_name"),
    ]);

    const jobs = jobsRes.data || [];
    const invoices = invoicesRes.data || [];
    const prevInvoices = prevInvoicesRes.data || [];
    const clocks = clockRes.data || [];
    const profiles = profilesRes.data || [];
    const profMap: Record<string, string> = {};
    profiles.forEach((p) => { profMap[p.user_id] = p.full_name; });

    // ── KPIs ──
    const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
    const prevRevenue = prevInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
    const jobCount = jobs.length;
    const prevJobCount = prevJobsRes.count || 0;
    const completedCount = completedRes.count || 0;
    const prevCompletedCount = prevCompletedRes.count || 0;
    const invoicedTotal = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const outstanding = invoices.filter((i) => ["draft", "sent", "overdue"].includes(i.status)).reduce((s, i) => s + Number(i.total || 0), 0);
    const totalHours = Math.round(clocks.reduce((s, c) => s + (c.total_minutes || 0), 0) / 60);
    const activeEngineers = new Set((assignmentsRes.data || []).map((a) => a.engineer_id)).size;
    const submissionCount = (submissionsRes.data || []).length;

    const pctDelta = (cur: number, prev: number) => {
      if (prev === 0) return null;
      const p = Math.round(((cur - prev) / prev) * 100);
      return { val: `${Math.abs(p)}%`, good: p >= 0 };
    };

    const revDelta = pctDelta(revenue, prevRevenue);
    const jobDelta = pctDelta(jobCount, prevJobCount);
    const compDelta = pctDelta(completedCount, prevCompletedCount);

    // ── Engineer Performance ──
    const engMap: Record<string, { name: string; jobs: number; hours: number; subs: number }> = {};
    (assignmentsRes.data || []).forEach((a) => {
      if (!engMap[a.engineer_id]) engMap[a.engineer_id] = { name: profMap[a.engineer_id] || "Unknown", jobs: 0, hours: 0, subs: 0 };
    });
    jobs.filter((j) => j.status === "completed").forEach((j) => {
      const eng = (assignmentsRes.data || []).find((a) => a.job_id === j.id);
      if (eng && engMap[eng.engineer_id]) engMap[eng.engineer_id].jobs++;
    });
    (submissionsRes.data || []).forEach((s) => { if (engMap[s.engineer_id]) engMap[s.engineer_id].subs++; });
    clocks.forEach((c) => { if (engMap[c.user_id]) engMap[c.user_id].hours += (c.total_minutes || 0) / 60; });
    const engineerRows = Object.values(engMap).sort((a, b) => b.jobs - a.jobs);

    // ── Status breakdown ──
    const statusCounts: Record<string, number> = {};
    jobs.forEach((j) => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });

    // ── Top customers ──
    const custJobs: Record<string, number> = {};
    jobs.forEach((j) => { const k = j.customer || "Unknown"; custJobs[k] = (custJobs[k] || 0) + 1; });
    const topCustomers = Object.entries(custJobs).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // ── Get admin emails ──
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles || []).map((r) => r.user_id);
    const adminProfiles = profiles.filter((p) => adminIds.includes(p.user_id));

    // Get emails from auth.users via service role
    const adminEmails: string[] = [];
    for (const ap of adminProfiles) {
      const { data: userdata } = await supabase.auth.admin.getUserById(ap.user_id);
      if (userdata?.user?.email) adminEmails.push(userdata.user.email);
    }

    if (isTest && body?.to_email) {
      adminEmails.length = 0;
      adminEmails.push(body.to_email);
    }

    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ error: "No admin emails found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build HTML email ──
    const completionRate = jobCount > 0 ? Math.round((completedCount / jobCount) * 100) : 0;

    const engineerTableRows = engineerRows.length > 0
      ? [
          tableRow(["Engineer", "Jobs Done", "Hours", "Submissions"], true),
          ...engineerRows.map((e, i) =>
            tableRow([e.name, String(e.jobs), `${Math.round(e.hours * 10) / 10}h`, String(e.subs)], false, i % 2 === 1),
          ),
        ].join("")
      : `<tr><td colspan="4" style="padding:16px;text-align:center;color:${BRAND_GRAY};font-size:12px;">No engineer data for this week.</td></tr>`;

    const customerTableRows = topCustomers.length > 0
      ? [
          tableRow(["Customer", "Jobs"], true),
          ...topCustomers.map(([name, count], i) => tableRow([name, String(count)], false, i % 2 === 1)),
        ].join("")
      : `<tr><td colspan="2" style="padding:16px;text-align:center;color:${BRAND_GRAY};font-size:12px;">No job data this week.</td></tr>`;

    const statusRows = Object.entries(statusCounts).length > 0
      ? [
          tableRow(["Status", "Count"], true),
          ...Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([s, n], i) =>
            tableRow([s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), String(n)], false, i % 2 === 1),
          ),
        ].join("")
      : `<tr><td colspan="2" style="padding:16px;text-align:center;color:${BRAND_GRAY};font-size:12px;">No jobs this week.</td></tr>`;

    const appUrl = Deno.env.get("APP_URL") || "https://servexaapp.lovable.app";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly Management Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:${BRAND_RED};border-radius:10px 10px 0 0;padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Viva Fire &amp; Protection</div>
                  <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:2px;">Weekly Management Report</div>
                </td>
                <td align="right">
                  <div style="background:rgba(255,255,255,0.15);border-radius:6px;padding:6px 12px;display:inline-block;">
                    <div style="color:#ffffff;font-size:11px;font-weight:600;">Week of</div>
                    <div style="color:#ffffff;font-size:11px;">${weekLabel}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#ffffff;padding:24px 28px;border-left:1px solid ${BRAND_BORDER};border-right:1px solid ${BRAND_BORDER};">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Greeting -->
              <tr><td style="padding-bottom:20px;">
                <p style="margin:0;font-size:14px;color:${BRAND_DARK};">Here's your weekly operational snapshot. ${isTest ? "<strong>[TEST EMAIL]</strong>" : ""}</p>
              </td></tr>

              <!-- KPI GRID -->
              ${sectionTitle("Key Performance Indicators")}
              <tr><td style="padding-bottom:8px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    ${kpiCard("Revenue (Paid)", `£${revenue.toLocaleString()}`, revDelta ? revDelta.val : undefined, revDelta?.good)}
                    ${kpiCard("Jobs Created", String(jobCount), jobDelta ? jobDelta.val : undefined, jobDelta?.good)}
                    ${kpiCard("Jobs Completed", String(completedCount), compDelta ? compDelta.val : undefined, compDelta?.good)}
                    ${kpiCard("Completion Rate", `${completionRate}%`)}
                  </tr>
                  <tr>
                    ${kpiCard("Invoiced Total", `£${invoicedTotal.toLocaleString()}`)}
                    ${kpiCard("Outstanding", `£${outstanding.toLocaleString()}`)}
                    ${kpiCard("Active Engineers", String(activeEngineers))}
                    ${kpiCard("Hours Logged", `${totalHours}h`)}
                  </tr>
                </table>
              </td></tr>

              <!-- ENGINEER PERFORMANCE -->
              ${sectionTitle("Engineer Performance")}
              <tr><td style="padding-bottom:4px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND_BORDER};border-radius:8px;overflow:hidden;">
                  ${engineerTableRows}
                </table>
              </td></tr>

              <!-- JOB STATUS BREAKDOWN -->
              <tr><td>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:0;">
                  <tr>
                    <td width="48%" valign="top" style="padding-right:8px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        ${sectionTitle("Job Status Mix")}
                        <tr><td>
                          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND_BORDER};border-radius:8px;overflow:hidden;">
                            ${statusRows}
                          </table>
                        </td></tr>
                      </table>
                    </td>
                    <td width="4%"></td>
                    <td width="48%" valign="top" style="padding-left:8px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        ${sectionTitle("Top Customers")}
                        <tr><td>
                          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND_BORDER};border-radius:8px;overflow:hidden;">
                            ${customerTableRows}
                          </table>
                        </td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td></tr>

              <!-- CTA -->
              <tr><td style="padding-top:24px;text-align:center;">
                <a href="${appUrl}/reports" style="display:inline-block;background:${BRAND_RED};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 28px;border-radius:6px;">View Full Reports Dashboard →</a>
              </td></tr>

            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:${BRAND_LIGHT};border:1px solid ${BRAND_BORDER};border-top:none;border-radius:0 0 10px 10px;padding:16px 28px;text-align:center;">
            <p style="margin:0;font-size:11px;color:${BRAND_GRAY};">Viva Fire &amp; Protection Ltd &nbsp;·&nbsp; Weekly report auto-generated every Monday at 08:00 UTC</p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">You're receiving this because you have admin access to the platform.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // ── Send emails ──
    const { RESEND_API_KEY } = requireEnv(["RESEND_API_KEY"] as const);
    const resend = new Resend(RESEND_API_KEY);
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const email of adminEmails) {
      const { error: emailErr } = await resend.emails.send({
        from: "Servexa <noreply@notify.vivafire.co.uk>",
        to: [email],
        subject: `${isTest ? "[TEST] " : ""}Weekly Report: ${weekLabel} – ${completedCount} jobs completed, £${revenue.toLocaleString()} revenue`,
        html,
      });
      results.push({ email, success: !emailErr, error: emailErr ? JSON.stringify(emailErr) : undefined });
    }

    const sent = results.filter((r) => r.success).length;
    console.log(`Weekly report sent to ${sent}/${adminEmails.length} admins`);

    return new Response(
      JSON.stringify({ success: true, sent, total: adminEmails.length, results, week: weekLabel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    const cfg = missingEnvResponse(err, corsHeaders);
    if (cfg) return cfg;
    console.error("Weekly report error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
