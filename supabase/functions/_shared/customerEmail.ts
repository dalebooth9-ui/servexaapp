// Shared helper for outbound AUTOMATED customer emails.
// Provides: getEmailBranding(), getSendIdentity(), wrapCustomerEmail()
// and sendBrandedCustomerEmail() which posts to the Resend gateway.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailBranding {
  org_id: string | null;
  from_name: string;
  from_address: string;
  reply_to: string;
  logo_url: string | null;
  brand_color: string;
  company_name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  signature_html: string | null;
  footer_note: string | null;
}

const VIVA_ORG_ID = "11111111-1111-1111-1111-111111111111";

const DEFAULT_BRANDING: EmailBranding = {
  org_id: null,
  from_name: "Viva Fire Protection",
  from_address: "service@vivafire.co.uk",
  reply_to: "service@vivafire.co.uk",
  logo_url: null,
  brand_color: "#1e40af",
  company_name: "Viva Fire Protection Ltd",
  phone: null,
  website: "https://www.vivafire.co.uk",
  address: null,
  signature_html: null,
  footer_note:
    "This is an automated email from Viva Fire Protection. Reply to this message to contact us directly.",
};

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getEmailBranding(
  orgId?: string | null,
  client?: SupabaseClient,
): Promise<EmailBranding> {
  try {
    const sb = client ?? serviceClient();
    let q = sb.from("email_branding").select("*").limit(1);
    if (orgId) q = q.eq("org_id", orgId);
    else q = q.eq("org_id", VIVA_ORG_ID);
    const { data } = await q;
    if (data && data.length) {
      const row = data[0] as any;
      return { ...DEFAULT_BRANDING, ...row };
    }
    // Fallback: any row
    const { data: any1 } = await sb.from("email_branding").select("*").limit(1);
    if (any1 && any1.length) return { ...DEFAULT_BRANDING, ...(any1[0] as any) };
  } catch (err) {
    console.error("[customerEmail] getEmailBranding failed:", err);
  }
  return DEFAULT_BRANDING;
}

export function getSendIdentity(b: EmailBranding): { from: string; reply_to: string } {
  const from = b.from_name?.trim()
    ? `${b.from_name.trim()} <${b.from_address}>`
    : b.from_address;
  return { from, reply_to: b.reply_to || b.from_address };
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function wrapCustomerEmail(
  b: EmailBranding,
  opts: { previewText?: string; bodyHtml: string },
): string {
  const brand = b.brand_color || "#1e40af";
  const logo = b.logo_url
    ? `<img src="${b.logo_url}" alt="${escapeHtml(b.company_name)}" style="max-height:56px;max-width:220px;display:block;border:0;outline:none;" />`
    : `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(b.company_name)}</h1>`;

  const phoneClean = (b.phone || "").replace(/\s+/g, "");
  const sig = (b.signature_html && b.signature_html.trim().length > 0)
    ? b.signature_html
    : `
      <p style="margin:0 0 4px;font-weight:600;color:#111827;font-size:14px;">${escapeHtml(b.company_name)}</p>
      ${b.phone ? `<p style="margin:0;font-size:13px;color:#374151;">Tel: <a href="tel:${phoneClean}" style="color:${brand};text-decoration:none;">${escapeHtml(b.phone)}</a></p>` : ""}
      ${b.website ? `<p style="margin:0;font-size:13px;color:#374151;">Web: <a href="${b.website}" style="color:${brand};text-decoration:none;">${escapeHtml(b.website.replace(/^https?:\/\//, ""))}</a></p>` : ""}
      ${b.address ? `<p style="margin:6px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml(b.address)}</p>` : ""}
    `;

  const preview = opts.previewText ? escapeHtml(opts.previewText) : "";

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937;">
    ${preview ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${preview}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">
          <tr>
            <td style="background:${brand};padding:20px 28px;">${logo}</td>
          </tr>
          <tr>
            <td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">${sig}</td>
          </tr>
          ${b.footer_note ? `<tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #eef1f4;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">${escapeHtml(b.footer_note)}</td></tr>` : ""}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Convenience — POST to Resend via the connector gateway (or fall back
// to direct api.resend.com if RESEND_API_KEY looks like a direct key).
export async function sendViaResend(payload: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<{ ok: boolean; status: number; body: any }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY =
    Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return { ok: false, status: 503, body: { error: "RESEND_API_KEY not configured" } };
  }
  const body = {
    from: payload.from,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
    reply_to: payload.reply_to,
    attachments: payload.attachments,
  };
  // Prefer gateway when Lovable key is present.
  const useGateway = !!LOVABLE_API_KEY;
  const url = useGateway
    ? "https://connector-gateway.lovable.dev/resend/emails"
    : "https://api.resend.com/emails";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: useGateway ? `Bearer ${LOVABLE_API_KEY}` : `Bearer ${RESEND_API_KEY}`,
  };
  if (useGateway) headers["X-Connection-Api-Key"] = RESEND_API_KEY;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, body: parsed };
}
