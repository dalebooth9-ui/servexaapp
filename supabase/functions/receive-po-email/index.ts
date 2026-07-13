// Supabase Edge Function: receive-po-email
//
// Accepts an inbound email payload from Make.com (or similar), extracts the
// purchase order from the PDF attachment, and creates a draft job in Servexa.
//
// Auth model:
//   - Make.com sends a shared secret in the `x-po-intake-secret` header.
//   - The secret is stored as the Supabase secret `PO_INTAKE_SECRET`.
//   - Internally we use the service_role key — there's no end-user JWT.
//
// Expected request body (JSON):
//   {
//     "file_base64": "<PDF as base64, no data: prefix>",
//     "file_name": "PurchaseOrder-3198.pdf",
//     "email_from": "sales@argosfire.co.uk",        // optional
//     "email_subject": "Purchase Order PO-3198",    // optional
//     "email_received_at": "2026-05-28T09:14:00Z"   // optional, ISO 8601
//   }
//
// Result on success:
//   { ok: true, job_id, reference_number, extracted: {...} }
//
// The created job lands with status='pending_review' and source='email-intake'
// so Michelle can confirm before it goes live.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-po-intake-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Same extraction prompt as parse-po-document — kept verbatim so the two
// pathways produce identical structured data.
const EXTRACTION_SYSTEM_PROMPT = `You extract purchase order details from documents. Return a SINGLE JSON object (not an array) with these exact fields:
- customer_name: the name of the client / company who issued or sent the order. Look everywhere: letterhead, "From", "Bill To", "Client", "Company", "Ordered By", "Issued To", "Raised By". Even short abbreviations like "ABCA" or initials are valid company names — copy them exactly as written.
- contact_name: contact person name if present, else ""
- address: the site/delivery/work address (look for "Deliver To", "Site Address", "Work Location", "Ship To", NOT the issuing company address)
- po_number: purchase order number or reference number (look for "PO#", "PO Number", "Order No", "Reference", "Ref No")
- job_description: full description of the work or goods ordered — include as much detail as possible
- quantity: total quantity ordered as a number (look for "Qty", "Quantity", "Units", "No. of", default 1 if only one item and no quantity stated)
- pressure_test_qty: number of items requiring pressure testing (look for "pressure test", "hydraulic test", "wet test"). Default 0 if none mentioned.
- visual_qty: number of items requiring visual inspection only (look for "visual", "visual inspection", "visual check"). Default 0 if none mentioned.
- other_qty: number of items for any other service type (anything not pressure test or visual). If the document only states a single overall quantity with no breakdown, put it here.
- other_service_type: short label describing the "other" service when other_qty > 0 (e.g. "Installation", "Repair", "Survey"), else ""
- due_date: required completion or delivery date in YYYY-MM-DD format, or "" if not found
- priority: "high", "medium", or "low" based on urgency language such as "urgent", "ASAP", "priority" (default "medium")
- total_value: numeric value of the PO if present (strip currency symbols), else null
- currency: currency code (e.g. "GBP", "USD", "EUR") detected from symbols £/$€ or explicit text, else ""
- notes: any other important instructions, special requirements, or notes

Rules:
- Extract ALL available information — do not leave fields empty if the information exists anywhere in the document
- Company/customer names can be abbreviations, acronyms, or short codes — always copy them verbatim
- Return ONLY the JSON object, no markdown, no explanation
- If a field is truly not found, use empty string "" or null for numeric fields, or 0 for quantity fields`;

interface ExtractedPO {
  customer_name?: string;
  contact_name?: string;
  address?: string;
  po_number?: string;
  job_description?: string;
  quantity?: number | null;
  pressure_test_qty?: number | null;
  visual_qty?: number | null;
  other_qty?: number | null;
  other_service_type?: string;
  due_date?: string;
  priority?: string;
  total_value?: number | null;
  currency?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    // ---------- Auth: shared secret + explicit target org ----------
    // Same rule as po-intake: never fall back to "first org in the table".
    // The caller must be attributable to a specific org via the
    // PO_INTAKE_DEFAULT_ORG_ID env var (set to the org whose Make.com pipe
    // points at this endpoint). If it's not set, refuse.
    const expectedSecret = Deno.env.get("PO_INTAKE_SECRET");
    const defaultOrgId = Deno.env.get("PO_INTAKE_DEFAULT_ORG_ID");
    if (!expectedSecret || !defaultOrgId) {
      console.error("PO_INTAKE_SECRET or PO_INTAKE_DEFAULT_ORG_ID not configured");
      return json(404, { error: "Not found" });
    }
    const providedSecret = req.headers.get("x-po-intake-secret");
    if (providedSecret !== expectedSecret) {
      // Note: returning 404 rather than 401 makes the endpoint look invisible
      // to anyone probing without the secret.
      return json(404, { error: "Not found" });
    }
    const orgId = defaultOrgId;

    // ---------- Parse body ----------
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const {
      file_base64,
      file_name,
      email_from,
      email_subject,
      email_received_at,
    } = payload || {};

    if (!file_base64 || typeof file_base64 !== "string") {
      return json(400, { error: "file_base64 is required" });
    }
    if (!file_name || typeof file_name !== "string") {
      return json(400, { error: "file_name is required" });
    }

    // ---------- Supabase admin client ----------
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---------- AI extraction ----------
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json(500, { error: "LOVABLE_API_KEY not configured" });
    }

    const ext = file_name.slice(file_name.lastIndexOf(".")).toLowerCase();
    let userContent: any[];

    if (ext === ".pdf") {
      userContent = [
        {
          type: "text",
          text: `Extract purchase order / job details from this document (${file_name}). Return as a single JSON object with these exact fields.`,
        },
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${file_base64}` },
        },
      ];
    } else {
      // For non-PDF, fall through with text-only. Make.com should preferably
      // send PDFs since that's the format customers actually use.
      userContent = [
        {
          type: "text",
          text: `Extract purchase order / job details from this document. The file is ${file_name} which is not a PDF; the system cannot read it directly. Treat email subject and body as the only signal. Email subject: "${email_subject || ""}". Return as a single JSON object with the listed fields, leaving any unknown ones as "".`,
        },
      ];
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return json(429, { error: "Rate limited — please retry" });
      }
      if (aiResponse.status === 402) {
        return json(402, { error: "AI credits exhausted" });
      }
      return json(502, { error: "AI extraction failed" });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();

    let extracted: ExtractedPO;
    try {
      const parsed = JSON.parse(cleaned);
      extracted = Array.isArray(parsed) ? (parsed[0] || {}) : parsed;
    } catch {
      console.error("AI returned non-JSON:", content);
      return json(422, { error: "Could not parse extracted data" });
    }

    // ---------- Resolve customer ----------
    let customerId: string | null = null;
    let customerName: string | null = (extracted.customer_name || "").trim() || null;

    if (customerName) {
      const { data: matched } = await admin
        .from("customers")
        .select("id, name")
        .eq("org_id", orgId)
        .ilike("name", customerName)
        .limit(1)
        .maybeSingle();

      if (matched) {
        customerId = matched.id;
        customerName = matched.name;
      } else {
        const { data: newCust, error: custErr } = await admin
          .from("customers")
          .insert({ name: customerName, org_id: orgId } as any)
          .select("id, name")
          .single();
        if (custErr) {
          console.error("Failed to create customer:", custErr);
        } else if (newCust) {
          customerId = newCust.id;
          customerName = newCust.name;
        }
      }
    }

    // ---------- Build job payload ----------
    const safeName = (extracted.job_description || extracted.po_number || file_name.replace(/\.[^.]+$/, "")).slice(0, 200);
    const priority = ["high", "medium", "low"].includes(extracted.priority || "") ? extracted.priority : "medium";

    // Notes get an email-context prefix so Michelle can see where the job came from
    const noteParts: string[] = [];
    if (email_from) noteParts.push(`From: ${email_from}`);
    if (email_subject) noteParts.push(`Subject: ${email_subject}`);
    if (email_received_at) noteParts.push(`Received: ${email_received_at}`);
    if (extracted.notes) noteParts.push(`PO notes: ${extracted.notes}`);
    if (extracted.total_value != null) {
      noteParts.push(`Value: ${extracted.currency || ""}${extracted.total_value}`);
    }

    // Quantity breakdown — mirror PoImportDialog.handleCreate so manual and
    // email-intake paths produce identically-populated jobs.
    const ptQty = Number(extracted.pressure_test_qty) > 0 ? Number(extracted.pressure_test_qty) : 0;
    const vQty = Number(extracted.visual_qty) > 0 ? Number(extracted.visual_qty) : 0;
    let oQty = Number(extracted.other_qty) > 0 ? Number(extracted.other_qty) : 0;
    // Fallback: if AI didn't break the quantity down, treat the overall quantity
    // as "other" (same convention PoImportDialog uses).
    if (ptQty === 0 && vQty === 0 && oQty === 0 && Number(extracted.quantity) > 0) {
      oQty = Number(extracted.quantity);
    }

    // Build an AI brief from the description + notes so the job has the same
    // contextual field the manual flow eventually populates.
    const briefParts: string[] = [];
    if (extracted.job_description) briefParts.push(extracted.job_description);
    if (extracted.notes) briefParts.push(`Notes: ${extracted.notes}`);
    if (extracted.total_value != null) {
      briefParts.push(`Value: ${extracted.currency || ""}${extracted.total_value}`);
    }
    const brief = briefParts.join("\n\n").trim() || null;

    const jobInsert: Record<string, unknown> = {
      name: safeName,
      customer_id: customerId,
      customer: customerName,
      address: (extracted.address || "").trim() || null,
      priority,
      category: "general",
      due_date: extracted.due_date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.due_date) ? extracted.due_date : null,
      status: "pending_review",
      source: "email-intake",
      pressure_test_qty: ptQty,
      visual_qty: vQty,
      other_qty: oQty,
      other_service_type: (extracted.other_service_type || "").trim() || null,
      brief,
    };
    if (extracted.po_number) {
      jobInsert.reference_number = extracted.po_number.trim();
    }

    const { data: newJob, error: jobErr } = await admin
      .from("jobs")
      .insert(jobInsert as any)
      .select("id, reference_number")
      .single();

    if (jobErr || !newJob) {
      // Duplicate reference_number is the most likely failure — retry without it
      // and let the DB generate a fresh one.
      if (jobErr?.code === "23505" && jobInsert.reference_number) {
        delete jobInsert.reference_number;
        const retry = await admin
          .from("jobs")
          .insert(jobInsert as any)
          .select("id, reference_number")
          .single();
        if (retry.error || !retry.data) {
          console.error("Job insert retry failed:", retry.error);
          return json(500, { error: "Could not create job" });
        }
        return await uploadAndRespond(retry.data, admin, file_base64, file_name, extracted, noteParts);
      }
      console.error("Job insert failed:", jobErr);
      return json(500, { error: "Could not create job" });
    }

    return await uploadAndRespond(newJob, admin, file_base64, file_name, extracted, noteParts);
  } catch (err) {
    console.error("Unhandled error:", err);
    return json(500, { error: String(err?.message || err) });
  }
});

async function uploadAndRespond(
  job: { id: string; reference_number: string },
  admin: ReturnType<typeof createClient>,
  fileB64: string,
  fileName: string,
  extracted: ExtractedPO,
  noteParts: string[],
) {
  // Upload the original PDF as a submission so it's permanently attached.
  try {
    const bytes = Uint8Array.from(atob(fileB64), (c) => c.charCodeAt(0));
    const path = `${job.id}/${Date.now()}-${fileName.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await admin.storage
      .from("submissions")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (!upErr) {
      const { data: urlData } = admin.storage.from("submissions").getPublicUrl(path);
      await admin.from("submissions").insert({
        job_id: job.id,
        type: "document",
        file_url: urlData.publicUrl,
        file_name: fileName,
      } as any);
    } else {
      console.error("Storage upload failed:", upErr);
    }
  } catch (e) {
    console.error("Attachment handling failed:", e);
  }

  // Add a job message with the email context so Michelle sees it in the timeline.
  if (noteParts.length > 0) {
    try {
      await admin.from("job_messages").insert({
        job_id: job.id,
        message: ["Auto-created from email PO intake:", ...noteParts].join("\n"),
        author_role: "system",
      } as any);
    } catch (e) {
      // job_messages might require specific columns we don't have — non-fatal.
      console.error("Job message insert failed (non-fatal):", e);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      job_id: job.id,
      reference_number: job.reference_number,
      extracted,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
