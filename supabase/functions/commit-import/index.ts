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

function toInt(s: any): number | null {
  if (s == null) return null;
  const m = String(s).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
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
    const { data: orgId, error: orgError } = await callerClient.rpc('get_user_org_id');
    if(orgError)throw orgError;
    if (!orgId) return new Response(JSON.stringify({ error: "No organisation for user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const [{data:isAdmin},{data:isActive}]=await Promise.all([
      callerClient.rpc('has_role_in_org',{_user_id:caller.id,_org_id:orgId,_role:'admin'}),
      callerClient.rpc('is_org_active',{_org_id:orgId}),
    ]);
    if(!isAdmin||!isActive)return new Response(JSON.stringify({error:'Active company admin access required'}),{status:403,headers:{...corsHeaders,'Content-Type':'application/json'}});

    const body = (await req.json()) as CommitBody;
    if (!['customers','sites','assets'].includes(body?.entity) || !Array.isArray(body.rows)) {
      return new Response(JSON.stringify({ error: "entity and rows required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.rows.length > 5000) {
      return new Response(JSON.stringify({ error: "Max 5000 rows per import" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service-role writes must validate every supplied parent against the caller's company.
    const parentTable=body.entity==='sites'?'customers':'sites';
    const parentIds=[...new Set(body.rows.filter(r=>r.action!=='skip').map(r=>r.parentMatchId).filter(Boolean))];
    for(const ids of chunk(parentIds,500)){
      const {data,error}=await admin.from(parentTable).select('id').eq('org_id',orgId).in('id',ids);
      if(error)throw error;
      if(data?.length!==ids.length)return new Response(JSON.stringify({error:'Selected parent belongs to another company or is unavailable'}),{status:403,headers:{...corsHeaders,'Content-Type':'application/json'}});
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
        const typeText = `${v.asset_type || ""} ${v.category || ""} ${v.name || ""}`;
        const isWetRiser = /wet[\s_-]*riser/i.test(`${v.asset_type || ""} ${v.category || ""}`) || (!/dry[\s_-]*riser/i.test(typeText) && /wet\s*riser/i.test(typeText));
        const isDryRiser = !isWetRiser && /dry[\s_-]*riser/i.test(typeText);
        const riserType = isWetRiser ? "Wet Riser" : isDryRiser ? "Dry Riser" : null;
        const status = v.status && VALID_ASSET_STATUS.has(String(v.status).toLowerCase()) ? String(v.status).toLowerCase() : "operational";
        return {
          org_id: orgId,
          created_by: caller.id,
          name: String(v.name).trim(),
          asset_tag: (v.asset_tag && String(v.asset_tag).trim()) ? String(v.asset_tag).trim().toUpperCase() : null,
          category: riserType ? riserType : (v.category || "general").toString().toLowerCase().replace(/\s+/g, "_"),
          asset_type: riserType ? riserType : (v.asset_type ? String(v.asset_type).trim() : null),
          riser_location: v.riser_location ? String(v.riser_location).trim() : null,
          outlets_count: toInt(v.outlets_count),
          last_inspection_at: toDate(v.last_inspection_at),
          last_inspection_type: v.last_inspection_type ? String(v.last_inspection_type).trim() : null,
          last_inspection_result: v.last_inspection_result ? String(v.last_inspection_result).trim() : null,
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

    // Pair each valid source row with its payload so we can link created ids back after insert.
    const paired: { source: CommitRow; payload: any }[] = [];
    for (const r of toCreate) {
      const p = buildCreatePayload(r);
      if (p) paired.push({ source: r, payload: p });
    }

    for (const group of chunk(paired, 500)) {
      if (body.entity === 'assets') {
        const { data, error } = await callerClient.rpc('upsert_asset_rows', { _rows: group.map(g=>g.payload), _source: 'import' });
        if (error) { errors.push({chunk_size:group.length,message:error.message}); continue; }
        created += (data || []).filter((r: {created:boolean})=>r.created).length;
        merged += (data || []).filter((r: {created:boolean})=>!r.created).length;
        continue;
      }
      const { data: inserted, error } = await admin
        .from(body.entity)
        .insert(group.map((g) => g.payload))
        .select("id");
      if (error) {
        console.error("insert error", error);
        errors.push({ chunk_size: group.length, message: error.message });
        continue;
      }
      created += inserted?.length || 0;

      if (body.entity === "sites" && inserted) {
        const links: any[] = [];
        for (let i = 0; i < inserted.length; i++) {
          const newId = inserted[i].id;
          const parent = group[i]?.source.parentMatchId;
          if (newId && parent) links.push({ customer_id: parent, site_id: newId,org_id:orgId });
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
      if(body.entity==='assets') {
        const {data:target}=await admin.from('assets').select('site_id,name,category').eq('id',r.mergeTargetId).eq('org_id',orgId).maybeSingle();
        if(!target || target.site_id!==r.parentMatchId || target.name.trim().toLowerCase()!==String(payload.name).trim().toLowerCase() || target.category.trim().toLowerCase()!==String(payload.category).trim().toLowerCase()) { errors.push({merge_id:r.mergeTargetId,message:'Asset identity differs from selected site/name/category'});continue; }
        const {error}=await callerClient.rpc('upsert_asset_rows',{_rows:[payload],_source:'import'});
        if(error)errors.push({merge_id:r.mergeTargetId,message:error.message});else merged++;
        continue;
      }
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
