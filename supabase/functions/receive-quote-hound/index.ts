import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-quotehound-secret",
};

// Maps job_categories slug → template slugs to try in order
const JOB_TO_TEMPLATE_SLUGS: Record<string, string[]> = {
  dry_riser_installation: ["dry_riser_installation"],
  dry_riser_pressure_test: ["pressure_test"],
  dry_riser_visual: ["visual"],
  wet_riser_annual_service: ["visual"],
  wet_riser_visual: ["visual"],
  sprinkler_service: ["sprinkler_service"],
  fire_hydrant_service: ["hydrant_service", "fire_hydrant"],
  fire_extinguishers: ["fire_extinguisher"],
  site_survey: [],
};

// NOTE: order matters — PT/visual must come BEFORE the generic "dry riser" catch-all
const KNOWN_CATEGORIES = [
  {
    slug: "dry_riser_pressure_test",
    keywords: [
      "pressure test", "hydraulic test", "full pressure",
      "dry riser test", "annual test", "dr pt", "annual pressure", "dry riser annual",
      "pro defend", "prodefend", "pro-defend", "annual inspection dry", "dr annual",
      "annual service dry",
    ],
  },
  {
    slug: "dry_riser_visual",
    keywords: [
      "visual inspection", "visual check", "6 month", "six month", "interim",
      "dr visual", "6month", "half year", "6-month", "interim inspection",
      "visual only", "dr vis",
    ],
  },
  {
    slug: "dry_riser_installation",
    keywords: [
      "dry riser install", "dr install", "install dry riser", "new dry riser",
      "dry riser new", "install dr", "dry riser commission", "commission dry riser",
      "dry riser fitting", "fit dry riser", "supply and install", "supply & install",
      "new installation", "install and commission", "dri install", "dr commission",
      "supply/install", "dry riser supply", "supply dry riser",
      "dry riser",   // broad catch-all — must be after PT/visual
    ],
  },
  {
    slug: "wet_riser_annual_service",
    keywords: [
      "wet riser annual", "wet riser service", "wr annual", "wet riser inspect",
      "annual wet riser", "wet riser maintenance",
    ],
  },
  {
    slug: "wet_riser_visual",
    keywords: [
      "wet riser visual", "wr visual", "wet riser 6 month", "wet riser interim",
    ],
  },
  {
    slug: "sprinkler_service",
    keywords: [
      "sprinkler", "sprinkler annual", "sprinkler service", "sprinkler inspect",
      "sprinkler system", "sprinkler maintenance", "sprinkler check",
    ],
  },
  {
    slug: "fire_hydrant_service",
    keywords: [
      "hydrant", "fire hydrant", "hydrant service", "hydrant inspect",
      "hydrant annual", "hydrant test", "hydrant maintenance",
    ],
  },
  {
    slug: "fire_extinguishers",
    keywords: [
      "extinguisher", "fire extinguisher", "ext service", "extinguisher service",
      "extinguisher annual", "extinguisher inspect", "extinguisher check",
    ],
  },
  {
    slug: "site_survey",
    keywords: [
      "site survey", "site visit", "survey only", "initial survey",
      "pre-install survey", "pre install survey", "feasibility", "scoping visit",
    ],
  },
];

/**
 * Fetch Excel costing sheet and return CSV text of all sheets combined.
 */
async function fetchExcelText(excelUrl: string | null): Promise<string> {
  if (!excelUrl) return "";
  try {
    const res = await fetch(excelUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`Excel fetch failed: ${res.status}`);
      return "";
    }
    const buffer = await res.arrayBuffer();
    const XLSX = await import("npm:xlsx@0.18.5");
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const texts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      texts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }
    const combined = texts.join("\n\n");
    console.log(`Excel extracted (first 500 chars): "${combined.slice(0, 500)}"`);
    return combined;
  } catch (e) {
    console.warn("Excel parse failed:", e);
    return "";
  }
}

/**
 * Use Gemini AI to extract a structured materials/parts list from Excel CSV text.
 * Returns an array of { name, quantity, unit_cost, sell_price } objects.
 */
async function extractPartsFromExcel(csvText: string, lovableApiKey: string): Promise<Array<{
  name: string;
  quantity: number;
  unit_cost: number;
  sell_price: number;
}>> {
  if (!csvText.trim()) return [];

  const prompt = `You are a data extraction assistant for a fire protection company.

Below is CSV data from a costing/quote spreadsheet sent by a supplier (The Mellor).
Extract ALL line items that represent materials, parts, or labour from this spreadsheet.

Rules:
- Extract only actual materials, components, labour, or services with a description and quantity
- Skip header rows, total rows, VAT rows, blank rows, and administrative entries
- For each item extract: description/name, quantity, unit cost (supply/trade price), sell price (if present, otherwise use unit cost)
- Quantities should be numbers (default 1 if not specified)
- Costs should be numbers in GBP (strip £ symbols, commas etc). Use 0 if not present.
- If only one price column exists, use it for both unit_cost and sell_price
- Keep descriptions concise but complete (don't truncate part numbers or specifications)

Respond with ONLY valid JSON array, no explanation, no markdown. Example format:
[
  {"name": "65mm BS EN 14384 Dry Riser Inlet Box", "quantity": 1, "unit_cost": 145.00, "sell_price": 195.00},
  {"name": "100mm Landing Valve", "quantity": 4, "unit_cost": 62.50, "sell_price": 85.00}
]

CSV data:
${csvText.slice(0, 6000)}`;

  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.warn(`AI parts extraction failed ${aiRes.status}: ${errText.slice(0, 200)}`);
      return [];
    }

    const aiData = await aiRes.json();
    const raw = aiData?.choices?.[0]?.message?.content ?? "";
    // Strip any markdown code fences if present
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.warn("AI returned non-array for parts:", cleaned.slice(0, 200));
      return [];
    }

    const parts = parsed
      .filter((p: any) => p?.name && typeof p.name === "string" && p.name.trim().length > 0)
      .map((p: any) => ({
        name: String(p.name).trim(),
        quantity: Math.max(Number(p.quantity) || 1, 1),
        unit_cost: Math.max(Number(p.unit_cost) || 0, 0),
        sell_price: Math.max(Number(p.sell_price) || Number(p.unit_cost) || 0, 0),
      }));

    console.log(`AI extracted ${parts.length} part(s) from Excel`);
    return parts;
  } catch (e) {
    console.warn("Parts extraction parse error:", e);
    return [];
  }
}

/**
 * Extract the number of allocated days from the Excel costing sheet.
 * Looks for a field like "Days on site", "Allocated days", "Labour days", etc.
 * Returns null if not found.
 */
async function extractAllocatedDaysFromExcel(csvText: string, lovableApiKey: string): Promise<number | null> {
  if (!csvText.trim()) return null;

  const prompt = `You are a data extraction assistant for a fire protection company.

Below is CSV data from a costing/quote spreadsheet sent by a supplier (The Mellor).
Find the number of allocated days / days on site / labour days for this job.

Look for fields like:
- "Days on site", "Allocated days", "Days", "No. of days", "Labour days", "Installation days", "Site days", "Working days"
- A labour row where the description mentions "day" and has a quantity (e.g. "2 days labour")
- Any cell explicitly stating how many days the job will take

Rules:
- Return ONLY a single JSON object: {"allocated_days": <integer or null>}
- If you find a clear days value, return it as an integer (round up if decimal)
- If nothing is found, return {"allocated_days": null}
- Do not include any explanation, markdown, or extra text

CSV data:
${csvText.slice(0, 6000)}`;

  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
      }),
    });

    if (!aiRes.ok) {
      console.warn(`AI allocated days extraction failed ${aiRes.status}`);
      return null;
    }

    const aiData = await aiRes.json();
    const raw = aiData?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const days = parsed?.allocated_days;
    if (days != null && !isNaN(Number(days)) && Number(days) > 0) {
      const result = Math.ceil(Number(days));
      console.log(`AI extracted allocated_days: ${result}`);
      return result;
    }
    console.log("No allocated_days found in Excel");
    return null;
  } catch (e) {
    console.warn("Allocated days extraction parse error:", e);
    return null;
  }
}

/**
 * Insert extracted parts as job_parts records.
 */
async function insertJobParts(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  parts: Array<{ name: string; quantity: number; unit_cost: number; sell_price: number }>,
): Promise<number> {
  if (parts.length === 0) return 0;

  const rows = parts.map((p, i) => ({
    job_id: jobId,
    name: p.name,
    quantity: p.quantity,
    unit_cost: p.unit_cost,
    sell_price: p.sell_price,
    total_cost: p.quantity * p.unit_cost,
    added_by: "mellor_import",
    sort_order: i,
  }));

  const { error } = await supabase.from("job_parts").insert(rows as any);
  if (error) {
    console.error("job_parts insert error:", error);
    return 0;
  }
  console.log(`Inserted ${rows.length} parts for job ${jobId}`);
  return rows.length;
}

/**
 * Extract all useful text from the raw webhook payload for classification.
 */
function extractClassificationText(quote: Record<string, any>, body: Record<string, any>): string {
  const parts: string[] = [];
  const fields = [
    "job_type", "jobType", "type",
    "title", "name", "job_name", "jobName",
    "description", "notes", "scope_of_work", "scope",
    "scope_of_works", "works", "job_description", "jobDescription",
    "service_type", "serviceType", "category", "work_type", "workType",
  ];
  for (const f of fields) {
    if (quote[f] && typeof quote[f] === "string") parts.push(quote[f]);
  }
  for (const f of ["title", "name", "job_name", "jobName", "service_type", "serviceType"]) {
    if (body[f] && typeof body[f] === "string" && body[f] !== quote[f]) parts.push(body[f]);
  }
  for (const arrKey of ["line_items", "lineItems", "items", "services"]) {
    const arr = quote[arrKey] ?? body[arrKey];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item?.description) parts.push(String(item.description));
        if (item?.name) parts.push(String(item.name));
      }
    }
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Map text to a category slug using keyword matching, then AI fallback.
 */
async function inferCategorySlug(text: string): Promise<string> {
  // 1. Fast keyword match
  for (const cat of KNOWN_CATEGORIES) {
    if (cat.keywords.some((kw) => text.includes(kw))) {
      console.log(`Keyword matched category: ${cat.slug} (text: "${text.slice(0, 120)}")`);
      return cat.slug;
    }
  }

  // 2. AI fallback
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey && text.trim().length > 3) {
    try {
      const slugList = KNOWN_CATEGORIES.map((c) => c.slug).join(", ");
      const prompt = `You are a fire protection job classifier. Given this job description, respond with ONLY the single most appropriate category slug from this list (no explanation, no punctuation, just the slug):\n\n${slugList}\n\nJob description: "${text.slice(0, 400)}"\n\nRespond with only one slug from the list above, nothing else.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 30,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const raw = aiData?.choices?.[0]?.message?.content ?? "";
        const slug = raw.trim().toLowerCase().replace(/[^a-z_]/g, "");
        if (slug && KNOWN_CATEGORIES.some((c) => c.slug === slug)) {
          console.log(`AI classified category: ${slug}`);
          return slug;
        }
        console.warn(`AI returned unrecognised slug: "${raw}" — falling back`);
      } else {
        const errText = await aiRes.text();
        console.warn(`AI gateway responded ${aiRes.status}: ${errText.slice(0, 200)}`);
      }
    } catch (e) {
      console.warn("AI category inference failed:", e);
    }
  }

  console.log(`No category matched for text: "${text.slice(0, 120)}" — using general`);
  return "general";
}

/**
 * Auto-attach job_documents from category_document_templates and customer paperwork.
 * Also pre-creates draft job_sheet_responses for all matching job_sheet_templates.
 */
async function autoAttachDocuments(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  categorySlug: string,
  customerId: string | null,
  isInstallation: boolean,
): Promise<void> {
  const docsToInsert: any[] = [];
  const templateSlugs = JOB_TO_TEMPLATE_SLUGS[categorySlug] ?? [];
  console.log(`Job category: "${categorySlug}" → template slugs: [${templateSlugs.join(", ")}]`);

  for (const templateSlug of templateSlugs) {
    const { data: catTemplates, error: catErr } = await supabase
      .from("category_document_templates")
      .select("*")
      .eq("category_slug", templateSlug)
      .eq("enabled", true)
      .order("sort_order");

    if (catErr) { console.error(`Error fetching templates for "${templateSlug}":`, catErr); continue; }

    if (catTemplates && catTemplates.length > 0) {
      console.log(`Found ${catTemplates.length} template(s) under slug "${templateSlug}"`);
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
      break;
    } else {
      console.log(`No enabled templates for slug "${templateSlug}", trying next...`);
    }
  }

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

  if (customerId) {
    const { data: paperwork, error: pwErr } = await supabase
      .from("customer_paperwork")
      .select("*")
      .eq("customer_id", customerId)
      .eq("auto_attach", true);

    if (pwErr) {
      console.error("Error fetching customer paperwork:", pwErr);
    } else if (paperwork && paperwork.length > 0) {
      console.log(`Found ${paperwork.length} auto-attach customer paperwork item(s)`);
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
  } else {
    console.log(`No documents to auto-attach for job ${jobId}`);
  }

  // ── Pre-create draft job_sheet_responses for all matching job_sheet_templates ──
  // This ensures fillable forms (e.g. Commissioning Certificate) appear pre-loaded
  // in the Worksheets tab, just like manually created jobs.
  const { data: matchingSheetTpls, error: sheetTplErr } = await supabase
    .from("job_sheet_templates")
    .select("id, name")
    .eq("job_category", categorySlug);

  if (sheetTplErr) {
    console.error("Error fetching job_sheet_templates:", sheetTplErr);
  } else if (matchingSheetTpls && matchingSheetTpls.length > 0) {
    const sheetResponsesToInsert = (matchingSheetTpls as any[]).map((tpl) => ({
      job_id: jobId,
      template_id: tpl.id,
      responses: {},
      status: "draft",
      engineer_id: null,
      submitted_by: null,
      submitted_at: null,
    }));
    const { error: srErr } = await supabase
      .from("job_sheet_responses")
      .insert(sheetResponsesToInsert as any);
    if (srErr) console.error("Error pre-creating sheet responses:", srErr);
    else console.log(`Pre-created ${sheetResponsesToInsert.length} draft worksheet(s) for job ${jobId}`);
  } else {
    console.log(`No job_sheet_templates found for category "${categorySlug}"`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const expectedSecret = Deno.env.get("QUOTEHOUND_WEBHOOK_SECRET");
    if (!expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customHeader = req.headers.get("x-quotehound-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const providedSecret = customHeader ?? bearerToken;

    if (!providedSecret || providedSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    console.log("Raw payload:", JSON.stringify(body).slice(0, 800));

    const quote = body.quote ?? body;
    const action = body.action ?? "push";

    if (!quote) {
      return new Response(
        JSON.stringify({ error: "Missing quote payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Normalise field names ──────────────────────────────────────────────────
    const clientName = quote.client_name ?? quote.clientName ?? null;
    const contactEmail = quote.contact_email ?? quote.contactEmail ?? null;
    const contactPhone = quote.contact_phone ?? quote.contactPhone ?? null;
    const contactName = quote.contact_name ?? quote.contactName ?? null;
    const jobAddress = quote.job_address ?? quote.jobAddress ?? quote.address ?? null;
    const jobType = quote.job_type ?? quote.jobType ?? quote.type ?? null;
    const quoteNumber = quote.reference ?? quote.quote_number ?? quote.quoteNumber ?? null;
    const value = quote.value ?? null;
    const description = quote.description ?? quote.notes ?? quote.scope_of_work ?? quote.scope ?? null;
    const excelUrl = quote.excel_url ?? quote.excelUrl ?? body.excel_url ?? body.excelUrl
      ?? quote.costing_sheet_url ?? quote.costingSheetUrl ?? body.costing_sheet_url
      ?? quote.costing_url ?? quote.costingUrl ?? body.costing_url
      ?? quote.spreadsheet_url ?? quote.spreadsheetUrl ?? body.spreadsheet_url
      ?? quote.materials_url ?? quote.materialsUrl ?? body.materials_url
      ?? null;
    const pdfUrl = quote.pdf_url ?? quote.pdfUrl ?? body.pdf_url ?? null;
    const poUrl = quote.po_url ?? quote.poUrl ?? body.po_url ?? null;
    // Log all top-level keys in the payload to help debug missing fields
    console.log("Payload top-level keys:", Object.keys(body).join(", "));
    console.log("Quote top-level keys:", Object.keys(quote).join(", "));
    console.log(`excel_url resolved: ${excelUrl ? excelUrl.slice(0, 80) : "null"}`);
    console.log(`pdf_url resolved: ${pdfUrl ? pdfUrl.slice(0, 80) : "null"}`);
    console.log(`po_url resolved: ${poUrl ? poUrl.slice(0, 80) : "null"}`);

    // ── 1. Category — all Mellor jobs are dry riser installations ────────────
    // The Mellor only ever sends wet & dry riser installation work.
    // Payload arrives as job_type:"General" with no useful descriptive text,
    // so classification is skipped entirely and we hardcode the correct category.
    // The keyword/AI classification code below is preserved (commented out) and
    // can be re-enabled later if The Mellor begins sending varied job types.
    const categorySlug = "dry_riser_installation";
    const isInstallation = true;
    console.log(`Mellor import — fixed category: ${categorySlug} | isInstallation: ${isInstallation}`);

    /*
    // ── CLASSIFICATION (disabled — re-enable if Mellor sends varied job types) ──
    let classificationText = extractClassificationText(quote, body);
    console.log(`Classification text from payload: "${classificationText.slice(0, 200)}"`);
    const isGeneric = !classificationText.trim() || classificationText.trim() === "general";
    if (isGeneric && excelUrl) {
      console.log("Payload text is generic — fetching Excel for line-item descriptions...");
      const excelText = await fetchExcelText(excelUrl);
      if (excelText) {
        classificationText = classificationText + " " + excelText;
        console.log(`Combined text after Excel (first 300): "${classificationText.slice(0, 300)}"`);
      }
    }
    const categorySlug = await inferCategorySlug(classificationText);
    const isInstallation = categorySlug === "dry_riser_installation" || categorySlug === "installation";
    console.log(`Final category: ${categorySlug} | isInstallation: ${isInstallation}`);
    */

    // ── 2. Upsert customer ─────────────────────────────────────────────────────
    let customerId: string | null = null;
    if (clientName) {
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name")
        .ilike("name", clientName.trim())
        .limit(1);

      if (existingCustomers && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
        await supabase.from("customers").update({
          ...(contactEmail ? { email: contactEmail } : {}),
          ...(contactPhone ? { phone: contactPhone } : {}),
          ...(jobAddress ? { address: jobAddress } : {}),
        }).eq("id", customerId);
      } else {
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({ name: clientName.trim(), email: contactEmail || null, phone: contactPhone || null, address: jobAddress || null })
          .select("id")
          .single();
        if (custErr) console.error("Customer insert error:", custErr);
        else customerId = newCustomer.id;
      }
    }

    // ── 3. Build TM- reference and check blocklist / duplicate ─────────────────
    const rawRef = quoteNumber ? String(quoteNumber) : null;
    const refNum = rawRef
      ? rawRef.startsWith("TM-") ? rawRef : `TM-${rawRef}`
      : `TM-${Date.now()}`;

    const { data: blocked } = await supabase
      .from("mellor_deleted_references")
      .select("reference_number")
      .eq("reference_number", refNum)
      .maybeSingle();

    if (blocked) {
      return new Response(
        JSON.stringify({ success: true, message: "Job was previously deleted — skipped", customerId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Build a clean job name ──────────────────────────────────────────────
    const preferredTitle = quote.title ?? quote.name ?? quote.job_name ?? null;
    // When Mellor sends "General" (or nothing), use the resolved category name instead
    const effectiveType = (jobType && jobType.toLowerCase() !== "general")
      ? jobType
      : (preferredTitle ?? "Dry Riser Installation");
    const jobName = effectiveType
      ? `${effectiveType}${clientName ? ` — ${clientName}` : ""}`
      : description
      ? `${description.slice(0, 80)}${description.length > 80 ? "…" : ""}${clientName ? ` — ${clientName}` : ""}`
      : `The Mellor Import — ${quoteNumber ?? "Unknown"}`;

    // ── 5. Create job ──────────────────────────────────────────────────────────
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 6. Auto-attach documents ───────────────────────────────────────────────
    await autoAttachDocuments(supabase, newJob.id, categorySlug, customerId, isInstallation);

    // ── 6b. Fill document slots with actual files from The Mellor ─────────────
    // The Mellor sends pdf_url (quote PDF) and po_url (purchase order PDF).
    // Backfill the pre-created 'quote' and 'purchase_order' slots with real URLs.
    const fileSlotUpdates: Array<{ type: string; url: string; name: string }> = [];
    if (pdfUrl) fileSlotUpdates.push({ type: "quote", url: pdfUrl, name: `Quote-${refNum}.pdf` });
    if (poUrl) fileSlotUpdates.push({ type: "purchase_order", url: poUrl, name: `PO-${refNum}.pdf` });

    for (const slot of fileSlotUpdates) {
      const { error: slotErr } = await supabase
        .from("job_documents")
        .update({ file_url: slot.url, file_name: slot.name } as any)
        .eq("job_id", newJob.id)
        .eq("document_type", slot.type);
      if (slotErr) console.error(`Error filling ${slot.type} slot:`, slotErr);
      else console.log(`Filled ${slot.type} slot with URL: ${slot.url.slice(0, 80)}`);
    }

    // ── 7. Parse Excel costing sheet → Job Parts + Allocated Days ────────────
    let partsCount = 0;
    let allocatedDays: number | null = null;
    if (excelUrl) {
      console.log(`Excel URL found — fetching costing sheet: ${excelUrl.slice(0, 80)}...`);
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableApiKey) {
        const csvText = await fetchExcelText(excelUrl);
        if (csvText.trim()) {
          // Run parts extraction and allocated days extraction in parallel
          const [parts, days] = await Promise.all([
            extractPartsFromExcel(csvText, lovableApiKey),
            extractAllocatedDaysFromExcel(csvText, lovableApiKey),
          ]);
          partsCount = await insertJobParts(supabase, newJob.id, parts);
          allocatedDays = days;
          // Patch allocated_days onto the job if found
          if (allocatedDays != null) {
            const { error: daysErr } = await supabase
              .from("jobs")
              .update({ allocated_days: allocatedDays } as any)
              .eq("id", newJob.id);
            if (daysErr) console.error("Error setting allocated_days:", daysErr);
            else console.log(`Set allocated_days = ${allocatedDays} on job ${newJob.id}`);
          }
        } else {
          console.log("Excel text was empty — skipping parts extraction");
        }
      } else {
        console.warn("LOVABLE_API_KEY not set — skipping parts extraction");
      }
    } else {
      console.log("No excel_url in payload — skipping parts extraction");
    }

    // ── 8. Log activity ────────────────────────────────────────────────────────
    const detailLines = [
      `Imported from The Mellor (action: ${action})`,
      `Category mapped: ${categorySlug}`,
      quoteNumber ? `Quote #: ${quoteNumber}` : null,
      contactName ? `Contact: ${contactName}` : null,
      contactEmail ? `Email: ${contactEmail}` : null,
      contactPhone ? `Phone: ${contactPhone}` : null,
      value != null ? `Quote Value: £${Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : null,
      description ? `Scope: ${description}` : null,
      partsCount > 0 ? `Materials imported: ${partsCount} item(s) from costing sheet` : null,
      allocatedDays != null ? `Allocated days: ${allocatedDays}` : null,
      pdfUrl ? `Quote PDF attached` : null,
      poUrl ? `PO PDF attached` : null,
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
        partsImported: partsCount,
        message: `Job ${refNum} created with category "${categorySlug}"${partsCount > 0 ? ` and ${partsCount} material(s)` : ""}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("receive-quote-hound error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
