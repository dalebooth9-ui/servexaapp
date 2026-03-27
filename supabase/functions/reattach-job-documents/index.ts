import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maps job_categories slug → template slugs to try in order
const JOB_TO_TEMPLATE_SLUGS: Record<string, string[]> = {
  dry_riser_installation: ["dry_riser_installation"],
  dry_riser_pressure_test: ["dry_riser_pressure_test"],
  dry_riser_visual: ["visual"],
  wet_riser_annual_service: ["visual"],
  wet_riser_visual: ["visual"],
  sprinkler_service: ["sprinkler_service"],
  fire_hydrant_service: ["hydrant_service", "fire_hydrant"],
  fire_extinguishers: ["fire_extinguisher"],
  site_survey: [],
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

    // Verify caller is authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id, dry_run = false } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the job
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, name, reference_number, category, customer_id")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categorySlug = (job as any).category ?? "general";
    const customerId = (job as any).customer_id ?? null;
    const isInstallation = categorySlug === "dry_riser_installation" || categorySlug === "installation";

    // Fetch existing auto-attached docs to avoid duplicates
    const { data: existingDocs } = await supabase
      .from("job_documents")
      .select("document_type, label, category_template_id")
      .eq("job_id", job_id)
      .eq("source", "auto");

    const existingTemplateIds = new Set(
      (existingDocs ?? []).map((d: any) => d.category_template_id).filter(Boolean)
    );
    const existingTypes = new Set((existingDocs ?? []).map((d: any) => `${d.document_type}::${d.label}`));

    const docsToInsert: any[] = [];
    const skipped: string[] = [];

    // 1. Category document templates
    const templateSlugs = JOB_TO_TEMPLATE_SLUGS[categorySlug] ?? [];
    let foundTemplates = false;

    for (const templateSlug of templateSlugs) {
      if (foundTemplates) break;
      const { data: catTemplates } = await supabase
        .from("category_document_templates")
        .select("*")
        .eq("category_slug", templateSlug)
        .eq("enabled", true)
        .order("sort_order");

      if (catTemplates && catTemplates.length > 0) {
        foundTemplates = true;
        for (const t of catTemplates as any[]) {
          if (existingTemplateIds.has(t.id)) {
            skipped.push(`${t.label} (already attached)`);
            continue;
          }
          docsToInsert.push({
            job_id,
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

    // 2. Pre-start checklist for installation jobs
    if (isInstallation) {
      const key = "pre_start_checklist::Pre-start Check List";
      if (existingTypes.has(key)) {
        skipped.push("Pre-start Check List (already attached)");
      } else {
        docsToInsert.push({
          job_id,
          document_type: "pre_start_checklist",
          label: "Pre-start Check List",
          file_url: null,
          file_name: null,
          source: "auto",
        });
      }
    }

    // 3. Customer auto-attach paperwork
    if (customerId) {
      const { data: paperwork } = await supabase
        .from("customer_paperwork")
        .select("*")
        .eq("customer_id", customerId)
        .eq("auto_attach", true);

      for (const pw of (paperwork ?? []) as any[]) {
        const key = `customer_paperwork::${pw.label || pw.file_name}`;
        if (existingTypes.has(key)) {
          skipped.push(`${pw.label || pw.file_name} (already attached)`);
          continue;
        }
        docsToInsert.push({
          job_id,
          document_type: "customer_paperwork",
          label: pw.label || pw.file_name,
          file_url: pw.file_url,
          file_name: pw.file_name,
          source: "customer_paperwork",
        });
      }
    }

    if (!dry_run && docsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("job_documents")
        .insert(docsToInsert);
      if (insertErr) throw insertErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_name: (job as any).name,
        category: categorySlug,
        attached: docsToInsert.map((d) => d.label),
        skipped,
        dry_run,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("reattach-job-documents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
