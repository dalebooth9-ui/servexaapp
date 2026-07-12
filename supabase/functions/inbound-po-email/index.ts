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
// Payload normalisation
// Resend inbound event shape (as of 2026):
//   { type: 'email.received', data: { from, to: [], subject, text, html,
//     headers, attachments: [{ filename, contentType, content /* base64 */ }],
//     raw?: string /* base64 .eml */ } }
// Older/other providers may nest slightly differently, so we normalise.
// ────────────────────────────────────────────────────────────────────────────
interface Attachment {
  filename: string;
  contentType: string;
  contentBase64: string;
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

function normalise(payload: any): InboundEmail | null {
  const d = payload?.data ?? payload;
  if (!d) return null;
  const toRaw = d.to ?? d.recipient ?? d.recipients ?? [];
  const toList: string[] = Array.isArray(toRaw)
    ? toRaw.map((x: any) => (typeof x === "string" ? x : x?.email ?? x?.address ?? "")).filter(Boolean)
    : typeof toRaw === "string"
      ? [toRaw]
      : [];
  const attachmentsRaw = Array.isArray(d.attachments) ? d.attachments : [];
  const attachments: Attachment[] = attachmentsRaw.map((a: any) => ({
    filename: String(a.filename ?? a.name ?? "attachment.bin"),
    contentType: String(a.contentType ?? a.content_type ?? "application/octet-stream"),
    contentBase64: String(a.content ?? a.contentBase64 ?? a.base64 ?? ""),
  })).filter((a: Attachment) => a.contentBase64);
  return {
    from: String(d.from?.email ?? d.from ?? d.sender ?? "").trim(),
    to: toList.map((s) => s.toLowerCase().trim()),
    subject: String(d.subject ?? "").trim(),
    text: String(d.text ?? d.plain ?? ""),
    html: String(d.html ?? ""),
    rawEmlBase64: d.raw ?? d.raw_email ?? null,
    attachments,
  };
}

function extractIntakeAddress(recipients: string[]): string | null {
  return recipients.find((r) => /@intake\.servexaapp\.com$/i.test(r)) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// AI extraction
// ────────────────────────────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `You extract purchase order details from an inbound email.
Return a SINGLE JSON object with exactly these fields (use "" or null when unknown):
- customer_name: the company that sent the PO. Check the From address domain, the signature block, and the email body. Copy short abbreviations verbatim.
- site_address: the site or delivery address for the work
- po_number: purchase order reference (look for "PO", "Order No", "Ref")
- job_description: full description of the work or goods ordered
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

async function extractPO(email: InboundEmail, apiKey: string): Promise<Extracted> {
  const userText = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    "",
    email.text || stripHtml(email.html) || "(no body)",
  ].join("\n").slice(0, 20000);

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: userText },
      ],
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    console.error("AI gateway error", resp.status, await resp.text());
    return {};
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
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

  const email = normalise(payload);
  if (!email) return okSilently();

  const intakeAddr = extractIntakeAddress(email.to);
  if (!intakeAddr) {
    console.log("No intake address in recipients", email.to);
    return okSilently();
  }

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
