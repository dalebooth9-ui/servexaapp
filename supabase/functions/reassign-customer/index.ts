import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReassignBody {
  from_customer_id: string;
  to_customer_id?: string | null;
  to_customer_name?: string | null;
  /** Preview only — return counts but make no writes. */
  dry_run?: boolean;
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

    // Load source customer
    const { data: fromCustomer, error: fromErr } = await admin
      .from("customers")
      .select("id, name, address, phone, email, org_id")
      .eq("id", fromId)
      .maybeSingle();
    if (fromErr || !fromCustomer) {
      return json({ error: "Source customer not found" }, 404);
    }

    // Resolve target: by id, then by exact name (case-insensitive), then create.
    let toCustomer: any = null;
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
            // Inherit contact details + org from the source as a sensible default
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
      } else {
        // Dry run with a name that doesn't exist — synthesize a placeholder
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

    // Mark any matching merge suggestions as accepted (so they disappear from the
    // pending queue). Best-effort; ignore errors.
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

    return json({
      success: errors.length === 0,
      from: { id: fromCustomer.id, name: fromCustomer.name },
      to: { id: toCustomer.id, name: toCustomer.name },
      counts,
      total: totalRows,
      errors,
    }, errors.length === 0 ? 200 : 207);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reassign-customer error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
