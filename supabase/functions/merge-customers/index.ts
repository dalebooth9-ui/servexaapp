import { resolveCaller } from "../_shared/callerOrg.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const caller = await resolveCaller(req);
    if ("error" in caller) return json({ error: caller.error }, caller.status);
    if (!caller.isAdmin) return json({ error: "Only company admins can merge customers" }, 403);
    const supabase = caller.admin;

    const { target_customer_id, source_customer_ids } = await req.json();
    const uuid = /^[0-9a-f-]{36}$/i;
    if (typeof target_customer_id !== "string" || !uuid.test(target_customer_id) || !Array.isArray(source_customer_ids) || source_customer_ids.length === 0 || source_customer_ids.length > 200 || !source_customer_ids.every((x: unknown) => typeof x === "string" && uuid.test(x))) {
      return json({ error: "Missing target_customer_id or source_customer_ids" }, 400);
    }
    const allIds = Array.from(new Set([target_customer_id, ...source_customer_ids]));
    const { data: owned, error: ownErr } = await supabase.from("customers").select("id, org_id").in("id", allIds);
    if (ownErr) return json({ error: "Could not check customers" }, 500);
    if ((owned ?? []).length !== allIds.length || (owned ?? []).some((c: any) => c.org_id !== caller.orgId)) {
      console.warn("merge-customers rejected cross-company request", { user: caller.userId });
      return json({ error: "One or more customers do not belong to your company" }, 403);
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
    console.error("merge-customers error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
