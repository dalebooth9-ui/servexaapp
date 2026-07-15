// Supabase Edge Function: po-intake
//
// Public endpoint that accepts a JSON POST (e.g. from Zapier) describing a
// purchase order received by email, and creates a draft job with
// status='pending_review' so the office coordinator can approve it.
//
// Auth model (org-scoped):
//   - Every request MUST identify the target organisation, either by:
//       (a) `x-org-id` header + `x-intake-secret` matching that org's
//           per-org secret stored in `public.org_intake_secrets`, OR
//       (b) `x-intake-secret` matching the legacy global `PO_INTAKE_SECRET`
//           env var — in which case the org is taken from the
//           `PO_INTAKE_DEFAULT_ORG_ID` env var. This exists only for Viva's
//           existing Zap and is intentionally a single-org fallback.
//   - Requests that can't be attributed to a specific org return 404.
//   - We NEVER fall back to "the first organisation in the table" — that
//     would silently write another subscriber's Zapier PO into Viva.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { inferJobScope } from "../_shared/inferJobScope.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-intake-secret, x-org-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface IntakePayload {
  customer_name?: string;
  site_address?: string;
  po_number?: string;
  job_description?: string;
  due_date?: string;
  priority?: string;
  sender_email?: string;
  email_subject?: string;
  email_body?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Auth & org resolution happen together — the request MUST prove which
  // org it's writing into before we touch the DB. Split into two paths:
  //   1. Per-org secret (x-org-id + x-intake-secret matched against
  //      org_intake_secrets). This is the path new subscribers use.
  //   2. Legacy global PO_INTAKE_SECRET + PO_INTAKE_DEFAULT_ORG_ID env vars.
  //      Preserves Viva's existing Zap. If either env is missing we do NOT
  //      fall through to "first org"; we return 404.
  const providedSecret = req.headers.get("x-intake-secret") ?? "";
  const providedOrgId = (req.headers.get("x-org-id") ?? "").trim();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let orgId: string | null = null;

  if (providedOrgId) {
    // Path (1): per-org secret lookup. Uses `verify_org_intake_secret` RPC
    // which does a constant-time compare against the hashed secret so we
    // never leak whether the org exists.
    if (!providedSecret) {
      return json(404, { error: "Not found" });
    }
    const { data: verified, error: verErr } = await admin.rpc("verify_org_intake_secret", {
      _org_id: providedOrgId,
      _secret: providedSecret,
    });
    if (verErr) {
      console.error("verify_org_intake_secret failed", verErr);
      return json(500, { error: "Auth check failed" });
    }
    if (verified === true) {
      orgId = providedOrgId;
    } else {
      console.warn("po-intake per-org secret mismatch", { providedOrgId });
      return json(404, { error: "Not found" });
    }
  } else {
    // Path (2): legacy global secret + explicit default-org env var.
    const legacySecret = Deno.env.get("PO_INTAKE_SECRET");
    const legacyOrgId = Deno.env.get("PO_INTAKE_DEFAULT_ORG_ID");
    if (!legacySecret || !legacyOrgId) {
      // Never fall through to a table lookup — that's how you attribute
      // subscriber A's PO to subscriber B.
      return json(404, { error: "Not found" });
    }
    if (providedSecret !== legacySecret) {
      return json(404, { error: "Not found" });
    }
    // Guard: make sure the configured default actually exists.
    const { data: orgRow } = await admin
      .from("organisations")
      .select("id")
      .eq("id", legacyOrgId)
      .maybeSingle();
    if (!orgRow) {
      console.error("PO_INTAKE_DEFAULT_ORG_ID points at a non-existent org", { legacyOrgId });
      return json(500, { error: "Server misconfigured" });
    }
    orgId = orgRow.id;
  }

  let body: IntakePayload;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const {
    customer_name = "",
    site_address = "",
    po_number = "",
    job_description = "",
    due_date,
    priority,
    sender_email,
    email_subject = "",
    email_body = "",
  } = body || {};

  // NOTE: the `admin` client and `orgId` were resolved above during auth.
  // Do NOT re-derive org from any other source below this line.


  // ---------- Resolve customer within THIS org ----------
  let customerId: string | null = null;
  let resolvedCustomerName: string | null =
    (customer_name || "").trim() || null;

  if (resolvedCustomerName) {
    // Exact case-insensitive match, scoped to the caller's org so we can't
    // accidentally link to another subscriber's customer of the same name.
    const exact = await admin
      .from("customers")
      .select("id, name")
      .eq("org_id", orgId)
      .ilike("name", resolvedCustomerName)
      .limit(1)
      .maybeSingle();

    if (exact.data) {
      customerId = exact.data.id;
      resolvedCustomerName = exact.data.name;
    }
    // NOTE: `find_similar_customer` isn't org-scoped, so we deliberately
    // skip it here; a same-name fuzzy match across orgs would leak a
    // customer_id into the wrong org. The approver can pick / create the
    // right customer when reviewing the pending job.
  }

  // ---------- Compose the job row ----------
  const name = (job_description || email_subject || po_number || "Email PO").slice(0, 200);
  const validPriority = ["high", "medium", "low"].includes((priority || "").toLowerCase())
    ? (priority as string).toLowerCase()
    : "medium";
  const validDueDate =
    due_date && /^\d{4}-\d{2}-\d{2}$/.test(due_date) ? due_date : null;

  // ---------- Infer scope from wording so pending job never lands empty ----
  const inferred = inferJobScope({
    description: job_description,
    subject: email_subject,
    body: email_body,
  });

  const briefParts: string[] = [];
  if (email_subject) briefParts.push(`Subject: ${email_subject}`);
  if (sender_email) briefParts.push(`From: ${sender_email}`);
  if (email_body) briefParts.push(`\n${email_body}`);
  if (inferred.reasons.length) {
    briefParts.push("", "--- Auto-detected scope ---");
    for (const r of inferred.reasons) briefParts.push(`• ${r}`);
    if (inferred.templateNames.length) {
      briefParts.push(`Templates pre-attached: ${inferred.templateNames.join(", ")}`);
    }
  }
  const brief = briefParts.join("\n").trim() || null;

  const jobInsert: Record<string, unknown> = {
    name,
    customer: resolvedCustomerName,
    customer_id: customerId,
    address: (site_address || "").trim() || null,
    priority: validPriority,
    category: inferred.categorySlug || "general",
    status: "pending_review",
    source: "email_po",
    brief,
    due_date: validDueDate,
    org_id: orgId,
  };
  if (po_number?.trim()) jobInsert.reference_number = po_number.trim();


  const attempt = async (payload: Record<string, unknown>) =>
    admin.from("jobs").insert(payload as any).select("id, reference_number").single();

  let { data: job, error } = await attempt(jobInsert);
  // If po_number collides with an existing reference_number, retry without it.
  if (error?.code === "23505" && jobInsert.reference_number) {
    delete jobInsert.reference_number;
    ({ data: job, error } = await attempt(jobInsert));
  }
  if (error || !job) {
    console.error("Job insert failed:", error);
    return json(500, { error: "Could not create job", detail: error?.message });
  }

  // Pre-attach any inferred blank job sheets so the pending job is never empty.
  if (inferred.templateNames.length) {
    try {
      const { data: matched } = await admin
        .from("job_sheet_templates")
        .select("name")
        .eq("status", "published")
        .in("name", inferred.templateNames);
      const rows = (matched || []).map((t: any) => ({
        job_id: job!.id,
        document_type: "blank_job_sheet",
        label: t.name,
        source: "auto",
        org_id: orgId,
      }));
      if (rows.length) {
        const { error: docErr } = await admin.from("job_documents").insert(rows as any);
        if (docErr) console.error("po-intake auto-attach failed", docErr);
      }
    } catch (e) {
      console.error("po-intake auto-attach threw", e);
    }
  }

  console.log("po-intake created job", {
    job_id: job.id,
    reference_number: job.reference_number,
    matched_customer_id: customerId,
    inferred_category: inferred.categorySlug,
    inferred_templates: inferred.templateNames,
  });


  return json(200, {
    ok: true,
    job_id: job.id,
    reference_number: job.reference_number,
    matched_customer_id: customerId,
    matched_customer_name: resolvedCustomerName,
  });
});
