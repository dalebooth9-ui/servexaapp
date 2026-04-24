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

const RELATED_TABLES = [
  "jobs",
  "customer_documents",
  "customer_paperwork",
  "customer_portal_tokens",
  "customer_sites",
  "fire_log_tokens",
  "handover_tokens",
] as const;

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
