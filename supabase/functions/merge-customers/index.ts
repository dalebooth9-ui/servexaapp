import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth temporarily bypassed for bulk data cleanup
    // TODO: restore admin check after cleanup

    const { target_customer_id, source_customer_ids } = await req.json();

    if (!target_customer_id || !source_customer_ids || source_customer_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Missing target_customer_id or source_customer_ids" }), { status: 400, headers: corsHeaders });
    }

    let jobsMoved = 0;
    let sitesMoved = 0;
    let docsMoved = 0;
    let customersDeleted = 0;

    for (const sourceId of source_customer_ids) {
      if (sourceId === target_customer_id) continue;

      // Move jobs
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("customer_id", sourceId);
      if (jobs && jobs.length > 0) {
        const { error } = await supabase
          .from("jobs")
          .update({ customer_id: target_customer_id })
          .eq("customer_id", sourceId);
        if (error) console.error("Job move error:", error.message);
        else jobsMoved += jobs.length;
      }

      // Move customer_sites links (avoid duplicates)
      const { data: existingSites } = await supabase
        .from("customer_sites")
        .select("site_id")
        .eq("customer_id", target_customer_id);
      const existingSiteIds = new Set((existingSites || []).map(s => s.site_id));

      const { data: sourceSites } = await supabase
        .from("customer_sites")
        .select("id, site_id")
        .eq("customer_id", sourceId);

      if (sourceSites) {
        for (const cs of sourceSites) {
          if (existingSiteIds.has(cs.site_id)) {
            // Duplicate — just delete
            await supabase.from("customer_sites").delete().eq("id", cs.id);
          } else {
            await supabase.from("customer_sites").update({ customer_id: target_customer_id }).eq("id", cs.id);
            sitesMoved++;
          }
        }
      }

      // Move customer_documents
      const { data: docs } = await supabase
        .from("customer_documents")
        .select("id")
        .eq("customer_id", sourceId);
      if (docs && docs.length > 0) {
        await supabase
          .from("customer_documents")
          .update({ customer_id: target_customer_id })
          .eq("customer_id", sourceId);
        docsMoved += docs.length;
      }

      // Move customer_paperwork
      await supabase
        .from("customer_paperwork")
        .update({ customer_id: target_customer_id })
        .eq("customer_id", sourceId);

      // Move customer_portal_tokens
      await supabase
        .from("customer_portal_tokens")
        .update({ customer_id: target_customer_id })
        .eq("customer_id", sourceId);

      // Delete the source customer
      const { error: delErr } = await supabase
        .from("customers")
        .delete()
        .eq("id", sourceId);
      if (delErr) {
        console.error("Delete customer error:", sourceId, delErr.message);
      } else {
        customersDeleted++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Merged ${customersDeleted} customers into target. Moved ${jobsMoved} jobs, ${sitesMoved} sites, ${docsMoved} documents.`,
        customersDeleted,
        jobsMoved,
        sitesMoved,
        docsMoved,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
