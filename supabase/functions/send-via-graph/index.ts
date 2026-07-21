// send-via-graph — outbound report email through Microsoft Graph, using the
// workspace-linked Microsoft Outlook connection. The mailbox to send FROM is
// read per-org from `organisations.ms_send_mailbox`, so subscriber companies
// can each point at their own service@... address.
//
// Two modes:
//   • send  → POST /users/{mailbox}/sendMail (saveToSentItems: true)
//             → mail lands in Sent Items of the real mailbox.
//   • draft → POST /users/{mailbox}/messages (creates draft), returns webLink
//             → client opens it in Outlook on the web for review + Send.
//
// Errors are surfaced verbatim from Graph so tenant admin-consent problems
// (AADSTS...) are visible instead of swallowed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_GATEWAY = "https://connector-gateway.lovable.dev/microsoft_outlook";

type AttachmentIn = {
  filename: string;
  content: string; // base64
  contentType?: string;
};

type ReqBody = {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  attachments?: AttachmentIn[];
  orgId?: string;
  logContext?: {
    kind: "job" | "archive";
    jobId?: string;
    archivedId?: string;
    emailType?: string;
  };
  overrideMode?: "send" | "draft";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const msConnKey = Deno.env.get("MICROSOFT_OUTLOOK_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json(401, { error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "Admin access required" });

    if (!lovableKey || !msConnKey) {
      return json(412, {
        error: "microsoft_not_connected",
        message:
          "Microsoft 365 isn't connected yet. Ask a workspace admin to link the Microsoft Outlook connector.",
      });
    }

    const body: ReqBody = await req.json();
    if (!body.toEmail || !body.subject) {
      return json(400, { error: "toEmail and subject are required" });
    }

    // Pick org: caller-supplied, else the caller's own membership.
    let orgId = body.orgId || null;
    if (!orgId) {
      const { data: mem } = await admin
        .from("organisation_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      orgId = (mem as any)?.org_id || null;
    }
    if (!orgId) return json(400, { error: "No organisation for caller" });

    const { data: org } = await admin
      .from("organisations")
      .select("id, ms_send_mailbox, ms_send_mode")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return json(404, { error: "Organisation not found" });

    const mailbox = (org as any).ms_send_mailbox as string | null;
    const mode = (body.overrideMode ||
      (org as any).ms_send_mode ||
      "send") as "send" | "draft" | "off";

    if (!mailbox || mode === "off") {
      return json(412, {
        error: "mailbox_not_configured",
        message:
          "Microsoft send isn't configured for this organisation. Set it in Settings → Email.",
      });
    }

    const attachments = (body.attachments || []).map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType || "application/pdf",
      contentBytes: a.content,
    }));

    // Rough total size guard for the simple sendMail path (~3MB payload cap).
    const totalBytes = attachments.reduce(
      (n, a) => n + Math.floor((a.contentBytes.length * 3) / 4),
      0,
    );
    if (mode === "send" && totalBytes > 3 * 1024 * 1024) {
      return json(413, {
        error: "attachment_too_large",
        message:
          "Attachments exceed Microsoft's 3 MB direct-send limit. Switch to 'Create draft in Outlook' and send from there.",
      });
    }

    const message = {
      subject: body.subject,
      body: { contentType: "HTML", content: body.htmlBody || "" },
      toRecipients: [
        {
          emailAddress: {
            address: body.toEmail,
            ...(body.toName ? { name: body.toName } : {}),
          },
        },
      ],
      attachments,
    };

    const mailboxPath = encodeURIComponent(mailbox);
    const graphHeaders: Record<string, string> = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": msConnKey,
      "Content-Type": "application/json",
    };

    let webLink: string | null = null;

    if (mode === "send") {
      const r = await fetch(`${GRAPH_GATEWAY}/users/${mailboxPath}/sendMail`, {
        method: "POST",
        headers: graphHeaders,
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
      if (!r.ok) {
        const detail = await safeText(r);
        console.error("Graph sendMail failed", r.status, detail);
        return json(r.status, {
          error: "graph_send_failed",
          status: r.status,
          detail,
        });
      }
    } else {
      // draft mode
      const r = await fetch(`${GRAPH_GATEWAY}/users/${mailboxPath}/messages`, {
        method: "POST",
        headers: graphHeaders,
        body: JSON.stringify(message),
      });
      if (!r.ok) {
        const detail = await safeText(r);
        console.error("Graph createDraft failed", r.status, detail);
        return json(r.status, {
          error: "graph_draft_failed",
          status: r.status,
          detail,
        });
      }
      const draft = await r.json();
      webLink = draft?.webLink || null;
    }

    // Best-effort logging (same fields both modes)
    try {
      const channel = mode === "send" ? "graph_send" : "graph_draft";
      if (body.logContext?.jobId) {
        await admin.from("customer_notification_log").insert({
          customer_email: body.toEmail,
          job_id: body.logContext.jobId,
          notification_type:
            (body.logContext.emailType || "custom") + `:${channel}`,
          subject: body.subject,
        });
      }
      if (body.logContext?.archivedId) {
        const { data: current } = await admin
          .from("archived_documents")
          .select("header_data")
          .eq("id", body.logContext.archivedId)
          .maybeSingle();
        const header = ((current as any)?.header_data || {}) as any;
        const sends = Array.isArray(header._email_sends) ? header._email_sends : [];
        sends.push({
          sent_at: new Date().toISOString(),
          sent_by: user.id,
          sent_by_email: user.email,
          recipient: body.toEmail,
          subject: body.subject,
          channel,
          mailbox,
        });
        await admin
          .from("archived_documents")
          .update({ header_data: { ...header, _email_sends: sends } })
          .eq("id", body.logContext.archivedId);
      }
    } catch (e) {
      console.error("send-via-graph log write failed", e);
    }

    return json(200, {
      success: true,
      mode,
      mailbox,
      webLink,
    });
  } catch (err: any) {
    console.error("send-via-graph error:", err);
    return json(500, { error: err?.message || "Unknown error" });
  }
});

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
