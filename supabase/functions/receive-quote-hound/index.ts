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

    // Validate the shared webhook secret sent by Quote Hound
    const incomingSecret = req.headers.get("x-quotehound-secret");
    const expectedSecret = Deno.env.get("QUOTEHOUND_WEBHOOK_SECRET");

    if (!expectedSecret) {
      console.error("QUOTEHOUND_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!incomingSecret || incomingSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { quote, action } = body;

    if (!quote) {
      return new Response(
        JSON.stringify({ error: "Missing quote payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Upsert customer ────────────────────────────────────────────────────
    let customerId: string | null = null;

    if (quote.clientName) {
      // Try to find existing customer by name (case-insensitive)
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name")
        .ilike("name", quote.clientName.trim())
        .limit(1);

      if (existingCustomers && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
      } else {
        // Create new customer
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: quote.clientName.trim(),
            email: quote.contactEmail || null,
            phone: quote.contactPhone || null,
            address: quote.jobAddress || null,
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

    // ── 2. Create job ─────────────────────────────────────────────────────────
    const jobName = quote.jobType
      ? `${quote.jobType}${quote.clientName ? ` — ${quote.clientName}` : ""}`
      : `Quote Hound Import — ${quote.quoteNumber ?? "Unknown"}`;

    const refNum = quote.quoteNumber
      ? `QH-${quote.quoteNumber}`
      : `QH-${Date.now()}`;

    // Check for duplicate (idempotent push)
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

    const { data: newJob, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        reference_number: refNum,
        name: jobName,
        customer: quote.clientName || null,
        address: quote.jobAddress || null,
        priority: "medium",
        category: quote.jobType || "general",
        // Store source metadata in notes
        notes: [
          `Imported from Quote Hound`,
          quote.quoteNumber ? `Quote #: ${quote.quoteNumber}` : null,
          quote.contactName ? `Contact: ${quote.contactName}` : null,
          quote.contactEmail ? `Email: ${quote.contactEmail}` : null,
          quote.contactPhone ? `Phone: ${quote.contactPhone}` : null,
          quote.value ? `Quote Value: £${Number(quote.value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : null,
          quote.notes ? `Notes: ${quote.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
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

    // ── 3. Log activity ───────────────────────────────────────────────────────
    await supabase.from("job_activity_log").insert({
      job_id: newJob.id,
      action: "quote_hound_import",
      details: `Job created from Quote Hound (quote #${quote.quoteNumber ?? "N/A"}, action: ${action ?? "push"})`,
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
