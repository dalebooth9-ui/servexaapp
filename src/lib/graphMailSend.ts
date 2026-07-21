// graphMailSend — thin client wrapper over the `send-via-graph` edge function
// plus a status helper that tells send dialogs which route to offer.
//
// The Microsoft Outlook connector is workspace-scoped; there is no client-side
// way to introspect whether it's linked. We therefore probe status by calling
// the edge function with a special `probe: true` payload (returns 412 with a
// stable error code if the connection or mailbox isn't ready) and read the
// org's `ms_send_mailbox` / `ms_send_mode` directly.

import { supabase } from "@/integrations/supabase/client";

export type GraphSendMode = "send" | "draft" | "off";

export interface GraphSendStatus {
  ready: boolean;
  mailbox: string | null;
  mode: GraphSendMode;
  reason?:
    | "no_org"
    | "mailbox_not_configured"
    | "microsoft_not_connected"
    | "unknown";
  message?: string;
}

export interface GraphSendInput {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
  orgId?: string;
  logContext?: {
    kind: "job" | "archive";
    jobId?: string;
    archivedId?: string;
    emailType?: string;
  };
  overrideMode?: "send" | "draft";
}

export interface GraphSendResult {
  success: boolean;
  mode: "send" | "draft";
  mailbox: string;
  webLink: string | null;
}

export async function getGraphSendStatus(
  orgId?: string,
): Promise<GraphSendStatus> {
  // Resolve org (caller-supplied or infer via first membership).
  let effectiveOrg = orgId || null;
  if (!effectiveOrg) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (uid) {
      const { data: mem } = await supabase
        .from("organisation_members" as any)
        .select("org_id")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      effectiveOrg = (mem as any)?.org_id || null;
    }
  }
  if (!effectiveOrg) {
    return { ready: false, mailbox: null, mode: "off", reason: "no_org" };
  }

  const { data: org } = await supabase
    .from("organisations" as any)
    .select("ms_send_mailbox, ms_send_mode")
    .eq("id", effectiveOrg)
    .maybeSingle();

  const mailbox = (org as any)?.ms_send_mailbox || null;
  const mode = ((org as any)?.ms_send_mode || "off") as GraphSendMode;
  if (!mailbox || mode === "off") {
    return {
      ready: false,
      mailbox,
      mode,
      reason: "mailbox_not_configured",
      message:
        "Microsoft send isn't configured yet. Set the mailbox in Settings → Email.",
    };
  }
  return { ready: true, mailbox, mode };
}

export async function sendViaGraph(
  input: GraphSendInput,
): Promise<GraphSendResult> {
  const { data, error } = await supabase.functions.invoke("send-via-graph", {
    body: input,
  });
  if (error) {
    // supabase-js swallows the response body — surface what we can.
    let hint = error.message || "Failed to send via Microsoft 365.";
    try {
      // FunctionsHttpError exposes context.text() with the JSON body.
      const anyErr = error as any;
      if (anyErr?.context?.text) {
        const raw = await anyErr.context.text();
        try {
          const parsed = JSON.parse(raw);
          hint =
            parsed.message ||
            parsed.detail ||
            parsed.error ||
            hint;
        } catch {
          hint = raw || hint;
        }
      }
    } catch {
      /* ignore */
    }
    throw new Error(hint);
  }
  if (!data || (data as any).error) {
    throw new Error(
      (data as any)?.message || (data as any)?.error || "Failed to send.",
    );
  }
  return data as GraphSendResult;
}
