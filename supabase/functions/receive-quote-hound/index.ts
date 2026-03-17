import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-quotehound-secret",
};

// Known job categories with their slugs — used for AI mapping fallback
const KNOWN_CATEGORIES = [
  { slug: "dry_riser_installation", keywords: ["dry riser install", "installation", "new dry riser", "dr install", "install dry"] },
  { slug: "dry_riser_pressure_test", keywords: ["pressure test", "hydraulic test", "pt ", "full pressure", "dry riser test", "annual test", "dr pt"] },
  { slug: "dry_riser_visual", keywords: ["visual inspection", "visual check", "6 month", "six month", "interim", "dr visual"] },
  { slug: "wet_riser_annual_service", keywords: ["wet riser annual", "wet riser service", "wr annual"] },
  { slug: "wet_riser_visual", keywords: ["wet riser visual", "wr visual"] },
  { slug: "sprinkler_service", keywords: ["sprinkler", "sprinkler annual", "sprinkler service", "sprinkler inspection"] },
  { slug: "fire_hydrant_service", keywords: ["hydrant", "fire hydrant", "hydrant service", "hydrant inspection"] },
  { slug: "fire_extinguishers", keywords: ["extinguisher", "fire extinguisher", "fe ", "ext service"] },
  { slug: "site_survey", keywords: ["survey", "site survey", "site visit", "survey only"] },
];

/**
 * Map job description / type to a category slug using keyword matching,
 * with an optional AI fallback via the Lovable AI proxy.
 */
async function inferCategorySlug(jobType: string | null, description: string | null): Promise<string> {
  const text = `${jobType || ""} ${description || ""}`.toLowerCase();

  // Fast keyword match first
  for (const cat of KNOWN_CATEGORIES) {
    if (cat.keywords.some((kw) => text.includes(kw))) {
      return cat.slug;
    }
  }

  // AI fallback — ask GPT to classify
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey && text.trim().length > 3) {
    try {
      const prompt = `You are a fire protection job classifier. Given this job description, respond with ONLY the most appropriate category slug from this list (no explanation):

dry_riser_installation, dry_riser_pressure_test, dry_riser_visual, wet_riser_annual_service, wet_riser_visual, sprinkler_service, fire_hydrant_service, fire_extinguishers, site_survey

Job description: "${text}"

Respond with only the slug, nothing else.`;

      const aiRes = await fetch("https://api.lovable.app/v1/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-5-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 30,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const slug = aiData?.choices?.[0]?.message?.content?.trim().toLowerCase().replace(/[^a-z_]/g, "");
        if (slug && KNOWN_CATEGORIES.some((c) => c.slug === slug)) {
          console.log(`AI classified category: ${slug}`);
          return slug;
        }
      }
    } catch (e) {
      console.warn("AI category inference failed, using general fallback:", e);
    }
  }

  // If job_type itself matches a slug directly, use it
  if (jobType) {
    const normalized = jobType.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "");
    if (KNOWN_CATEGORIES.some((c) => c.slug === normalized)) return normalized;
  }

  return "general";
}

/**
 * Auto-attach job_documents from category_document_templates and customer paperwork,
 * mirroring what JobDocuments.tsx does on the client side.
 */
async function autoAttachDocuments(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  categorySlug: string,
  customerId: string | null,
  isInstallation: boolean,
): Promise<void> {
  const docsToInsert: any[] = [];

  // ── 1. Category document templates ──────────────────────────────────────────
  if (categorySlug && categorySlug !== "general") {
    const { data: catTemplates } = await supabase
      .from("category_document_templates")
      .select("*")
      .eq("category_slug", categorySlug)
      .eq("enabled", true)
      .order("sort_order");

    if (catTemplates && catTemplates.length > 0) {
      for (const t of catTemplates as any[]) {
        docsToInsert.push({
          job_id: jobId,
          document_type: t.document_type,
          label: t.label,
          file_url: t.document_type === "uploaded_file" ? t.file_url : null,
          file_name: t.document_type === "uploaded_file" ? t.file_name : null,
          source: "auto",
          category_template_id: t.id,
        });
      }
    }
  }

  // ── 2. Pre-start checklist for installation jobs ─────────────────────────────
  if (isInstallation) {
    docsToInsert.push({
      job_id: jobId,
      document_type: "pre_start_checklist",
      label: "Pre-start Check List",
      file_url: null,
      file_name: null,
      source: "auto",
    });
  }

  // ── 3. Customer auto-attach paperwork ────────────────────────────────────────
  if (customerId) {
    const { data: paperwork } = await supabase
      .from("customer_paperwork")
      .select("*")
      .eq("customer_id", customerId)
      .eq("auto_attach", true);

    if (paperwork && paperwork.length > 0) {
      for (const pw of paperwork as any[]) {
        docsToInsert.push({
          job_id: jobId,
          document_type: "customer_paperwork",
          label: pw.label || pw.file_name,
          file_url: pw.file_url,
          file_name: pw.file_name,
          source: "customer_paperwork",
        });
      }
    }
  }

  if (docsToInsert.length > 0) {
    const { error } = await supabase.from("job_documents").insert(docsToInsert as any);
    if (error) console.error("Auto-attach documents error:", error);
    else console.log(`Auto-attached ${docsToInsert.length} document(s) to job ${jobId}`);
  }
}

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

    const quote = body.quote ?? body;
    const action = body.action ?? "push";

    if (!quote) {
      return new Response(
        JSON.stringify({ error: "Missing quote payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalise field names
    const clientName   = quote.client_name   ?? quote.clientName   ?? null;
    const contactEmail = quote.contact_email ?? quote.contactEmail ?? null;
    const contactPhone = quote.contact_phone ?? quote.contactPhone ?? null;
    const contactName  = quote.contact_name  ?? quote.contactName  ?? null;
    const jobAddress   = quote.job_address   ?? quote.jobAddress   ?? null;
    const jobType      = quote.job_type      ?? quote.jobType      ?? null;
    const quoteNumber  = quote.reference     ?? quote.quote_number ?? quote.quoteNumber ?? null;
    const value        = quote.value         ?? null;
    const description  = quote.description   ?? quote.notes        ?? quote.scope_of_work ?? quote.scope ?? null;

    // ── 1. AI-powered category mapping ───────────────────────────────────────
    const categorySlug = await inferCategorySlug(jobType, description);
    const isInstallation = categorySlug === "dry_riser_installation" || categorySlug === "installation";
    console.log(`Mapped to category: ${categorySlug}`);

    // ── 2. Upsert customer ────────────────────────────────────────────────────
    let customerId: string | null = null;

    if (clientName) {
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name")
        .ilike("name", clientName.trim())
        .limit(1);

      if (existingCustomers && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
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

    // ── 3. Build ref and check blocklist / duplicate ──────────────────────────
    const refNum = quoteNumber
      ? (String(quoteNumber).startsWith("QH-") ? quoteNumber : `QH-${quoteNumber}`)
      : `QH-${Date.now()}`;

    const { data: blocked } = await supabase
      .from("mellor_deleted_references")
      .select("reference_number")
      .eq("reference_number", refNum)
      .maybeSingle();

    if (blocked) {
      return new Response(
        JSON.stringify({ success: true, message: "Job was previously deleted — skipped", customerId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existing } = await supabase
      .from("jobs")
      .select("id, reference_number")
      .eq("reference_number", refNum)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, message: "Job already exists (duplicate skipped)", jobId: existing.id, customerId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Build a clean job name ─────────────────────────────────────────────
    const jobName = jobType
      ? `${jobType}${clientName ? ` — ${clientName}` : ""}`
      : (description
          ? `${description.slice(0, 80)}${description.length > 80 ? "…" : ""}${clientName ? ` — ${clientName}` : ""}`
          : `The Mellor Import — ${quoteNumber ?? "Unknown"}`);

    // ── 5. Create job with correct category ───────────────────────────────────
    const { data: newJob, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        reference_number: refNum,
        name: jobName,
        customer: clientName || null,
        customer_id: customerId || null,
        address: jobAddress || null,
        priority: "medium",
        category: categorySlug,
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

    // ── 6. Auto-attach documents (category templates + customer paperwork) ────
    await autoAttachDocuments(supabase, newJob.id, categorySlug, customerId, isInstallation);

    // ── 7. Log activity ───────────────────────────────────────────────────────
    const detailLines = [
      `Imported from The Mellor (action: ${action})`,
      `Category mapped: ${categorySlug}`,
      quoteNumber  ? `Quote #: ${quoteNumber}` : null,
      contactName  ? `Contact: ${contactName}` : null,
      contactEmail ? `Email: ${contactEmail}` : null,
      contactPhone ? `Phone: ${contactPhone}` : null,
      value != null ? `Quote Value: £${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : null,
      description  ? `Scope: ${description}` : null,
    ].filter(Boolean).join(" | ");

    await supabase.from("job_activity_log").insert({
      job_id: newJob.id,
      action: "mellor_import",
      details: detailLines,
    } as any);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: newJob.id,
        customerId,
        category: categorySlug,
        message: `Job ${refNum} created with category "${categorySlug}"`,
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
