import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Entity = "customers" | "sites" | "assets";

interface CommitRow {
  action: "create" | "merge" | "skip";
  values: Record<string, any>;
  mergeTargetId?: string | null;
  parentMatchId?: string | null; // resolved customer_id (sites) or site_id (assets)
}

interface CommitBody {
  entity: Entity;
  filename?: string;
  rows: CommitRow[];
}

const VALID_SITE_TYPES = new Set(["region", "site", "building", "zone"]);
const VALID_ASSET_STATUS = new Set(["operational", "maintenance", "faulty", "decommissioned"]);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const trimmed = s.toString().trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: orgRow } = await admin.from("organisation_members").select("org_id").eq("user_id", caller.id).limit(1).maybeSingle();
    const orgId = orgRow?.org_id as string | undefined;
    if (!orgId) return new Response(JSON.stringify({ error: "No organisation for user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = (await req.json()) as CommitBody;
    if (!body?.entity || !Array.isArray(body.rows)) {
      return new Response(JSON.stringify({ error: "entity and rows required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.rows.length > 5000) {
      return new Response(JSON.stringify({ error: "Max 5000 rows per import" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create the batch
    const { data: batch, error: batchErr } = await admin.from("import_batches").insert({
      org_id: orgId,
      created_by: caller.id,
      entity_type: body.entity,
      source_filename: body.filename || null,
      row_count: body.rows.length,
      status: "running",
    }).select().single();
    if (batchErr || !batch) {
      console.error("batch create failed", batchErr);
      return new Response(JSON.stringify({ error: "Failed to create import batch" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const batchId = batch.id as string;
    let created = 0, merged = 0, skipped = 0;
    const errors: any[] = [];
    const now = new Date().toISOString();

    const toCreate = body.rows.filter((r) => r.action === "create");
    const toMerge = body.rows.filter((r) => r.action === "merge");
    skipped = body.rows.filter((r) => r.action === "skip").length;

    // Build create payloads
    const buildCreatePayload = (r: CommitRow) => {
      const v = r.values || {};
      if (body.entity === "customers") {
        if (!v.name) return null;
        return {
          org_id: orgId,
          created_by: caller.id,
          name: String(v.name).trim(),
          email: v.email || null,
          phone: v.phone || null,
          address: v.address || null,
          import_batch_id: batchId,
          imported_at: now,
        };
      }
      if (body.entity === "sites") {
        if (!v.name) return null;
        const site_type = v.site_type && VALID_SITE_TYPES.has(String(v.site_type).toLowerCase()) ? String(v.site_type).toLowerCase() : "site";
        return {
          org_id: orgId,
          created_by: caller.id,
          name: String(v.name).trim(),
          address: v.address || null,
          postcode: v.postcode || null,
          site_type,
          contact_name: v.contact_name || null,
          contact_phone: v.contact_phone || null,
          contact_email: v.contact_email || null,
          notes: v.notes || null,
          import_batch_id: batchId,
          imported_at: now,
        };
      }
      if (body.entity === "assets") {
        if (!v.name) return null;
        const status = v.status && VALID_ASSET_STATUS.has(String(v.status).toLowerCase()) ? String(v.status).toLowerCase() : "operational";
        return {
          org_id: orgId,
          created_by: caller.id,
          name: String(v.name).trim(),
          asset_tag: v.asset_tag || null,
          category: (v.category || "general").toString().toLowerCase().replace(/\s+/g, "_"),
          make: v.make || null,
          model: v.model || null,
          serial_number: v.serial_number || null,
          site_id: r.parentMatchId || null,
          install_date: toDate(v.install_date),
          warranty_expiry: toDate(v.warranty_expiry),
          status,
          notes: v.notes || null,
          import_batch_id: batchId,
          imported_at: now,
        };
      }
      return null;
    };

    const payloads = toCreate.map(buildCreatePayload).filter(Boolean) as any[];

    // For sites the parent_customer id needs to move onto customer_sites link (not a column on sites).
    // We insert sites first, then link.
    for (const batchRows of chunk(payloads, 500)) {
      const { data: inserted, error } = await admin.from(body.entity).insert(batchRows).select("id");
      if (error) {
        console.error("insert error", error);
        errors.push({ chunk_size: batchRows.length, message: error.message });
        continue;
      }
      created += inserted?.length || 0;

      // If sites: create customer_sites links for rows that had a resolved parent
      if (body.entity === "sites") {
        const links: any[] = [];
        // Walk in parallel with toCreate rows to match parentMatchId
        // NB: order preserved by insert
        let idx = 0;
        for (const r of toCreate) {
          if (!buildCreatePayload(r)) continue;
          const newId = inserted?.[idx]?.id;
          idx++;
          if (newId && r.parentMatchId) {
            links.push({ customer_id: r.parentMatchId, site_id: newId });
          }
        }
        if (links.length) {
          const { error: linkErr } = await admin.from("customer_sites").insert(links);
          if (linkErr) {
            console.error("customer_sites link failed", linkErr);
            errors.push({ step: "customer_sites", message: linkErr.message });
          }
        }
      }
    }

    // Merges: non-destructive fill of empty fields on existing row + tag batch
    for (const r of toMerge) {
      if (!r.mergeTargetId) { skipped++; continue; }
      const payload = buildCreatePayload(r);
      if (!payload) { skipped++; continue; }
      // Read existing to only fill empty fields
      const { data: existing } = await admin.from(body.entity).select("*").eq("id", r.mergeTargetId).eq("org_id", orgId).maybeSingle();
      if (!existing) { skipped++; continue; }
      const update: Record<string, any> = { import_batch_id: batchId, imported_at: now };
      for (const [k, v] of Object.entries(payload)) {
        if (["org_id", "created_by", "import_batch_id", "imported_at"].includes(k)) continue;
        if (v == null || v === "") continue;
        if (existing[k] == null || existing[k] === "") update[k] = v;
      }
      const { error: upErr } = await admin.from(body.entity).update(update).eq("id", r.mergeTargetId).eq("org_id", orgId);
      if (upErr) { errors.push({ merge_id: r.mergeTargetId, message: upErr.message }); continue; }
      merged++;
    }

    const status = errors.length && created === 0 && merged === 0 ? "failed" : "complete";
    await admin.from("import_batches").update({
      created_count: created,
      merged_count: merged,
      skipped_count: skipped,
      error_summary: errors.length ? { errors: errors.slice(0, 20) } : null,
      status,
    }).eq("id", batchId);

    return new Response(JSON.stringify({ batchId, created, merged, skipped, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("commit-import error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
