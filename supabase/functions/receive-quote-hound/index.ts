import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-quotehound-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Accept the shared secret via either:
    //  - x-quotehound-secret header (custom webhook approach)
    //  - Authorization: Bearer <secret> (Quote Hound's create-servexa-job approach)
    const expectedSecret = Deno.env.get("QUOTEHOUND_WEBHOOK_SECRET");

    if (!expectedSecret) {
      console.error("QUOTEHOUND_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customHeader = req.headers.get("x-quotehound-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const providedSecret = customHeader ?? bearerToken;

    if (!providedSecret || providedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // Support both formats:
    //   - Quote Hound's create-servexa-job: { reference, client_name, contact_name, ... }
    //   - Generic webhook: { quote: { ... }, action: "..." }
    const quote = body.quote ?? body;
    const action = body.action ?? "push";

    if (!quote) {
      return new Response(
        JSON.stringify({ error: "Missing quote payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalise field names — Quote Hound's payload uses snake_case directly
    const clientName   = quote.client_name   ?? quote.clientName   ?? null;
    const contactEmail = quote.contact_email ?? quote.contactEmail ?? null;
    const contactPhone = quote.contact_phone ?? quote.contactPhone ?? null;
    const contactName  = quote.contact_name  ?? quote.contactName  ?? null;
    const jobAddress   = quote.job_address   ?? quote.jobAddress   ?? null;
    const jobType      = quote.job_type      ?? quote.jobType      ?? null;
    const quoteNumber  = quote.reference     ?? quote.quote_number ?? quote.quoteNumber ?? null;
    const value        = quote.value         ?? null;
    const notes        = quote.description   ?? quote.notes        ?? null;

    // ── 1. Upsert customer ────────────────────────────────────────────────────
    let customerId: string | null = null;

    if (clientName) {
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name")
        .ilike("name", clientName.trim())
        .limit(1);

      if (existingCustomers && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;

        // Update contact details if available
        await supabase
          .from("customers")
          .update({
            ...(contactEmail ? { email: contactEmail } : {}),
            ...(contactPhone ? { phone: contactPhone } : {}),
            ...(jobAddress ? { address: jobAddress } : {}),
          })
          .eq("id", customerId);
      } else {
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: clientName.trim(),
            email: contactEmail || null,
            phone: contactPhone || null,
            address: jobAddress || null,
          })
          .select("id")
          .single();

        if (custErr) {
          console.error("Customer insert error:", custErr);
        } else {
          customerId = newCustomer.id;
        }
      }
    }

    // ── 2. Build ref and check for duplicate ──────────────────────────────────
    const refNum = quoteNumber
      ? (String(quoteNumber).startsWith("QH-") ? quoteNumber : `QH-${quoteNumber}`)
      : `QH-${Date.now()}`;

    const { data: existing } = await supabase
      .from("jobs")
      .select("id, reference_number")
      .eq("reference_number", refNum)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Job already exists (duplicate skipped)",
          jobId: existing.id,
          customerId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Create job ─────────────────────────────────────────────────────────
    const jobName = jobType
      ? `${jobType}${clientName ? ` — ${clientName}` : ""}`
      : `Quote Hound Import — ${quoteNumber ?? "Unknown"}`;

    const { data: newJob, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        reference_number: refNum,
        name: jobName,
        customer: clientName || null,
        address: jobAddress || null,
        priority: "medium",
        category: jobType || "general",
      } as any)
      .select("id")
      .single();

    if (jobErr) {
      console.error("Job insert error:", jobErr);
      return new Response(
        JSON.stringify({ error: jobErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Log activity ───────────────────────────────────────────────────────
    const detailLines = [
      `Imported from Quote Hound (action: ${action})`,
      quoteNumber  ? `Quote #: ${quoteNumber}` : null,
      contactName  ? `Contact: ${contactName}` : null,
      contactEmail ? `Email: ${contactEmail}` : null,
      contactPhone ? `Phone: ${contactPhone}` : null,
      value != null ? `Quote Value: £${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : null,
      notes        ? `Notes: ${notes}` : null,
    ].filter(Boolean).join(" | ");

    await supabase.from("job_activity_log").insert({
      job_id: newJob.id,
      action: "quote_hound_import",
      details: detailLines,
    } as any);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: newJob.id,
        customerId,
        message: `Job ${refNum} created successfully`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("receive-quote-hound error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
