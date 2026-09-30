// report-review — engineer "Submit to office" / "Message office" and office
// review actions ("Send to customer", "Edit", "Return to engineer").
// All actions verify the caller's token and org; engineers must be assigned.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { getEmailBranding, getSendIdentity, wrapCustomerEmail, sendViaResend } from "../_shared/customerEmail.ts";

const APP_URL = "https://servexaapp.lovable.app";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), jobId: z.string().uuid(), pdfPath: z.string().min(1).max(500), clientRequestId: z.string().min(4).max(120) }),
  z.object({ action: z.literal("message"), jobId: z.string().uuid(), text: z.string().trim().min(1).max(5000), photoPaths: z.array(z.string().max(500)).max(6).default([]) }),
  z.object({
    action: z.literal("send_customer"),
    jobId: z.string().uuid(),
    pdfPath: z.string().min(1).max(500),
    toEmail: z.string().email().optional(),
    toPhone: z.string().max(32).optional(),
    channel: z.enum(["email", "whatsapp", "both"]).default("email"),
  }),
  z.object({ action: z.literal("edit"), jobId: z.string().uuid() }),
  z.object({ action: z.literal("return"), jobId: z.string().uuid(), reason: z.string().trim().min(1).max(2000) }),
]);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const input = parsed.data;

    const { data: job } = await admin.from("jobs")
      .select("id, org_id, name, reference_number, customer_po, customer, address, site_id, customer_id, status, sites(name, contact_email, contact_name), customers(name, email)")
      .eq("id", input.jobId).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);

    const { data: mem } = await admin.from("organisation_members").select("org_id").eq("user_id", user.id).eq("org_id", job.org_id).maybeSingle();
    if (!mem) return json({ error: "Forbidden" }, 403);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: assigned } = await admin.from("job_assignments").select("id").eq("job_id", job.id).eq("engineer_id", user.id).limit(1);
    const isAssigned = (assigned || []).length > 0;

    const officeOnly = input.action === "send_customer" || input.action === "edit" || input.action === "return";
    if (officeOnly && !isAdmin) return json({ error: "Office access required" }, 403);
    if (!officeOnly && !isAdmin && !isAssigned) return json({ error: "Not assigned to this job" }, 403);

    const { data: prof } = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    const actorName = (prof as any)?.full_name || user.email || "Engineer";
    const { data: org } = await admin.from("organisations")
      .select("office_email, office_whatsapp_number, whatsapp_alerts_enabled, whatsapp_template_sid")
      .eq("id", job.org_id).maybeSingle();
    const officeEmail = ((org as any)?.office_email || "").trim() || null;
    const officeWhatsApp = ((org as any)?.office_whatsapp_number || "").trim() || null;
    const whatsappOn = (org as any)?.whatsapp_alerts_enabled === true;
    const templateSid = ((org as any)?.whatsapp_template_sid || "").trim() || Deno.env.get("TWILIO_OFFICE_CONTENT_SID") || null;
    const site = (job as any).sites; const cust = (job as any).customers;
    const siteName = site?.name || job.address || "Site";
    const ref = job.customer_po ? `PO ${job.customer_po}` : (job.reference_number || "Job");
    const jobLink = `${APP_URL}/jobs/${job.id}`;
    const branding = await getEmailBranding(job.org_id, admin);
    const identity = getSendIdentity(branding);

    const log = async (action: string, details: string, extra: Record<string, unknown> = {}) => {
      await admin.from("job_activity_log").insert({ job_id: job.id, org_id: job.org_id, user_id: user.id, action, details });
      await admin.from("report_review_events").insert({ job_id: job.id, org_id: job.org_id, actor_id: user.id, action, details, ...extra });
    };
    const recordEmail = async (to: string[], subject: string, text: string, html: string, attachments: number) => {
      await admin.from("job_emails").insert({
        job_id: job.id, org_id: job.org_id, direction: "outbound", from_email: identity.from, to_emails: to,
        subject, snippet: text.slice(0, 200), body_text: text, body_html: html, attachment_count: attachments, received_at: new Date().toISOString(),
      });
    };
    const download = async (path: string) => {
      const clean = path.replace(/^submissions\//, "");
      const { data, error } = await admin.storage.from("submissions").download(clean);
      if (error || !data) throw new Error(`Could not load file: ${clean}`);
      return new Uint8Array(await data.arrayBuffer());
    };
    const pathInOrg = (p: string) => p.replace(/^submissions\//, "").startsWith(`${job.org_id}/`);

    if (input.action === "submit") {
      const { data: dup } = await admin.from("report_review_events").select("id").eq("client_request_id", input.clientRequestId).maybeSingle();
      if (dup) return json({ ok: true, duplicate: true, emailed: true });
      if (!pathInOrg(input.pdfPath)) return json({ error: "Invalid file path" }, 400);

      const now = new Date().toISOString();
      await admin.from("job_sheet_responses").update({ locked_at: now, locked_by: user.id, returned_reason: null, returned_at: null })
        .eq("job_id", job.id).eq("status", "submitted");
      await admin.from("jobs").update({ status: "submitted_for_review" }).eq("id", job.id);
      await admin.from("report_review_events").insert({ job_id: job.id, org_id: job.org_id, actor_id: user.id, action: "report_submitted", details: `Report submitted by ${actorName}`, pdf_path: input.pdfPath, client_request_id: input.clientRequestId });
      await admin.from("job_activity_log").insert({ job_id: job.id, org_id: job.org_id, user_id: user.id, action: "report_submitted", details: `Report submitted to office by ${actorName}` });

      let emailed = false;
      if (officeEmail) {
        const subject = `${ref} – ${siteName} – Report submitted by ${actorName}`;
        const text = `${actorName} has submitted the report for ${job.name || ref} at ${siteName}. Review it here: ${jobLink}`;
        const html = wrapCustomerEmail(branding, { previewText: subject, bodyHtml: `<p>${esc(actorName)} has submitted the report for <strong>${esc(job.name || ref)}</strong> at ${esc(siteName)}.</p><p>The PDF is attached.</p><p><a href="${jobLink}">Open the job</a></p>` });
        const pdf = await download(input.pdfPath);
        const r = await sendViaResend({ from: identity.from, reply_to: identity.reply_to, to: [officeEmail], subject, html, attachments: [{ filename: `${ref.replace(/[^\w-]+/g, "_")}-report.pdf`, content: toB64(pdf) }] });
        emailed = r.ok;
        if (r.ok) await recordEmail([officeEmail], subject, text, html, 1);
      }
      return json({ ok: true, emailed, officeEmailConfigured: !!officeEmail });
    }

    if (input.action === "message") {
      const subject = `${ref} – ${siteName} – Message from ${actorName}`;
      const html = wrapCustomerEmail(branding, { previewText: input.text.slice(0, 100), bodyHtml: `<p><strong>${esc(actorName)}</strong> sent a message about ${esc(job.name || ref)} at ${esc(siteName)}:</p><blockquote style="border-left:3px solid #ccc;padding-left:10px;white-space:pre-wrap">${esc(input.text)}</blockquote><p><a href="${jobLink}">Open the job</a></p>` });
      const attachments: Array<{ filename: string; content: string }> = [];
      for (const [i, p] of input.photoPaths.entries()) {
        if (!pathInOrg(p)) continue;
        try { attachments.push({ filename: `photo-${i + 1}.jpg`, content: toB64(await download(p)) }); } catch (_) { /* skip */ }
      }
      let emailed = false;
      if (officeEmail) {
        const r = await sendViaResend({ from: identity.from, reply_to: identity.reply_to, to: [officeEmail], subject, html, attachments: attachments.length ? attachments : undefined });
        emailed = r.ok;
      }
      await recordEmail(officeEmail ? [officeEmail] : [], subject, input.text, html, attachments.length);
      await log("office_message", `Message to office from ${actorName}: ${input.text.slice(0, 300)}`);
      return json({ ok: true, emailed, officeEmailConfigured: !!officeEmail });
    }

    if (input.action === "send_customer") {
      const to = input.toEmail || site?.contact_email || cust?.email;
      if (!to) return json({ error: "No customer or site contact email on this job" }, 400);
      if (!pathInOrg(input.pdfPath)) return json({ error: "Invalid file path" }, 400);
      const subject = `${ref} – ${siteName} – Service report`;
      const greeting = site?.contact_name || cust?.name || "";
      const html = wrapCustomerEmail(branding, { previewText: subject, senderName: actorName, bodyHtml: `<p>${greeting ? `Dear ${esc(greeting)},` : "Hello,"}</p><p>Please find attached the service report for ${esc(siteName)} (${esc(ref)}).</p>` });
      const pdf = await download(input.pdfPath);
      const r = await sendViaResend({ from: identity.from, reply_to: identity.reply_to, to: [to], subject, html, attachments: [{ filename: `${ref.replace(/[^\w-]+/g, "_")}-report.pdf`, content: toB64(pdf) }] });
      if (!r.ok) return json({ error: "Email failed to send", detail: r.body }, 502);
      await recordEmail([to], subject, `Service report sent to ${to}`, html, 1);
      await admin.from("jobs").update({ status: "completed" }).eq("id", job.id);
      await log("report_sent_to_customer", `Report sent to customer (${to}) by ${actorName}`, { pdf_path: input.pdfPath });
      return json({ ok: true, to });
    }

    if (input.action === "edit") {
      await admin.from("job_sheet_responses").update({ locked_at: null, locked_by: null }).eq("job_id", job.id).eq("status", "submitted");
      await log("report_unlocked_office", `Report unlocked for office edits by ${actorName}`);
      return json({ ok: true });
    }

    // return to engineer
    await admin.from("job_sheet_responses").update({ locked_at: null, locked_by: null, returned_reason: input.reason, returned_at: new Date().toISOString() })
      .eq("job_id", job.id).eq("status", "submitted");
    await admin.from("jobs").update({ status: "in_progress" }).eq("id", job.id);
    await log("report_returned", `Report returned to engineer by ${actorName}: ${input.reason}`);
    const { data: engs } = await admin.from("job_assignments").select("engineer_id").eq("job_id", job.id);
    for (const e of engs || []) {
      await admin.from("notifications").insert({ user_id: e.engineer_id, org_id: job.org_id, job_id: job.id, title: "Report returned", message: `${ref} – ${siteName}: ${input.reason}` });
      const { data: u } = await admin.auth.admin.getUserById(e.engineer_id);
      const email = u?.user?.email;
      if (email) {
        const subject = `${ref} – ${siteName} – Report returned`;
        const html = wrapCustomerEmail(branding, { previewText: subject, bodyHtml: `<p>The office has returned your report for ${esc(siteName)} (${esc(ref)}).</p><p><strong>Reason:</strong> ${esc(input.reason)}</p><p><a href="${jobLink}">Open the job</a> to make changes and submit again.</p>` });
        await sendViaResend({ from: identity.from, reply_to: identity.reply_to, to: [email], subject, html });
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error("[report-review]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
