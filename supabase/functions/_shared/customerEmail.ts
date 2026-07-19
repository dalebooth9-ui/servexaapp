// Shared helper for outbound AUTOMATED customer emails.
// Provides: getEmailBranding(), getSendIdentity(), wrapCustomerEmail(),
// and sendViaResend() which posts to the Resend connector gateway
// (falling back to the direct Resend API when only a plain key is set).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmailBranding {
  org_id: string | null;
  from_name: string;
  from_address: string;
  reply_to: string;
  logo_url: string | null;
  brand_color: string;
  company_name: string;
  strapline: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  signature_html: string | null;
  footer_note: string | null;
  accreditation_logo_urls: string[];
  sign_off_text: string;
}

const VIVA_ORG_ID = "11111111-1111-1111-1111-111111111111";

// Fallback sender for orgs that haven't configured their own email_branding
// row. NEVER falls back to Viva Fire's identity — that would be a cross-tenant
// branding leak on outbound customer email. Servexa's neutral notify address
// is the last resort so a genuinely mis-configured org fails visibly rather
// than silently impersonating Viva.
const NEUTRAL_FROM_NAME = "Servexa";
const NEUTRAL_FROM_ADDRESS =
  Deno.env.get("SERVEXA_FALLBACK_FROM_ADDRESS") ?? "no-reply@notify.servexaapp.com";

// Viva's own branding — used ONLY when getEmailBranding is called for the
// canonical Viva org and their row is missing (should never happen; belt &
// braces). All other orgs get neutral defaults + their own company name.
const VIVA_BRANDING: EmailBranding = {
  org_id: VIVA_ORG_ID,
  from_name: "Viva Fire Protection",
  from_address: "service@vivafire.co.uk",
  reply_to: "service@vivafire.co.uk",
  logo_url: null,
  brand_color: "#1e40af",
  company_name: "Viva Fire Protection Ltd",
  strapline: "Wet & Dry Riser Specialists",
  phone: "0845 269 8482",
  website: "https://www.vivafire.co.uk",
  address: "Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham, OL4 3DZ",
  signature_html: null,
  accreditation_logo_urls: [],
  sign_off_text: "Kind regards,",
  footer_note:
    "This is an automated email from Viva Fire Protection. Reply to this message to contact us directly.",
};

function neutralBranding(orgId: string | null, companyName: string | null): EmailBranding {
  return {
    org_id: orgId,
    from_name: companyName || NEUTRAL_FROM_NAME,
    from_address: NEUTRAL_FROM_ADDRESS,
    reply_to: NEUTRAL_FROM_ADDRESS,
    logo_url: null,
    brand_color: "#1e40af",
    company_name: companyName || NEUTRAL_FROM_NAME,
    strapline: null,
    phone: null,
    website: null,
    address: null,
    signature_html: null,
    accreditation_logo_urls: [],
    sign_off_text: "Kind regards,",
    footer_note: null,
  };
}

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
  const sb = client ?? serviceClient();

  // Resolve the org's own name up-front so a missing email_branding row still
  // produces a sensible signature that says the correct company name.
  let companyName: string | null = null;
  if (orgId) {
    try {
      const { data: org } = await sb
        .from("organisations").select("name").eq("id", orgId).maybeSingle();
      companyName = ((org as any)?.name ?? null) || null;
    } catch (_) { /* ignore */ }
  }

  try {
    if (orgId) {
      const { data } = await sb
        .from("email_branding").select("*").eq("org_id", orgId).limit(1);
      if (data && data.length) {
        const base = orgId === VIVA_ORG_ID
          ? VIVA_BRANDING
          : neutralBranding(orgId, companyName);
        return { ...base, ...(data[0] as any) };
      }
    }
  } catch (err) {
    console.error("[customerEmail] getEmailBranding failed:", err);
  }

  // No row for this org — return neutral defaults with the org's own name.
  // NEVER fall back to another org's email_branding row (cross-tenant leak).
  if (orgId === VIVA_ORG_ID) return VIVA_BRANDING;
  return neutralBranding(orgId ?? null, companyName);
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

export function renderEmailSignature(
  b: EmailBranding,
  opts: { senderName?: string | null } = {},
): string {
  const brand = b.brand_color || "#1e40af";
  const phoneClean = (b.phone || "").replace(/\s+/g, "");
  const websiteHref = b.website
    ? (/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`)
    : "";
  const websiteLabel = b.website ? b.website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const signOffName = (opts.senderName && opts.senderName.trim()) || b.company_name;
  const signOff = (b.sign_off_text && b.sign_off_text.trim()) || "Kind regards,";

  // Sign-off line rendered at start of signature so every customer-facing email
  // closes consistently — matches how a real office email would sign off.
  const signOffBlock = `
    <p style="margin:0 0 14px;color:#111827;font-size:14px;line-height:1.5;">
      ${escapeHtml(signOff)}<br/>
      <strong>${escapeHtml(signOffName)}</strong>
    </p>`;

  // Brand-colour divider bar
  const divider = `<div style="height:3px;background:${brand};margin:0 0 14px;line-height:3px;font-size:0;">&nbsp;</div>`;

  const logoRow = b.logo_url
    ? `<img src="${b.logo_url}" alt="${escapeHtml(b.company_name)}" width="180" style="max-height:60px;max-width:180px;display:block;border:0;outline:none;margin:0 0 6px;" />`
    : `<p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:16px;">${escapeHtml(b.company_name)}</p>`;

  const strapline = b.strapline
    ? `<p style="margin:0 0 10px;color:${brand};font-size:12px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(b.strapline)}</p>`
    : "";

  const contactRows: string[] = [];
  if (b.phone) contactRows.push(`<tr><td style="padding:1px 0;font-size:12px;color:#374151;">Tel: <a href="tel:${phoneClean}" style="color:${brand};text-decoration:none;">${escapeHtml(b.phone)}</a></td></tr>`);
  if (b.from_address) contactRows.push(`<tr><td style="padding:1px 0;font-size:12px;color:#374151;">Email: <a href="mailto:${b.from_address}" style="color:${brand};text-decoration:none;">${escapeHtml(b.from_address)}</a></td></tr>`);
  if (b.website) contactRows.push(`<tr><td style="padding:1px 0;font-size:12px;color:#374151;">Web: <a href="${websiteHref}" style="color:${brand};text-decoration:none;">${escapeHtml(websiteLabel)}</a></td></tr>`);
  const contactBlock = contactRows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${contactRows.join("")}</table>`
    : "";

  const addressBlock = b.address
    ? `<p style="margin:0 0 10px;font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml(b.address)}</p>`
    : "";

  const accreditations = Array.isArray(b.accreditation_logo_urls) && b.accreditation_logo_urls.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 0;"><tr>${
        b.accreditation_logo_urls
          .filter((u) => typeof u === "string" && u.trim().length)
          .map(
            (url) =>
              `<td style="padding:0 8px 0 0;vertical-align:middle;"><img src="${url}" alt="Accreditation" height="34" style="height:34px;width:auto;max-height:34px;display:block;border:0;outline:none;" /></td>`,
          )
          .join("")
      }</tr></table>`
    : "";

  // Custom signature HTML fully overrides the structured block, but sign-off
  // + divider still lead so behaviour matches a real office email signature.
  const body = (b.signature_html && b.signature_html.trim().length > 0)
    ? b.signature_html
    : `${logoRow}${strapline}${contactBlock}${addressBlock}${accreditations}`;

  return `${signOffBlock}${divider}${body}`;
}

export function wrapCustomerEmail(
  b: EmailBranding,
  opts: { previewText?: string; bodyHtml: string; senderName?: string | null },
): string {
  const brand = b.brand_color || "#1e40af";
  const headerLogo = b.logo_url
    ? `<img src="${b.logo_url}" alt="${escapeHtml(b.company_name)}" style="max-height:56px;max-width:220px;display:block;border:0;outline:none;" />`
    : `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(b.company_name)}</h1>`;

  const sig = renderEmailSignature(b, { senderName: opts.senderName });
  const preview = opts.previewText ? escapeHtml(opts.previewText) : "";

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937;">
    ${preview ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${preview}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">
          <tr><td style="background:${brand};padding:20px 28px;">${headerLogo}</td></tr>
          <tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">${opts.bodyHtml}</td></tr>
          <tr><td style="padding:20px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">${sig}</td></tr>
          ${b.footer_note ? `<tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #eef1f4;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">${escapeHtml(b.footer_note)}</td></tr>` : ""}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

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
  const body: Record<string, unknown> = {
    from: payload.from,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
  };
  if (payload.reply_to) body.reply_to = payload.reply_to;
  if (payload.attachments && payload.attachments.length) body.attachments = payload.attachments;

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
  if (!res.ok) console.error(`[customerEmail] Resend send failed [${res.status}]`, parsed);
  return { ok: res.ok, status: res.status, body: parsed };
}
