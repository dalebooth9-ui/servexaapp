// Supabase Edge Function: po-intake
//
// Public endpoint that accepts a JSON POST (e.g. from Zapier) describing a
// purchase order received by email, and creates a draft job with
// status='pending_review' so the office coordinator can approve it.
//
// Auth: shared secret in the `x-intake-secret` header, matched against the
// Supabase secret `PO_INTAKE_SECRET`. Requests without the correct secret
// receive 404 (invisible to probes).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-intake-secret",
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

  const expected = Deno.env.get("PO_INTAKE_SECRET");
  if (!expected) {
    console.error("PO_INTAKE_SECRET not configured");
    return json(500, { error: "Server not configured" });
  }
  if (req.headers.get("x-intake-secret") !== expected) {
    return json(404, { error: "Not found" });
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ---------- Resolve customer (case-insensitive fuzzy match) ----------
  let customerId: string | null = null;
  let resolvedCustomerName: string | null =
    (customer_name || "").trim() || null;

  if (resolvedCustomerName) {
    // Exact case-insensitive match first
    const exact = await admin
      .from("customers")
      .select("id, name")
      .ilike("name", resolvedCustomerName)
      .limit(1)
      .maybeSingle();

    if (exact.data) {
      customerId = exact.data.id;
      resolvedCustomerName = exact.data.name;
    } else {
      // Fuzzy match via trigram similarity RPC already in this project
      const { data: fuzzy } = await admin.rpc("find_similar_customer", {
        _name: resolvedCustomerName,
        _threshold: 0.6,
      });
      const first = Array.isArray(fuzzy) ? fuzzy[0] : fuzzy;
      if (first?.id) {
        customerId = first.id;
        resolvedCustomerName = first.name;
      }
    }
  }

  // ---------- Pick the org (single-tenant deployment today) ----------
  const { data: org } = await admin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const orgId = org?.id ?? null;

  // ---------- Compose the job row ----------
  const name = (job_description || email_subject || po_number || "Email PO").slice(0, 200);
  const validPriority = ["high", "medium", "low"].includes((priority || "").toLowerCase())
    ? (priority as string).toLowerCase()
    : "medium";
  const validDueDate =
    due_date && /^\d{4}-\d{2}-\d{2}$/.test(due_date) ? due_date : null;

  const briefParts: string[] = [];
  if (email_subject) briefParts.push(`Subject: ${email_subject}`);
  if (sender_email) briefParts.push(`From: ${sender_email}`);
  if (email_body) briefParts.push(`\n${email_body}`);
  const brief = briefParts.join("\n").trim() || null;

  const jobInsert: Record<string, unknown> = {
    name,
    customer: resolvedCustomerName,
    customer_id: customerId,
    address: (site_address || "").trim() || null,
    priority: validPriority,
    category: "general",
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

  console.log("po-intake created job", {
    job_id: job.id,
    reference_number: job.reference_number,
    matched_customer_id: customerId,
  });

  return json(200, {
    ok: true,
    job_id: job.id,
    reference_number: job.reference_number,
    matched_customer_id: customerId,
    matched_customer_name: resolvedCustomerName,
  });
});
