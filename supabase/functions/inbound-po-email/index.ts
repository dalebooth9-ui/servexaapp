// Supabase Edge Function: inbound-po-email
//
// Receives inbound emails from Resend Inbound (Svix-signed webhooks) addressed
// to  po-<orgslug>-<4chars>@intake.servexaapp.com.
//
// Per Resend docs (resend.com/docs/dashboard/receiving/attachments), the
// `email.received` webhook payload contains METADATA ONLY. Body and
// attachment bytes must be fetched from the Resend REST API using a
// full-access key (RESEND_RECEIVING_API_KEY):
//   GET /emails/receiving/{email_id}              → subject/text/html/headers/raw.download_url
//   GET /emails/receiving/{email_id}/attachments  → data[] with filename/content_type/download_url
//
// Also handles FORWARDED emails: office staff will forward customer POs from
// service@vivafire.co.uk (our own inbox). The forwarder and our own org name
// must NEVER be treated as the PO customer.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { inferJobScope } from "../_shared/inferJobScope.ts";
import { buildThreadHeaders, findExistingThreadJob } from "../_shared/threadDedup.ts";


const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const okSilently = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ────────────────────────────────────────────────────────────────────────────
// Svix signature verification
// ────────────────────────────────────────────────────────────────────────────
async function verifySvix(
  secret: string,
  msgId: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  if (!msgId || !timestamp || !signatureHeader) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  } catch {
    keyBytes = new TextEncoder().encode(rawSecret);
  }

  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const toSign = new TextEncoder().encode(`${msgId}.${timestamp}.${body}`);
  const sig = await crypto.subtle.sign("HMAC", key, toSign);
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  for (const part of signatureHeader.split(" ")) {
    const [ver, val] = part.split(",");
    if (ver === "v1" && val && timingSafeEqual(val, expected)) return true;
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Webhook payload parsing
// ────────────────────────────────────────────────────────────────────────────

// Signature furniture heuristics — Outlook/Word style embedded images that
// arrive in every reply/forward of an email thread (logos, accreditation
// strips, socialite icons). These pollute job Photos as fake evidence.
const EMBEDDED_IMAGE_NAME_RE = /^(image|oledata|clip_image)[0-9]{2,4}\.(png|jpe?g|gif|bmp|webp)$/i;
const SMALL_LOGO_BYTES = 60 * 1024; // 60KB — real site photos are almost always bigger

function isImageMime(mime: string): boolean {
  return /^image\//i.test(mime || "");
}

/**
 * Classifies attachments to filter out inline email-signature imagery
 * while preserving genuine attachments (PDFs, Office docs, real photos).
 *
 * Marks each Attachment with:
 *  - isInlineSignature=true  → drop entirely (signature furniture)
 *  - reviewFlag=true         → keep, but tag as "email attachment — review"
 */
function classifyAttachments(attachments: Attachment[], htmlBody: string): void {
  // Collect cid: references present in the HTML body — inline images that the
  // body actually renders are almost always signature/decorative art.
  const cidRefs = new Set<string>();
  if (htmlBody) {
    const re = /cid:([^"'\s>)]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(htmlBody)) !== null) {
      cidRefs.add(m[1].trim().toLowerCase());
    }
  }

  for (const a of attachments) {
    if (!isImageMime(a.contentType)) continue; // never filter non-images
    const fn = a.filename || "";
    const disposition = (a.contentDisposition || "").toLowerCase();
    const cid = (a.contentId || "").toLowerCase();
    const size = a.bytes.byteLength;
    const nameLooksEmbedded = EMBEDDED_IMAGE_NAME_RE.test(fn);
    const referencedInBody = cid && cidRefs.has(cid);
    const explicitlyInline = disposition === "inline" || Boolean(cid);
    const smallLogoSized = size < SMALL_LOGO_BYTES;

    // Hard-drop: classic signature furniture.
    //  - Explicitly inline / referenced via cid AND either has embedded-style
    //    filename OR is small.
    //  - OR: filename matches imageNNN.ext AND is small (covers cases where
    //    disposition metadata is missing but the pattern is unambiguous).
    if (
      (explicitlyInline && (nameLooksEmbedded || smallLogoSized || referencedInBody)) ||
      (nameLooksEmbedded && smallLogoSized)
    ) {
      a.isInlineSignature = true;
      continue;
    }

    // Ambiguous: inline flag present but the image is large, OR
    // filename looks embedded but size is real-photo-sized. Keep, but flag
    // so the office can review before treating as job evidence.
    if (explicitlyInline || nameLooksEmbedded) {
      a.reviewFlag = true;
    }
  }
}

interface Attachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  contentDisposition?: string; // "inline" | "attachment"
  contentId?: string;          // RFC2392 cid (no angle brackets)
  isInlineSignature?: boolean; // set by classifyAttachments()
  reviewFlag?: boolean;        // ambiguous image → label "email attachment — review"
}
interface InboundEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  rawEmlBase64: string | null;
  attachments: Attachment[];
  webhookHeaders: Record<string, string>;
}

function normaliseRecipients(d: any): string[] {
  const toRaw = d?.to ?? d?.recipient ?? d?.recipients ?? [];
  const list: string[] = Array.isArray(toRaw)
    ? toRaw.map((x: any) => (typeof x === "string" ? x : x?.email ?? x?.address ?? "")).filter(Boolean)
    : typeof toRaw === "string" ? [toRaw] : [];
  return list.map((s) => s.toLowerCase().trim());
}

function extractIntakeAddress(recipients: string[]): string | null {
  return recipients.find((r) => /@intake\.servexaapp\.com$/i.test(r)) ?? null;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "").replace(/^data:[^;]+;base64,/i, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Fetch the full email + attachment bytes from Resend's REST API.
 * The webhook payload only carries metadata (data.email_id).
 */
async function fetchInboundFromResend(
  emailId: string,
  apiKey: string,
): Promise<InboundEmail> {
  const headers = { Authorization: `Bearer ${apiKey}` };

  // 1. Email details
  const detailResp = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}`,
    { headers },
  );
  if (!detailResp.ok) {
    const errText = await detailResp.text().catch(() => "");
    console.error(
      `Resend GET /emails/receiving/${emailId} failed`,
      detailResp.status,
      errText.slice(0, 500),
    );
    throw new Error(`Resend email fetch failed: ${detailResp.status}`);
  }
  const detail: any = await detailResp.json();
  const d = detail?.data ?? detail ?? {};

  const fromField = d?.from;
  const from = typeof fromField === "string"
    ? fromField
    : (fromField?.email ?? "");

  // 2. Attachment list + bytes
  let attachments: Attachment[] = [];
  const attListResp = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments`,
    { headers },
  );
  if (!attListResp.ok) {
    const errText = await attListResp.text().catch(() => "");
    console.error(
      `Resend GET /emails/receiving/${emailId}/attachments failed`,
      attListResp.status,
      errText.slice(0, 500),
    );
  } else {
    const attJson: any = await attListResp.json();
    const list: any[] = Array.isArray(attJson?.data) ? attJson.data : [];
    for (const a of list) {
      const filename = String(a?.filename ?? a?.name ?? "attachment.bin");
      const contentType = String(
        a?.content_type ?? a?.contentType ?? "application/octet-stream",
      );
      const url = a?.download_url ?? a?.url;
      const contentDisposition = String(
        a?.content_disposition ?? a?.contentDisposition ?? a?.disposition ?? "",
      ).toLowerCase().trim() || undefined;
      const rawCid = String(a?.content_id ?? a?.contentId ?? a?.cid ?? "").trim();
      const contentId = rawCid.replace(/^<|>$/g, "") || undefined;
      if (!url) {
        console.warn("attachment has no download_url", { filename });
        continue;
      }
      try {
        const r = await fetch(url);
        if (!r.ok) {
          console.error("attachment download failed", filename, r.status);
          continue;
        }
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
          console.warn("skipping oversized attachment", filename, buf.byteLength);
          continue;
        }
        attachments.push({ filename, contentType, bytes: buf, contentDisposition, contentId });
      } catch (e) {
        console.error("attachment fetch error", filename, e);
      }
    }
  }

  // 3. Optional raw .eml
  let rawEmlBase64: string | null = null;
  const rawUrl = d?.raw?.download_url ?? d?.raw_download_url ?? null;
  if (rawUrl) {
    try {
      const r = await fetch(rawUrl);
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        rawEmlBase64 = bytesToBase64(buf);
      } else {
        console.warn("raw eml download failed", r.status);
      }
    } catch (e) {
      console.error("raw eml fetch error", e);
    }
  }

  // Capture RFC822-ish headers surfaced by Resend so we can dedup threads
  // without always having to fetch and parse the raw .eml.
  const webhookHeaders: Record<string, string> = {};
  const rawHeaders: any = d?.headers ?? d?.headers_map ?? null;
  if (rawHeaders && typeof rawHeaders === "object") {
    if (Array.isArray(rawHeaders)) {
      for (const h of rawHeaders) {
        const n = String(h?.name ?? h?.key ?? "").trim().toLowerCase();
        const v = String(h?.value ?? h?.val ?? "").trim();
        if (n && v && !webhookHeaders[n]) webhookHeaders[n] = v;
      }
    } else {
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (v == null) continue;
        webhookHeaders[String(k).toLowerCase()] = String(v);
      }
    }
  }
  // Some Resend payloads surface these at the top level.
  for (const k of ["message_id", "in_reply_to", "references"]) {
    const v = (d as any)?.[k];
    if (v && !webhookHeaders[k.replace("_", "-")]) {
      webhookHeaders[k.replace("_", "-")] = String(v);
    }
  }

  return {
    from: String(from).trim(),
    to: normaliseRecipients(d),
    subject: String(d?.subject ?? "").trim(),
    text: String(d?.text ?? d?.plain ?? ""),
    html: String(d?.html ?? ""),
    rawEmlBase64,
    attachments,
    webhookHeaders,
  };
}


// ────────────────────────────────────────────────────────────────────────────
// Forwarded-email handling
// ────────────────────────────────────────────────────────────────────────────
/**
 * When an email is forwarded (Gmail / Outlook / Apple Mail), the original
 * message appears below a "Forwarded message" header. Return the portion below
 * that header when present — that's the true source context.
 */
function extractForwardedBody(text: string): { forwardedFrom: string | null; body: string } {
  if (!text) return { forwardedFrom: null, body: "" };
  const markers = [
    /-{3,}\s*Forwarded message\s*-{3,}/i,
    /Begin forwarded message:/i,
    /^From:.*\n(?:Sent|Date):.*\n(?:To|Subject):/im,
  ];
  let idx = -1;
  for (const m of markers) {
    const found = text.search(m);
    if (found >= 0 && (idx === -1 || found < idx)) idx = found;
  }
  if (idx < 0) return { forwardedFrom: null, body: text };
  const below = text.slice(idx);
  const fromMatch = below.match(/^From:\s*(.+)$/im);
  return {
    forwardedFrom: fromMatch ? fromMatch[1].trim() : null,
    body: below,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<script[\s\S]*?<\/script>/gi, "")
             .replace(/<[^>]+>/g, " ")
             .replace(/\s+/g, " ")
             .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// AI extraction
// ────────────────────────────────────────────────────────────────────────────
interface Extracted {
  customer_name?: string;
  site_address?: string;
  po_number?: string;
  job_description?: string;
  due_date?: string;
  priority?: string;
  po_value?: number | string | null;
  currency?: string;
  quote_reference?: string;   // e.g. "QUO-0042"
  job_reference?: string;     // e.g. "VFP-00132" or "TM-…"
}



function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function buildPrompt(ownOrgName: string): string {
  const owned = ownOrgName ? `"${ownOrgName}"` : "the receiving company";
  return `You extract purchase order details from an inbound email and its attachments for a fire-safety contractor.

CRITICAL RULES for customer_name (READ CAREFULLY):
- ${owned} is the RECEIVING contractor — NEVER the customer. If the letterhead, sender, signature, or any field names ${owned}, that is NOT the customer.
- The email may be FORWARDED from an internal mailbox (e.g. an office staff address). NEVER use the forwarder / sender address as the customer.
- The customer is the company that ISSUED the PO to us. Look for it in:
    1. The PDF letterhead / logo header
    2. "From:", "Bill To:", "Client:", "Company:" fields on the PO
    3. The signature block of the ORIGINAL email (below any "---------- Forwarded message ----------" header)
    4. The original sender's email domain (below the forward header)
- If you cannot confidently identify a customer that is NOT ${owned} and NOT the forwarder, return "" for customer_name — do NOT guess.

The attachment (if a PDF or image is provided) is the PRIMARY source; otherwise mine the ENTIRE email body — including any quoted / forwarded thread beneath the latest reply. A common case is a one-line reply like "PO 4512, please go ahead" on top of a long quoted chain that contains all the real detail (customer, site, scope, dates). Read the whole thread.

Return a SINGLE JSON object with exactly these fields (use "" or null when unknown — never guess):
- customer_name
- site_address: the site / delivery / work address
- po_number: the customer's purchase order reference (look for "PO", "PO#", "Order No", "Ref")
- job_description: full description of the work or goods ordered (be thorough — include scope, quantities, item lists)
- due_date: required completion date in YYYY-MM-DD, or ""
- priority: "high", "medium" or "low" (default "medium")
- po_value: total order value as a NUMBER (strip currency symbols), or null
- currency: ISO code ("GBP", "USD", "EUR") inferred from £/$/€ or explicit text, or ""
- quote_reference: OUR quote reference if the thread mentions one (format "QUO-" followed by digits, e.g. "QUO-0042"), else ""
- job_reference: OUR job reference if the thread mentions one (format "VFP-" or "TM-" followed by digits, e.g. "VFP-00132"), else ""

Return ONLY the JSON object, no markdown, no explanation.`;
}

async function extractPO(
  email: InboundEmail,
  ownOrgName: string,
  apiKey: string,
): Promise<Extracted> {
  const rawBody = (email.text && email.text.trim()) || stripHtml(email.html);
  const { forwardedFrom } = extractForwardedBody(rawBody);

  // Send the WHOLE body (latest reply + quoted chain) — the PO detail is
  // often only in the quoted thread beneath a one-line reply.
  const contextLines = [
    `Forwarder (INTERNAL — NOT the customer): ${email.from}`,
    `Receiving contractor (NOT the customer): ${ownOrgName || "(unknown)"}`,
    forwardedFrom ? `Original sender (below forward header): ${forwardedFrom}` : null,
    `Subject: ${email.subject}`,
    "",
    "--- Full email body (includes quoted / forwarded thread) ---",
    rawBody || "(no body)",
  ].filter(Boolean).join("\n").slice(0, 30000);


  const content: any[] = [{ type: "text", text: contextLines }];

  const candidates = email.attachments.filter((a) => {
    const ct = a.contentType.toLowerCase();
    return ct === "application/pdf" ||
      /\.pdf$/i.test(a.filename) ||
      ct.startsWith("image/") ||
      /\.(jpe?g|png|webp|heic|tiff?)$/i.test(a.filename);
  });
  // Prefer attachments whose filename suggests a purchase order.
  const scoreName = (n: string): number => {
    const s = n.toLowerCase();
    let score = 0;
    if (/\bpo\b|purchase.?order|order.?form|order.?no/.test(s)) score += 10;
    if (/\.pdf$/i.test(s)) score += 2; // PDFs usually the PO over inline logos
    if (/logo|signature|footer|banner|icon/.test(s)) score -= 5;
    return score;
  };
  candidates.sort((a, b) => scoreName(b.filename) - scoreName(a.filename));
  const primary = candidates[0];
  if (primary) {
    const ct = primary.contentType.toLowerCase();
    const mime = ct.startsWith("image/")
      ? primary.contentType
      : ct === "application/pdf" || /\.pdf$/i.test(primary.filename)
        ? "application/pdf"
        : primary.contentType || "application/octet-stream";
    const b64 = bytesToBase64(primary.bytes);
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${b64}` },
    });
    console.log("PO extraction using attachment", { filename: primary.filename, mime, bytes: primary.bytes.byteLength });
  }


  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: primary ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: buildPrompt(ownOrgName) },
        { role: "user", content },
      ],
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    console.error("AI gateway error", resp.status, await resp.text());
    return {};
  }
  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? (parsed[0] || {}) : parsed;
  } catch {
    return {};
  }
}

/** Normalise a company name for equality checks. */
function normaliseName(s: string): string {
  return s.toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|inc|incorporated|llc|co|company|group)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** True if the extracted customer name matches our own org (belt-and-braces
 *  post-filter — the model may still occasionally get it wrong). */
function isOwnOrg(candidate: string, ownOrgName: string): boolean {
  if (!candidate || !ownOrgName) return false;
  const c = normaliseName(candidate);
  const o = normaliseName(ownOrgName);
  if (!c || !o) return false;
  return c === o || c.includes(o) || o.includes(c);
}

/** True if the extracted customer name matches the forwarder's email domain. */
function isForwarderDomain(candidate: string, forwarderEmail: string): boolean {
  if (!candidate || !forwarderEmail) return false;
  const dom = forwarderEmail.split("@")[1]?.split(".")[0] ?? "";
  return dom ? normaliseName(candidate).includes(normaliseName(dom)) : false;
}

// ────────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    console.warn("Rejecting oversized payload", contentLength);
    return json(413, { error: "Payload too large" });
  }

  const bodyText = await req.text();
  if (bodyText.length > MAX_BODY_BYTES) return json(413, { error: "Payload too large" });

  const signingSecret = Deno.env.get("RESEND_INBOUND_WEBHOOK_SECRET");
  if (!signingSecret) {
    console.error("RESEND_INBOUND_WEBHOOK_SECRET missing");
    return json(500, { error: "Server not configured" });
  }
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTs = req.headers.get("svix-timestamp") ?? "";
  const svixSig = req.headers.get("svix-signature") ?? "";
  const valid = await verifySvix(signingSecret, svixId, svixTs, bodyText, svixSig);
  if (!valid) {
    console.warn("Invalid webhook signature");
    return json(401, { error: "Invalid signature" });
  }

  let payload: any;
  try { payload = JSON.parse(bodyText); } catch { return json(400, { error: "Invalid JSON" }); }

  const preRecipients = normaliseRecipients(payload?.data ?? payload ?? {});
  const intakeAddr = extractIntakeAddress(preRecipients);
  if (!intakeAddr) {
    console.log("No intake address in recipients", preRecipients);
    return okSilently();
  }

  // Webhook is metadata-only — fetch full email + attachments from Resend API.
  const receivingKey = Deno.env.get("RESEND_RECEIVING_API_KEY");
  if (!receivingKey) {
    console.error(
      "RESEND_RECEIVING_API_KEY is missing — add a full-access Resend API key under this exact secret name to fetch inbound email content.",
    );
    return json(500, { error: "Server not configured: RESEND_RECEIVING_API_KEY" });
  }
  const emailId: string | undefined =
    payload?.data?.email_id ?? payload?.data?.id ?? payload?.email_id ?? payload?.id;
  if (!emailId) {
    console.error("Webhook payload missing data.email_id", { keys: Object.keys(payload?.data ?? {}) });
    return json(400, { error: "Missing email_id" });
  }
  let email: InboundEmail;
  try {
    email = await fetchInboundFromResend(emailId, receivingKey);
  } catch (e) {
    console.error("Resend fetch failed", e);
    return json(502, { error: "Resend fetch failed" });
  }

  // Classify attachments up-front: mark inline signature images so we can
  // drop them from job Photos, and flag ambiguous images for review.
  classifyAttachments(email.attachments, email.html);
  const droppedInline = email.attachments.filter((a) => a.isInlineSignature);
  if (droppedInline.length > 0) {
    email.attachments = email.attachments.filter((a) => !a.isInlineSignature);
  }

  // Diagnostic log for EVERY inbound email — so failed intakes are traceable
  // even if we bail early later. Michelle can grep function logs by subject/from.
  console.log("[inbound-po-email] received", {
    email_id: emailId,
    from: email.from,
    to: email.to,
    subject: email.subject,
    intake: intakeAddr,
    attachment_count: email.attachments.length,
    attachment_names: email.attachments.map((a) => `${a.filename} (${a.bytes.byteLength}b, ${a.contentType}${a.reviewFlag ? ", review" : ""})`),
    dropped_inline_signature_images: droppedInline.map((a) => `${a.filename} (${a.bytes.byteLength}b)`),
    body_text_length: email.text.length,
    body_html_length: email.html.length,
    has_raw_eml: !!email.rawEmlBase64,
  });


  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rows, error: rpcErr } = await admin.rpc("resolve_org_by_intake_email", { _email: intakeAddr });
  if (rpcErr) {
    console.error("resolve_org_by_intake_email failed", rpcErr);
    return json(500, { error: "Lookup failed" });
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  const orgId: string | null = row?.org_id ?? null;
  const allowed: boolean = row?.allowed === true;

  if (!orgId) { console.log("Unknown intake address", intakeAddr); return okSilently(); }
  if (!allowed) { console.warn("Rate limited", intakeAddr); return okSilently(); }

  // Look up our own org name so we can (a) tell the model what NOT to pick
  // and (b) post-filter its output.
  let ownOrgName = "";
  {
    const { data: orgRow } = await admin
      .from("organisations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    ownOrgName = orgRow?.name ?? "";
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const extracted: Extracted = apiKey ? await extractPO(email, ownOrgName, apiKey) : {};

  // ── Regex fallback for OUR references (in case the model missed them) ─
  const rawBodyAll = `${email.subject}\n${email.text || ""}\n${stripHtml(email.html)}`;
  const quoteRefRe = /\bQUO-\d{3,6}\b/i;
  const jobRefRe = /\b(?:VFP|TM)-\d{3,6}\b/i;
  const quoteRef = (extracted.quote_reference || "").trim().toUpperCase()
    || (rawBodyAll.match(quoteRefRe)?.[0]?.toUpperCase() ?? "");
  const jobRef = (extracted.job_reference || "").trim().toUpperCase()
    || (rawBodyAll.match(jobRefRe)?.[0]?.toUpperCase() ?? "");

  // ── If a quote reference is found, prefill from that quote ────────────
  const provenance: string[] = [];
  let quotePrefill: {
    customer_name?: string | null;
    customer_id?: string | null;
    address?: string | null;
    description?: string | null;
  } = {};
  let matchedQuoteRef: string | null = null;
  if (quoteRef) {
    const { data: q } = await admin
      .from("invoices")
      .select("id, invoice_number, customer_name, customer_address, notes, job_id, document_type")
      .eq("org_id", orgId)
      .ilike("invoice_number", quoteRef)
      .eq("document_type", "quote")
      .maybeSingle();
    if (q) {
      matchedQuoteRef = q.invoice_number;
      quotePrefill = {
        customer_name: q.customer_name || null,
        address: q.customer_address || null,
        description: q.notes || null,
      };
      // Try to link the customer_id via the quote's linked job
      if (q.job_id) {
        const { data: linkedJob } = await admin
          .from("jobs")
          .select("customer_id, customer, address")
          .eq("id", q.job_id)
          .maybeSingle();
        if (linkedJob) {
          quotePrefill.customer_id = linkedJob.customer_id ?? null;
          quotePrefill.customer_name = quotePrefill.customer_name || linkedJob.customer || null;
          quotePrefill.address = quotePrefill.address || linkedJob.address || null;
        }
      }
      provenance.push(`Matched quote ${matchedQuoteRef} — customer/site/scope prefilled from that quote.`);
    } else {
      provenance.push(`Quote reference ${quoteRef} mentioned in email, but no matching quote found in this org.`);
    }
  }

  // ── If a job reference is found, flag possible relation ──────────────
  let relatedJobRef: string | null = null;
  if (jobRef) {
    const { data: existingJob } = await admin
      .from("jobs")
      .select("id, reference_number")
      .eq("org_id", orgId)
      .eq("reference_number", jobRef)
      .maybeSingle();
    if (existingJob) {
      relatedJobRef = existingJob.reference_number;
      provenance.push(`Email references existing job ${relatedJobRef} — approver should decide whether to merge or keep separate.`);
    } else {
      provenance.push(`Job reference ${jobRef} mentioned in email, but no matching job found in this org.`);
    }
  }

  // Post-filter: strip customer if it looks like ourselves or the forwarder.
  let extractedCustomer = (extracted.customer_name || "").trim();
  if (extractedCustomer) {
    if (isOwnOrg(extractedCustomer, ownOrgName)) {
      console.log("Discarding extracted customer — matches own org", { extractedCustomer, ownOrgName });
      extractedCustomer = "";
    } else if (isForwarderDomain(extractedCustomer, email.from)) {
      console.log("Discarding extracted customer — matches forwarder domain", { extractedCustomer, from: email.from });
      extractedCustomer = "";
    }
  }

  // Prefer extracted customer; fall back to quote prefill.
  const effectiveCustomerName = extractedCustomer || (quotePrefill.customer_name ?? "");

  // Match/create a customer when we have a valid, non-own-org name.
  let customerId: string | null = quotePrefill.customer_id ?? null;
  let customerName: string | null = effectiveCustomerName || null;
  if (effectiveCustomerName && !customerId) {
    const { data: match } = await admin
      .from("customers")
      .select("id, name")
      .eq("org_id", orgId)
      .ilike("name", effectiveCustomerName)
      .limit(1)
      .maybeSingle();
    if (match) {
      customerId = match.id;
      customerName = match.name;
    } else if (extractedCustomer) {
      // Only auto-create when the AI actually extracted a customer (don't
      // silently create from a quote prefill that failed to match).
      const { data: newCust } = await admin
        .from("customers")
        .insert({ name: extractedCustomer, org_id: orgId } as any)
        .select("id, name")
        .single();
      if (newCust) { customerId = newCust.id; customerName = newCust.name; }
    }
  }


  const priority = ["high", "medium", "low"].includes(extracted.priority ?? "") ? extracted.priority! : "medium";

  const poNum = (extracted.po_number || "").trim();
  const custForName = (customerName || "").trim();
  const desc = (extracted.job_description || "").trim() || (quotePrefill.description ?? "").trim();
  const siteAddress = (extracted.site_address || "").trim() || (quotePrefill.address ?? "").trim();
  const needsReviewNoPo = !poNum;
  let jobName: string;
  if (poNum && custForName) jobName = `PO ${poNum} — ${custForName}`;
  else if (poNum) jobName = `PO ${poNum}`;
  else if (custForName) jobName = `Needs review — no PO number (${custForName})`;
  else if (desc) jobName = `Needs review — no PO number: ${desc}`;
  else jobName = `Needs review — no PO number: ${email.subject || "(no subject)"}`;
  jobName = jobName.slice(0, 200);

  // Normalise PO value
  let poValueNum: number | null = null;
  if (extracted.po_value != null && extracted.po_value !== "") {
    const n = typeof extracted.po_value === "number"
      ? extracted.po_value
      : parseFloat(String(extracted.po_value).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) poValueNum = n;
  }
  const currency = (extracted.currency || "").trim().toUpperCase();

  const { forwardedFrom, body: forwardedBody } = extractForwardedBody(
    email.text || stripHtml(email.html),
  );
  const briefParts: string[] = [];
  if (needsReviewNoPo) {
    briefParts.push("⚠️ Needs review — no PO number detected in email or attachments.");
    briefParts.push("");
  }
  if (email.attachments.length === 0) {
    briefParts.push("(Body-only email — no attachments were included.)");
  }
  briefParts.push(`Forwarded by: ${email.from}`);
  if (forwardedFrom) briefParts.push(`Original sender: ${forwardedFrom}`);
  briefParts.push(`Original subject: ${email.subject}`);
  if (poNum) briefParts.push(`PO number: ${poNum}`);
  if (poValueNum != null) briefParts.push(`PO value: ${currency ? currency + " " : ""}${poValueNum.toFixed(2)}`);
  if (matchedQuoteRef) briefParts.push(`Related quote: ${matchedQuoteRef}`);
  if (relatedJobRef) briefParts.push(`Possibly related job: ${relatedJobRef}`);
  if (provenance.length) {
    briefParts.push("");
    briefParts.push("--- Source / provenance ---");
    for (const p of provenance) briefParts.push(`• ${p}`);
  }
  briefParts.push("");
  if (desc) briefParts.push(desc);
  if (forwardedBody) briefParts.push("", "--- Email body ---", forwardedBody.slice(0, 4000));

  // Scope inference — pre-attach the right job sheets so pending jobs are
  // never empty, and set the job category when we can guess confidently.
  const inferred = inferJobScope({
    description: desc,
    subject: email.subject,
    body: forwardedBody,
  });
  if (inferred.reasons.length) {
    briefParts.push("", "--- Auto-detected scope ---");
    for (const r of inferred.reasons) briefParts.push(`• ${r}`);
    if (inferred.templateNames.length) {
      briefParts.push(`Templates pre-attached: ${inferred.templateNames.join(", ")}`);
    }
  }

  const jobInsert: Record<string, unknown> = {
    name: jobName,
    org_id: orgId,
    customer_id: customerId,
    customer: customerName,
    address: siteAddress || null,
    priority,
    category: inferred.categorySlug || "general",
    is_remedial: inferred.isRemedial,
    due_date: extracted.due_date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.due_date) ? extracted.due_date : null,
    status: "pending_review",
    source: "email_po",
    brief: briefParts.join("\n").trim() || null,
    customer_po: poNum || null,
  };


  // ── Thread-aware dedup ─────────────────────────────────────────────────
  // Reply/forward chains and re-forwards used to spawn a fresh draft for
  // every email. Now we resolve the conversation the email belongs to:
  //   (a) In-Reply-To / References ancestry against any job we've filed, or
  //   (b) legacy PO+sender match (kept as a safety net for pre-header jobs),
  //   (c) normalised-subject + sender-domain match on a pending draft from
  //       the last 14 days.
  // If any hit, attach to that draft instead of creating a new one.
  let jobId: string;
  let createdJobRef: string;
  let idempotentReuse = false;
  let dedupMatchedBy: "headers" | "subject_sender" | "po_sender" | null = null;

  const rawEmlText = email.rawEmlBase64
    ? (() => { try { return new TextDecoder().decode(b64ToBytes(email.rawEmlBase64!)); } catch { return null; } })()
    : null;
  const threadHeaders = buildThreadHeaders({
    fromRaw: email.from,
    subject: email.subject,
    rawEmlText,
    webhookHeaders: email.webhookHeaders,
  });
  const messageIdsForJob = threadHeaders.messageId ? [threadHeaders.messageId] : [];

  // (a) + (c) unified lookup.
  const threadHit = await findExistingThreadJob(admin, orgId, threadHeaders);
  let existing: { id: string; reference_number: string | null; brief: string | null; name: string | null } | null = threadHit;
  if (threadHit) dedupMatchedBy = threadHit.matchedBy;

  // (b) Legacy PO + forwarder match — protects drafts created before we
  // recorded thread headers.
  const senderKey = (email.from || "").toLowerCase().trim();
  if (!existing && poNum && senderKey) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: dupCandidates } = await admin
      .from("jobs")
      .select("id, reference_number, brief, name, created_at")
      .eq("org_id", orgId)
      .eq("source", "email_po")
      .eq("status", "pending_review")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20);
    const poNeedle = `po ${poNum.toLowerCase()}`;
    const senderNeedle = `forwarded by: ${senderKey}`;
    existing = (dupCandidates || []).find((j: any) => {
      const name = (j.name || "").toLowerCase();
      const brief = (j.brief || "").toLowerCase();
      const poHit = name.includes(poNeedle) || brief.includes(`po number: ${poNum.toLowerCase()}`);
      const senderHit = brief.includes(senderNeedle);
      return poHit && senderHit;
    }) || null;
    if (existing) dedupMatchedBy = "po_sender";
  }

  if (existing) {
    idempotentReuse = true;
    jobId = existing.id;
    createdJobRef = existing.reference_number ?? "";
    console.log("Thread-dedup PO intake — attaching to existing draft", {
      jobId, createdJobRef, matchedBy: dedupMatchedBy,
      messageId: threadHeaders.messageId,
      normalizedSubject: threadHeaders.normalizedSubject,
      senderDomain: threadHeaders.senderDomain,
    });

    // Append a thread note so the office can see additional traffic arrived.
    try {
      await admin.from("job_messages").insert({
        job_id: jobId,
        message: `Further email received on this thread from ${email.from}${threadHeaders.messageId ? ` (${threadHeaders.messageId})` : ""} — ${email.attachments.length} attachment(s) added.`,
        author_role: "system",
      } as any);
    } catch (e) { console.warn("thread note insert failed", e); }

    // If the earlier draft had no PO number and this email carries one,
    // upgrade the draft in-place so office review isn't stuck at "no PO".
    if (poNum) {
      const existingName = (existing.name || "").toLowerCase();
      const existingBrief = (existing.brief || "").toLowerCase();
      const hasPo = existingName.includes(`po ${poNum.toLowerCase()}`) ||
        existingBrief.includes(`po number: ${poNum.toLowerCase()}`);
      const looksLikeNoPo = existingName.includes("needs review — no po number") || !hasPo;
      if (!hasPo && looksLikeNoPo) {
        const newName = customerName ? `PO ${poNum} — ${customerName}` : `PO ${poNum}`;
        const appendBrief = `${existing.brief ? existing.brief + "\n\n" : ""}--- PO number found in follow-up email ---\nPO number: ${poNum}`;
        try {
          await admin.from("jobs")
            .update({ name: newName.slice(0, 200), brief: appendBrief, customer_po: poNum } as any)
            .eq("id", jobId);
        } catch (e) { console.warn("po-upgrade failed", e); }
      }
    }

    // Merge new message-id + refresh last_email_at on the existing draft.
    try {
      const merged = Array.from(new Set([
        ...(existing as any).intake_message_ids || [],
        ...messageIdsForJob,
      ]));
      await admin.from("jobs").update({
        intake_message_ids: merged,
        intake_last_email_at: new Date().toISOString(),
      } as any).eq("id", jobId);
    } catch (e) { console.warn("thread headers merge failed", e); }
  }

  if (!idempotentReuse) {
    // Persist thread headers on the new draft so future replies match.
    (jobInsert as any).intake_message_ids = messageIdsForJob;
    (jobInsert as any).intake_normalized_subject = threadHeaders.normalizedSubject || null;
    (jobInsert as any).intake_sender_email = threadHeaders.senderEmail || null;
    (jobInsert as any).intake_sender_domain = threadHeaders.senderDomain || null;
    (jobInsert as any).intake_last_email_at = new Date().toISOString();

    const { data: newJob, error: jobErr } = await admin
      .from("jobs")
      .insert(jobInsert as any)
      .select("id, reference_number")
      .single();
    if (jobErr || !newJob) {
      console.error("Job insert failed", jobErr);
      return json(500, { error: "Could not create job" });
    }
    jobId = newJob.id;
    createdJobRef = newJob.reference_number;

    // Pre-attach any inferred blank job sheets on new jobs only — duplicates
    // reuse the existing draft which already has its own attachments.
    const templateNames = [...inferred.templateNames];
    if (inferred.isRemedial && templateNames.length === 0) {
      templateNames.push("Remedial Works Completion");
    }
    if (templateNames.length) {
      try {
        const { data: matched } = await admin
          .from("job_sheet_templates")
          .select("name")
          .eq("status", "published")
          .in("name", templateNames);
        const rows = (matched || []).map((t: any) => ({
          job_id: jobId,
          document_type: "blank_job_sheet",
          label: t.name,
          source: "auto",
          org_id: orgId,
        }));
        if (rows.length) {
          const { error: docErr } = await admin.from("job_documents").insert(rows as any);
          if (docErr) console.error("inbound-po-email auto-attach failed", docErr);
        }
      } catch (e) {
        console.error("inbound-po-email auto-attach threw", e);
      }
    }

    // Seed remedial items when the wording read like a list of works
    if (inferred.isRemedial && inferred.remedialItems.length) {
      try {
        const rows = inferred.remedialItems.map((description, i) => ({
          job_id: jobId,
          org_id: orgId,
          seq: i,
          description,
          status: "pending",
          source: "po_inference",
        }));
        const { error: itemsErr } = await admin.from("job_remedial_items").insert(rows as any);
        if (itemsErr) console.error("inbound-po-email remedial-items seed failed", itemsErr);
      } catch (e) {
        console.error("inbound-po-email remedial-items seed threw", e);
      }
    }
  }


  // ── Store raw .eml + attachments in po-intake bucket ───────────────────
  const uploads: { path: string; label: string; contentType: string; bytes: Uint8Array }[] = [];
  if (email.rawEmlBase64) {
    try {
      const bytes = b64ToBytes(email.rawEmlBase64);
      uploads.push({
        path: `${orgId}/${jobId}/original.eml`,
        label: "Original email",
        contentType: "message/rfc822",
        bytes,
      });
    } catch (e) { console.error("raw eml decode failed", e); }
  } else {
    // Resend didn't hand us a raw .eml — synthesize a minimal RFC 822 message
    // from the metadata we do have, so Michelle can always open the source
    // (critical for body-only PO emails with no attachments).
    try {
      const synth =
        `From: ${email.from}\r\n` +
        `To: ${email.to.join(", ")}\r\n` +
        `Subject: ${email.subject}\r\n` +
        `Date: ${new Date().toUTCString()}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/plain; charset=UTF-8\r\n` +
        `X-Servexa-Note: Synthesized from webhook metadata (raw source unavailable from provider).\r\n` +
        `\r\n` +
        (email.text || stripHtml(email.html) || "(empty body)");
      uploads.push({
        path: `${orgId}/${jobId}/original.eml`,
        label: "Original email (reconstructed)",
        contentType: "message/rfc822",
        bytes: new TextEncoder().encode(synth),
      });
    } catch (e) { console.error("synth eml build failed", e); }
  }
  for (const a of email.attachments) {
    if (a.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      console.warn("Skipping large attachment", a.filename);
      continue;
    }
    const safe = a.filename.replace(/[^\w.\-]/g, "_").slice(0, 120) || "attachment.bin";
    uploads.push({
      path: `${orgId}/${jobId}/${Date.now()}-${safe}`,
      label: a.filename,
      contentType: a.contentType || "application/octet-stream",
      bytes: a.bytes,
    });
  }

  let uploadedCount = 0;
  for (const u of uploads) {
    const { error: upErr } = await admin.storage.from("po-intake").upload(u.path, u.bytes, {
      contentType: u.contentType,
      upsert: false,
    });
    if (upErr) { console.error("upload failed", u.path, upErr); continue; }
    // Store a DURABLE reference; viewers mint a fresh signed URL at open time.
    const { error: docErr } = await admin.from("job_documents").insert({
      job_id: jobId,
      label: u.label,
      document_type: "po_source",
      source: "email_po",
      file_name: u.label,
      file_url: `storage://po-intake/${u.path}`,
      org_id: orgId,
    } as any);
    if (docErr) console.error("job_documents insert failed", u.path, docErr);
    else uploadedCount++;
  }

  console.log("[inbound-po-email] outcome", {
    from: email.from,
    subject: email.subject,
    attachment_count: email.attachments.length,
    outcome: idempotentReuse ? "attached_to_existing_draft" : "created_pending_draft",
    reference_number: createdJobRef,
    org_id: orgId,
    customer: customerName ?? null,
    po_number: poNum || null,
    needs_review_no_po: needsReviewNoPo,
    uploaded_documents: uploadedCount,
  });
  return json(200, {
    ok: true,
    job_id: jobId,
    reference_number: createdJobRef,
    uploaded: uploadedCount,
    idempotent_reuse: idempotentReuse,
  });
});
