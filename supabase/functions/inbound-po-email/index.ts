// Supabase Edge Function: inbound-po-email
//
// Receives inbound emails from Resend Inbound (or any provider that posts
// Svix-signed webhooks with the same payload shape) addressed to
//   po-<orgslug>-<4chars>@intake.servexaapp.com
//
// Flow:
//   1. Verify Svix signature using RESEND_INBOUND_WEBHOOK_SECRET.
//   2. Enforce 25 MB payload cap.
//   3. Resolve the target org from the recipient address (+ rate-limit).
//   4. Extract PO fields from subject/body with Lovable AI.
//   5. Create a pending_review job (source='email_po') scoped to that org,
//      fuzzy-matching the customer within the org.
//   6. Store the raw .eml and every attachment in the `po-intake` bucket and
//      register them as job_documents against the new job.
//
// Unknown recipients and rate-limited addresses return 200 OK silently — the
// provider must not retry, and we don't want to leak which addresses exist.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB per file

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
// Docs: https://docs.svix.com/receiving/verifying-payloads/how-manual
// Signature header format: "v1,<base64sig> v1,<base64sig>"
// Signed content: `${msgId}.${timestamp}.${rawBody}` (HMAC-SHA256)
// The signing secret from Resend is prefixed with "whsec_" — the bytes after
// that prefix are base64-encoded and are the actual HMAC key.
// ────────────────────────────────────────────────────────────────────────────
async function verifySvix(
  secret: string,
  msgId: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  if (!msgId || !timestamp || !signatureHeader) return false;

  // Reject stale timestamps (>5 min drift)
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  } catch {
    // Not base64 — fall back to raw utf-8 bytes so misconfigured secrets still
    // produce a deterministic (failing) comparison rather than crashing.
    keyBytes = new TextEncoder().encode(rawSecret);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const toSign = new TextEncoder().encode(`${msgId}.${timestamp}.${body}`);
  const sig = await crypto.subtle.sign("HMAC", key, toSign);
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // The header may contain multiple space-separated versioned signatures.
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
// Payload / API fetch
//
// IMPORTANT: Resend's `email.received` webhook contains METADATA ONLY —
// no body, no attachment content. We must call:
//   GET https://api.resend.com/emails/receiving/{email_id}
//   GET https://api.resend.com/emails/receiving/{email_id}/attachments
//   GET <attachment.download_url>   (returns raw bytes)
// using RESEND_API_KEY to fetch the actual content.
// ────────────────────────────────────────────────────────────────────────────
interface Attachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}
interface InboundEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  rawEmlBase64: string | null;
  attachments: Attachment[];
}

function extractEmailId(payload: any): string | null {
  const d = payload?.data ?? payload;
  return (
    d?.email_id ?? d?.id ?? d?.emailId ?? payload?.email_id ?? payload?.id ?? null
  );
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

async function resendGet(path: string, apiKey: string): Promise<any> {
  const r = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Resend GET ${path} → ${r.status}: ${t}`);
  }
  return r.json();
}

async function fetchInboundEmail(
  emailId: string,
  resendKey: string,
  payload: any,
): Promise<InboundEmail> {
  // 1. Fetch the email itself (subject, from, to, text, html, headers)
  let msg: any = {};
  try {
    msg = await resendGet(`/emails/receiving/${emailId}`, resendKey);
  } catch (e) {
    console.error("fetchInboundEmail: email fetch failed, falling back to webhook payload", e);
    msg = payload?.data ?? payload ?? {};
  }

  // 2. List attachments
  let attList: any[] = [];
  try {
    const res = await resendGet(`/emails/receiving/${emailId}/attachments`, resendKey);
    attList = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  } catch (e) {
    console.error("fetchInboundEmail: attachments list failed", e);
  }

  // 3. Download each attachment via its download_url
  const attachments: Attachment[] = [];
  for (const a of attList) {
    const url: string | undefined = a?.download_url ?? a?.url;
    const filename = String(a?.filename ?? a?.name ?? "attachment.bin");
    const contentType = String(a?.content_type ?? a?.contentType ?? "application/octet-stream");
    if (!url) continue;
    try {
      // Some Resend download URLs are pre-signed (no auth needed). Send the
      // bearer anyway — it's harmless if the URL already carries a signature.
      const r = await fetch(url, { headers: { Authorization: `Bearer ${resendKey}` } });
      if (!r.ok) {
        console.error("attachment download failed", filename, r.status);
        continue;
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
        console.warn("skipping oversized attachment", filename, buf.byteLength);
        continue;
      }
      attachments.push({ filename, contentType, bytes: buf });
    } catch (e) {
      console.error("attachment download error", filename, e);
    }
  }

  const d = payload?.data ?? payload ?? {};
  return {
    from: String(msg?.from?.email ?? msg?.from ?? d?.from?.email ?? d?.from ?? "").trim(),
    to: normaliseRecipients({ to: msg?.to ?? d?.to }),
    subject: String(msg?.subject ?? d?.subject ?? "").trim(),
    text: String(msg?.text ?? msg?.plain ?? d?.text ?? ""),
    html: String(msg?.html ?? d?.html ?? ""),
    rawEmlBase64: msg?.raw ?? msg?.raw_email ?? d?.raw ?? null,
    attachments,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// AI extraction — accepts email text AND PDF/image attachments (Gemini reads
// PDFs directly via data URL, same as parse-po-document / receive-po-email).
// ────────────────────────────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `You extract purchase order details from an inbound email and its attachments.
The attachment (if a PDF or image is provided) is the PRIMARY source — the PO details usually live there. The email subject/body is secondary context.
Return a SINGLE JSON object with exactly these fields (use "" or null when unknown):
- customer_name: the company that sent the PO. Check the letterhead, "From"/"Bill To"/"Client" on the PDF, the signature block, and the sender domain. Copy short abbreviations verbatim.
- site_address: the site / delivery / work address
- po_number: purchase order reference (look for "PO", "PO#", "Order No", "Ref")
- job_description: full description of the work or goods ordered — as much detail as possible
- due_date: required completion date in YYYY-MM-DD, or ""
- priority: "high", "medium" or "low" (default "medium")
Return ONLY the JSON object, no markdown, no explanation.`;

interface Extracted {
  customer_name?: string;
  site_address?: string;
  po_number?: string;
  job_description?: string;
  due_date?: string;
  priority?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function extractPO(email: InboundEmail, apiKey: string): Promise<Extracted> {
  const userText = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    "",
    email.text || stripHtml(email.html) || "(no body)",
  ].join("\n").slice(0, 20000);

  const content: any[] = [{ type: "text", text: userText }];

  // Attach the first PDF or image attachment (Gemini reads PDFs via image_url data URL).
  const primary = email.attachments.find((a) =>
    a.contentType.toLowerCase() === "application/pdf" ||
    /\.pdf$/i.test(a.filename) ||
    a.contentType.toLowerCase().startsWith("image/")
  );
  if (primary) {
    const mime = primary.contentType.toLowerCase().startsWith("image/")
      ? primary.contentType
      : "application/pdf";
    const b64 = bytesToBase64(primary.bytes);
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${b64}` },
    });
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: primary ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
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

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<script[\s\S]*?<\/script>/gi, "")
             .replace(/<[^>]+>/g, " ")
             .replace(/\s+/g, " ")
             .trim();
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Size guard — read body as text so we can verify the signature over the
  // exact bytes the provider signed.
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    console.warn("Rejecting oversized payload", contentLength);
    return json(413, { error: "Payload too large" });
  }

  const bodyText = await req.text();
  if (bodyText.length > MAX_BODY_BYTES) {
    return json(413, { error: "Payload too large" });
  }

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

  // Resolve intake address from the webhook payload BEFORE fetching the full
  // email — the webhook always includes recipients, and we don't want to hit
  // Resend's API for mail addressed to unknown intake addresses.
  const preRecipients = normaliseRecipients(payload?.data ?? payload ?? {});
  const intakeAddr = extractIntakeAddress(preRecipients);
  if (!intakeAddr) {
    console.log("No intake address in recipients", preRecipients);
    return okSilently();
  }

  const emailId = extractEmailId(payload);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!emailId || !resendKey) {
    console.error("Missing email_id or RESEND_API_KEY — cannot fetch full email", { emailId, hasKey: !!resendKey });
    return json(500, { error: "Server not configured" });
  }

  // Fetch full email + attachments from Resend API (webhook is metadata-only).
  const email = await fetchInboundEmail(emailId, resendKey, payload);
  console.log("Fetched inbound email", {
    emailId,
    from: email.from,
    subject: email.subject,
    attachmentCount: email.attachments.length,
    attachmentNames: email.attachments.map((a) => `${a.filename} (${a.bytes.byteLength}b, ${a.contentType})`),
  });


  // Admin client
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve org + rate-limit
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

  // AI extraction (best-effort — job is still created even if empty)
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const extracted: Extracted = apiKey ? await extractPO(email, apiKey) : {};

  // Fuzzy customer match within this org only
  let customerId: string | null = null;
  let customerName: string | null = (extracted.customer_name || "").trim() || null;
  if (customerName) {
    const { data: match } = await admin
      .from("customers")
      .select("id, name")
      .eq("org_id", orgId)
      .ilike("name", customerName)
      .limit(1)
      .maybeSingle();
    if (match) {
      customerId = match.id;
      customerName = match.name;
    } else {
      const { data: newCust } = await admin
        .from("customers")
        .insert({ name: customerName, org_id: orgId } as any)
        .select("id, name")
        .single();
      if (newCust) { customerId = newCust.id; customerName = newCust.name; }
    }
  }

  const priority = ["high", "medium", "low"].includes(extracted.priority ?? "") ? extracted.priority! : "medium";
  const jobName = (extracted.job_description || extracted.po_number || email.subject || "Email PO").slice(0, 200);

  const briefParts: string[] = [];
  briefParts.push(`From: ${email.from}`);
  briefParts.push(`Subject: ${email.subject}`);
  briefParts.push("");
  if (extracted.job_description) briefParts.push(extracted.job_description);
  const bodyText2 = email.text || stripHtml(email.html);
  if (bodyText2) briefParts.push("", "--- Original email ---", bodyText2.slice(0, 4000));

  const jobInsert: Record<string, unknown> = {
    name: jobName,
    org_id: orgId,
    customer_id: customerId,
    customer: customerName,
    address: (extracted.site_address || "").trim() || null,
    priority,
    category: "general",
    due_date: extracted.due_date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.due_date) ? extracted.due_date : null,
    status: "pending_review",
    source: "email_po",
    brief: briefParts.join("\n").trim() || null,
  };

  let jobId: string;
  let jobRef: string;
  {
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
    jobRef = newJob.reference_number;
  }

  // ── Store raw .eml + attachments in po-intake bucket ────────────────────
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
  }
  for (const a of email.attachments) {
    try {
      const bytes = b64ToBytes(a.contentBase64);
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) { console.warn("Skipping large attachment", a.filename); continue; }
      const safe = a.filename.replace(/[^\w.\-]/g, "_").slice(0, 120) || "attachment.bin";
      uploads.push({
        path: `${orgId}/${jobId}/${Date.now()}-${safe}`,
        label: a.filename,
        contentType: a.contentType || "application/octet-stream",
        bytes,
      });
    } catch (e) { console.error("attachment decode failed", a.filename, e); }
  }

  for (const u of uploads) {
    const { error: upErr } = await admin.storage.from("po-intake").upload(u.path, u.bytes, {
      contentType: u.contentType,
      upsert: false,
    });
    if (upErr) { console.error("upload failed", u.path, upErr); continue; }
    const { data: signed } = await admin.storage.from("po-intake").createSignedUrl(u.path, 60 * 60 * 24 * 30);
    await admin.from("job_documents").insert({
      job_id: jobId,
      label: u.label,
      document_type: "po_source",
      source: "email_po",
      file_name: u.label,
      file_url: signed?.signedUrl ?? u.path,
    } as any);
  }

  console.log("Created pending job", jobRef, "for org", orgId, "from", email.from);
  return json(200, { ok: true, job_id: jobId, reference_number: jobRef });
});
