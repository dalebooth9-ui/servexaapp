import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReassignBody {
  from_customer_id?: string;
  to_customer_id?: string | null;
  to_customer_name?: string | null;
  /** Preview only — return counts but make no writes. */
  dry_run?: boolean;
  /** Reverse a prior merge using a snapshot returned by a previous call. */
  undo?: boolean;
  undo_snapshot?: UndoSnapshot;
  /** Merge every pending exact-match (similarity 1.0) suggestion, in batches. */
  bulk_exact?: boolean;
  batch_size?: number;
}

interface UndoSnapshot {
  /** The deleted source customer (full row) so we can recreate it. */
  from_customer: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    org_id: string | null;
    xero_contact_id: string | null;
    logo_url: string | null;
    accreditation_logos: string[];
    created_by: string | null;
  };
  /** The id we reassigned everything to. */
  to_customer_id: string;
  /** Was the target newly created during the merge? If so, undo deletes it. */
  to_was_created: boolean;
  /** For each related table, the row ids that we re-pointed from -> to. */
  moved: Record<string, string[]>;
  /** Original jobs.customer text values, keyed by job id. */
  job_customer_text: Record<string, string | null>;
}

/**
 * Every table with a foreign key to customers.id (checked against
 * pg_constraint). Merging must re-point all of them, not just jobs.
 */
const RELATED_TABLES = [
  "jobs",
  "customer_documents",
  "customer_paperwork",
  "customer_portal_tokens",
  "customer_portal_invites",
  "customer_portal_users",
  "customer_sites",
  "fire_log_tokens",
  "handover_tokens",
  "archived_documents",
  "contract_agreements",
  "historic_reports",
  "portal_visit_requests",
  "service_contracts",
  "site_service_schedules",
  "site_surveys",
] as const;

/** Fields copied from the duplicate onto the survivor where the survivor is blank. */
const CARRY_FIELDS = [
  "address",
  "phone",
  "email",
  "xero_contact_id",
  "quickbooks_contact_id",
  "sage_contact_id",
  "freeagent_contact_id",
  "logo_url",
  "brand_colour",
] as const;

/** Copy non-null values from the duplicate onto the survivor where it has none. */
async function carryOverFields(admin: any, fromRow: any, toId: string) {
  const { data: toRow } = await admin
    .from("customers")
    .select(CARRY_FIELDS.join(","))
    .eq("id", toId)
    .maybeSingle();
  if (!toRow) return;
  const patch: Record<string, unknown> = {};
  for (const f of CARRY_FIELDS) {
    if ((toRow as any)[f] == null && fromRow?.[f] != null) patch[f] = fromRow[f];
  }
  if (Object.keys(patch).length > 0) {
    await admin.from("customers").update(patch).eq("id", toId);
  }
}

/**
 * customer_sites is unique on (customer_id, site_id) — drop links the survivor
 * already has before re-pointing, otherwise the update violates the constraint.
 */
async function dropDuplicateSiteLinks(admin: any, fromId: string, toId: string) {
  const { data: targetLinks } = await admin
    .from("customer_sites")
    .select("site_id")
    .eq("customer_id", toId);
  const have = new Set((targetLinks || []).map((r: any) => r.site_id));
  if (have.size === 0) return;
  const { data: sourceLinks } = await admin
    .from("customer_sites")
    .select("id, site_id")
    .eq("customer_id", fromId);
  const dupes = (sourceLinks || []).filter((r: any) => have.has(r.site_id)).map((r: any) => r.id);
  if (dupes.length > 0) {
    await admin.from("customer_sites").delete().in("id", dupes);
  }
}

/** Merge one duplicate into a survivor. Used by the bulk exact-match run. */
async function mergePair(admin: any, fromId: string, toId: string, userId: string) {
  const errors: string[] = [];
  const { data: fromRow } = await admin.from("customers").select("*").eq("id", fromId).maybeSingle();
  if (!fromRow) return { errors: ["source customer not found"] };
  const { data: toRow } = await admin.from("customers").select("id, name").eq("id", toId).maybeSingle();
  if (!toRow) return { errors: ["target customer not found"] };

  await carryOverFields(admin, fromRow, toId);
  await dropDuplicateSiteLinks(admin, fromId, toId);

  for (const table of RELATED_TABLES) {
    const { error } = await admin.from(table).update({ customer_id: toId }).eq("customer_id", fromId);
    if (error) errors.push(`${table}: ${error.message}`);
  }
  await admin.from("jobs").update({ customer: toRow.name }).eq("customer_id", toId);

  if (errors.length === 0) {
    const { error: delErr } = await admin.from("customers").delete().eq("id", fromId);
    if (delErr) errors.push(`delete duplicate: ${delErr.message}`);
  }
  return { errors };
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Verify the caller and check admin role
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return json({ error: "Invalid auth" }, 401);
    }
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return json({ error: "Forbidden — admin only" }, 403);
    }

    const body: ReassignBody = await req.json();

    // ===== UNDO MODE =====
    if (body.undo) {
      const snap = body.undo_snapshot;
      if (!snap || !snap.from_customer || !snap.to_customer_id) {
        return json({ error: "undo_snapshot is required for undo" }, 400);
      }
      return await runUndo(admin, snap);
    }

    // ===== BULK EXACT-MATCH MODE =====
    // Merges pending suggestions with similarity >= 1.0 in batches so the
    // request always finishes; the client calls again while remaining > 0.
    if (body.bulk_exact) {
      const batchSize = Math.min(Math.max(body.batch_size ?? 20, 1), 50);
      const { data: pending, error: pendErr } = await admin
        .from("customer_merge_suggestions")
        .select("id, incoming_name, existing_customer_id, new_customer_id")
        .eq("status", "pending")
        .gte("similarity", 1)
        .not("new_customer_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(batchSize);
      if (pendErr) return json({ error: pendErr.message }, 500);

      const { count: totalPending } = await admin
        .from("customer_merge_suggestions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("similarity", 1)
        .not("new_customer_id", "is", null);

      let merged = 0;
      const failures: { name: string; error: string }[] = [];
      for (const s of pending || []) {
        if (!s.new_customer_id || s.new_customer_id === s.existing_customer_id) {
          await admin
            .from("customer_merge_suggestions")
            .update({ status: "accepted", reviewed_by: userId, reviewed_at: new Date().toISOString() })
            .eq("id", s.id);
          continue;
        }
        const { errors: mergeErrors } = await mergePair(
          admin,
          s.new_customer_id,
          s.existing_customer_id,
          userId,
        );
        if (mergeErrors.length > 0) {
          failures.push({ name: s.incoming_name, error: mergeErrors.join("; ") });
          await admin
            .from("customer_merge_suggestions")
            .update({ status: "failed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
            .eq("id", s.id);
          continue;
        }
        await admin
          .from("customer_merge_suggestions")
          .update({ status: "accepted", reviewed_by: userId, reviewed_at: new Date().toISOString() })
          .eq("id", s.id);
        merged++;
      }

      const processed = (pending || []).length;
      return json({
        bulk: true,
        merged,
        processed,
        failures,
        remaining: Math.max((totalPending ?? 0) - processed, 0),
      });
    }


    // ===== NORMAL / PREVIEW MODE =====
    const fromId = body.from_customer_id?.trim();
    if (!fromId) return json({ error: "from_customer_id required" }, 400);

    let toId = body.to_customer_id?.trim() || null;
    const toName = body.to_customer_name?.trim() || null;

    if (!toId && !toName) {
      return json({ error: "Provide to_customer_id or to_customer_name" }, 400);
    }
    if (toId === fromId) {
      return json({ error: "Source and target must differ" }, 400);
    }

    // Load source customer (full row for snapshot)
    const { data: fromCustomer, error: fromErr } = await admin
      .from("customers")
      .select("*")
      .eq("id", fromId)
      .maybeSingle();
    if (fromErr || !fromCustomer) {
      return json({ error: "Source customer not found" }, 404);
    }

    // Resolve target: by id, then by exact name (case-insensitive), then create.
    let toCustomer: any = null;
    let toWasCreated = false;
    if (toId) {
      const { data } = await admin
        .from("customers")
        .select("id, name, address, phone, email, org_id")
        .eq("id", toId)
        .maybeSingle();
      if (!data) return json({ error: "Target customer not found" }, 404);
      toCustomer = data;
    } else if (toName) {
      const { data: existing } = await admin
        .from("customers")
        .select("id, name, address, phone, email, org_id")
        .ilike("name", toName)
        .limit(1);
      if (existing && existing.length > 0) {
        toCustomer = existing[0];
      } else if (!body.dry_run) {
        const { data: created, error: createErr } = await admin
          .from("customers")
          .insert({
            name: toName,
            email: fromCustomer.email,
            phone: fromCustomer.phone,
            org_id: fromCustomer.org_id,
          })
          .select("id, name, address, phone, email, org_id")
          .single();
        if (createErr || !created) {
          return json({ error: `Could not create target: ${createErr?.message}` }, 500);
        }
        toCustomer = created;
        toWasCreated = true;
      } else {
        toCustomer = { id: "(would-create)", name: toName };
      }
    }
    toId = toCustomer.id;

    // Preview counts on every related table
    const counts: Record<string, number> = {};
    for (const table of RELATED_TABLES) {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("customer_id", fromId);
      counts[table] = count ?? 0;
    }
    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

    if (body.dry_run) {
      return json({
        dry_run: true,
        from: { id: fromCustomer.id, name: fromCustomer.name, address: fromCustomer.address },
        to: { id: toCustomer.id, name: toCustomer.name, will_create: toCustomer.id === "(would-create)" },
        counts,
        total: totalRows,
      });
    }

    // Snapshot affected row ids BEFORE the update so we can undo precisely.
    const moved: Record<string, string[]> = {};
    for (const table of RELATED_TABLES) {
      const { data: rows } = await admin
        .from(table)
        .select("id")
        .eq("customer_id", fromId);
      moved[table] = (rows || []).map((r: any) => r.id);
    }

    // Snapshot existing jobs.customer text so we can restore it on undo.
    const jobIds = moved["jobs"] || [];
    const jobCustomerText: Record<string, string | null> = {};
    if (jobIds.length > 0) {
      const { data: jobRows } = await admin
        .from("jobs")
        .select("id, customer")
        .in("id", jobIds);
      (jobRows || []).forEach((j: any) => {
        jobCustomerText[j.id] = j.customer ?? null;
      });
    }

    // Carry over any details the survivor is missing, then avoid unique clashes
    await carryOverFields(admin, fromCustomer, toId!);
    await dropDuplicateSiteLinks(admin, fromId, toId!);

    // Apply reassignment
    const errors: string[] = [];
    for (const table of RELATED_TABLES) {
      const { error: upErr } = await admin
        .from(table)
        .update({ customer_id: toId } as any)
        .eq("customer_id", fromId);
      if (upErr) errors.push(`${table}: ${upErr.message}`);
    }

    // Also normalize jobs.customer text field to the new name
    const { error: textErr } = await admin
      .from("jobs")
      .update({ customer: toCustomer.name } as any)
      .eq("customer_id", toId);
    if (textErr) errors.push(`jobs.customer text: ${textErr.message}`);

    // Mark any matching merge suggestions as accepted
    await admin
      .from("customer_merge_suggestions")
      .update({ status: "accepted", reviewed_by: userId, reviewed_at: new Date().toISOString() } as any)
      .or(`new_customer_id.eq.${fromId},existing_customer_id.eq.${fromId}`)
      .eq("status", "pending");

    // Delete the now-empty source customer
    const { error: delErr } = await admin
      .from("customers")
      .delete()
      .eq("id", fromId);
    if (delErr) errors.push(`delete source customer: ${delErr.message}`);

    const undoSnapshot: UndoSnapshot = {
      from_customer: {
        id: fromCustomer.id,
        name: fromCustomer.name,
        address: fromCustomer.address ?? null,
        phone: fromCustomer.phone ?? null,
        email: fromCustomer.email ?? null,
        org_id: fromCustomer.org_id ?? null,
        xero_contact_id: fromCustomer.xero_contact_id ?? null,
        logo_url: fromCustomer.logo_url ?? null,
        accreditation_logos: fromCustomer.accreditation_logos ?? [],
        created_by: fromCustomer.created_by ?? null,
      },
      to_customer_id: toId!,
      to_was_created: toWasCreated,
      moved,
      job_customer_text: jobCustomerText,
    };

    return json({
      success: errors.length === 0,
      from: { id: fromCustomer.id, name: fromCustomer.name },
      to: { id: toCustomer.id, name: toCustomer.name },
      counts,
      total: totalRows,
      errors,
      undo_snapshot: undoSnapshot,
    }, errors.length === 0 ? 200 : 207);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reassign-customer error:", msg);
    return json({ error: msg }, 500);
  }
});

// Reverse a merge using the snapshot we returned earlier.
async function runUndo(admin: ReturnType<typeof createClient>, snap: UndoSnapshot) {
  const errors: string[] = [];

  // 1. Recreate the source customer with its original id (idempotent: skip if exists).
  const { data: existsRow } = await admin
    .from("customers")
    .select("id")
    .eq("id", snap.from_customer.id)
    .maybeSingle();

  if (!existsRow) {
    const { error: insErr } = await admin
      .from("customers")
      .insert({
        id: snap.from_customer.id,
        name: snap.from_customer.name,
        address: snap.from_customer.address,
        phone: snap.from_customer.phone,
        email: snap.from_customer.email,
        org_id: snap.from_customer.org_id,
        xero_contact_id: snap.from_customer.xero_contact_id,
        logo_url: snap.from_customer.logo_url,
        accreditation_logos: snap.from_customer.accreditation_logos,
        created_by: snap.from_customer.created_by,
      } as any);
    if (insErr) {
      return json({ error: `Could not restore customer: ${insErr.message}` }, 500);
    }
  }

  // 2. Re-point all moved rows back to the original customer id.
  for (const [table, ids] of Object.entries(snap.moved)) {
    if (!ids || ids.length === 0) continue;
    const { error: upErr } = await admin
      .from(table)
      .update({ customer_id: snap.from_customer.id } as any)
      .in("id", ids);
    if (upErr) errors.push(`${table}: ${upErr.message}`);
  }

  // 3. Restore jobs.customer text values.
  for (const [jobId, text] of Object.entries(snap.job_customer_text)) {
    const { error: textErr } = await admin
      .from("jobs")
      .update({ customer: text } as any)
      .eq("id", jobId);
    if (textErr) errors.push(`jobs.customer text (${jobId}): ${textErr.message}`);
  }

  // 4. If the merge created the target customer fresh, delete it on undo
  //    (only safe if nothing else now references it).
  if (snap.to_was_created) {
    const { count: refCount } = await admin
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", snap.to_customer_id);
    if ((refCount ?? 0) === 0) {
      await admin.from("customers").delete().eq("id", snap.to_customer_id);
    }
  }

  // 5. Re-open any merge suggestions that had been auto-accepted by the merge.
  await admin
    .from("customer_merge_suggestions")
    .update({ status: "pending", reviewed_at: null, reviewed_by: null } as any)
    .or(`new_customer_id.eq.${snap.from_customer.id},existing_customer_id.eq.${snap.from_customer.id}`)
    .eq("status", "accepted");

  return json({
    success: errors.length === 0,
    restored_customer_id: snap.from_customer.id,
    errors,
  }, errors.length === 0 ? 200 : 207);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
