// Notifies Servexa support (and users) about support ticket events.
// event = 'created' | 'reply' | 'status_change'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaResend } from "../_shared/customerEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_INBOX = "support@servexaapp.com";
const FROM = "Servexa Support <notify@servexaapp.com>";
const APP_URL = "https://servexaapp.com";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { ticketId, event, replyBody } = await req.json();
    if (!ticketId || !event) {
      return new Response(JSON.stringify({ error: "ticketId and event required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: ticket, error } = await admin
      .from("support_tickets")
      .select("id, org_id, user_id, reporter_name, reporter_email, description, subject, ticket_type, status, priority, route, page_url, created_at, organisations:org_id(name)")
      .eq("id", ticketId)
      .maybeSingle();
    if (error || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orgName = (ticket as any).organisations?.name || "Unknown org";
    const subject = ticket.subject || (ticket.description || "").slice(0, 80);
    const ticketUrl = `${APP_URL}/platform/support?ticket=${ticket.id}`;
    const userUrl = `${APP_URL}/support/my-tickets?ticket=${ticket.id}`;

    const rows: Array<Promise<any>> = [];

    if (event === "created") {
      const html = `
        <h2>New ${esc(ticket.ticket_type)} ticket — ${esc(orgName)}</h2>
        <p><strong>Subject:</strong> ${esc(subject)}</p>
        <p><strong>From:</strong> ${esc(ticket.reporter_name || "")} &lt;${esc(ticket.reporter_email || "")}&gt;</p>
        <p><strong>Priority:</strong> ${esc(ticket.priority)}</p>
        <p><strong>Route:</strong> ${esc(ticket.route || "—")}</p>
        <hr>
        <div style="white-space:pre-wrap">${esc(ticket.description)}</div>
        <p><a href="${ticketUrl}">Open in Servexa platform inbox</a></p>`;
      rows.push(sendViaResend({
        from: FROM,
        to: SUPPORT_INBOX,
        subject: `[Support] ${orgName}: ${subject}`,
        html,
        reply_to: ticket.reporter_email || undefined,
      }));
    } else if (event === "reply") {
      // Notify the reporter (if operator replied) and the support inbox (if reporter replied).
      const isOperator = replyBody?.author_kind === "operator";
      if (isOperator && ticket.reporter_email) {
        const html = `
          <h2>Servexa Support replied</h2>
          <p><strong>Re:</strong> ${esc(subject)}</p>
          <div style="white-space:pre-wrap;border-left:3px solid #e2e8f0;padding-left:12px">${esc(replyBody?.body || "")}</div>
          <p><a href="${userUrl}">Open your ticket in Servexa</a></p>`;
        rows.push(sendViaResend({
          from: FROM,
          to: ticket.reporter_email,
          subject: `Re: ${subject}`,
          html,
        }));
      } else if (!isOperator) {
        const html = `
          <h2>New reply — ${esc(orgName)}</h2>
          <p><strong>Re:</strong> ${esc(subject)}</p>
          <p><strong>From:</strong> ${esc(replyBody?.author_name || "")}</p>
          <div style="white-space:pre-wrap">${esc(replyBody?.body || "")}</div>
          <p><a href="${ticketUrl}">Open in platform inbox</a></p>`;
        rows.push(sendViaResend({
          from: FROM,
          to: SUPPORT_INBOX,
          subject: `[Support reply] ${orgName}: ${subject}`,
          html,
          reply_to: ticket.reporter_email || undefined,
        }));
      }
    } else if (event === "status_change") {
      if (ticket.reporter_email) {
        const html = `
          <h2>Your ticket is now ${esc(ticket.status)}</h2>
          <p><strong>Subject:</strong> ${esc(subject)}</p>
          <p><a href="${userUrl}">View ticket</a></p>`;
        rows.push(sendViaResend({
          from: FROM,
          to: ticket.reporter_email,
          subject: `Ticket ${esc(ticket.status)}: ${subject}`,
          html,
        }));
      }
    }

    const results = await Promise.all(rows);
    return new Response(JSON.stringify({ ok: true, sent: results.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("notify-support-ticket error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
