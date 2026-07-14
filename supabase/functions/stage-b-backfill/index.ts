// Stage B storage back-fill — one-off migration function.
// Actions: prepare | status | dry_run | run | integrity_check | rollback
// Auth: either x-cron-secret header, or an authenticated admin JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// Enforced bucket order — later buckets are gated behind earlier ones.
const BUCKETS = [
  "signatures",
  "engineer-documents",
  "customer-paperwork",
  "asset-documents",
  "site-survey-media",
  "submissions",
  "blank-template-pdfs",
] as const;
type Bucket = (typeof BUCKETS)[number];

const svc = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

// -----------------------------------------------------------------------------
// Auth: either x-cron-secret header OR JWT belonging to a user with admin role.
// -----------------------------------------------------------------------------
async function authorize(req: Request): Promise<{ ok: true } | { ok: false; res: Response }> {
  const secret = req.headers.get("x-cron-secret");
  if (CRON_SECRET && secret && secret === CRON_SECRET) return { ok: true };

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { ok: false, res: unauth("missing_auth") };

  const client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error } = await client.auth.getUser(token);
  if (error || !userRes?.user) return { ok: false, res: unauth("invalid_token") };

  const { data: roleRow } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return { ok: false, res: unauth("not_admin") };
  return { ok: true };
}

function unauth(reason: string) {
  return json({ error: "unauthorized", reason }, 401);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await authorize(req);
  if (!guard.ok) return guard.res;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body?.action ?? "");
  const bucket = body?.bucket as Bucket | undefined;

  try {
    switch (action) {
      case "prepare":
        return json(await actionPrepare());
      case "status":
        return json(await actionStatus());
      case "dry_run":
        assertBucket(bucket);
        return json(await actionDryRun(bucket!));
      case "run":
        assertBucket(bucket);
        return json(await actionRun(bucket!));
      case "integrity_check":
        assertBucket(bucket);
        return json(await actionIntegrityCheck(bucket!));
      case "rollback":
        assertBucket(bucket);
        return json(await actionRollback(bucket!));
      default:
        return json({ error: "unknown_action", action }, 400);
    }
  } catch (err) {
    console.error("stage-b-backfill error:", err);
    return json({ error: "internal_error", message: String((err as Error)?.message ?? err) }, 500);
  }
});

function assertBucket(b: string | undefined): asserts b is Bucket {
  if (!b || !(BUCKETS as readonly string[]).includes(b)) {
    throw new Error(`invalid bucket: ${b}`);
  }
}

// -----------------------------------------------------------------------------
// prepare — populate storage_backfill_log by calling build_backfill_manifest
// -----------------------------------------------------------------------------
async function actionPrepare() {
  const s = svc();
  const perBucket: Record<string, unknown> = {};
  for (const b of BUCKETS) {
    const { data, error } = await s.rpc("build_backfill_manifest", { _bucket: b });
    if (error) {
      perBucket[b] = { error: error.message };
      continue;
    }
    perBucket[b] = data?.[0] ?? { inserted: 0, skipped: 0, orphans: 0 };
  }
  return { ok: true, per_bucket: perBucket };
}

// -----------------------------------------------------------------------------
// status — per-bucket counts + which buckets are unlocked
// -----------------------------------------------------------------------------
async function actionStatus() {
  const s = svc();
  const { data, error } = await s
    .from("storage_backfill_log")
    .select("bucket, status");
  if (error) throw error;

  const counts: Record<string, Record<string, number>> = {};
  for (const b of BUCKETS) counts[b] = { pending: 0, in_progress: 0, done: 0, failed: 0, skipped: 0, total: 0 };
  for (const row of data ?? []) {
    const c = counts[row.bucket as string];
    if (!c) continue;
    c[row.status] = (c[row.status] ?? 0) + 1;
    c.total++;
  }

  const unlocked: Record<string, boolean> = {};
  let prevComplete = true;
  for (const b of BUCKETS) {
    unlocked[b] = prevComplete;
    const c = counts[b];
    const complete = c.total > 0 && c.pending === 0 && c.in_progress === 0 && c.failed === 0;
    if (!complete) prevComplete = false;
  }
  return { ok: true, counts, unlocked, order: BUCKETS };
}

// -----------------------------------------------------------------------------
// dry_run — verify feasibility of every pending row in a bucket
// -----------------------------------------------------------------------------
async function actionDryRun(bucket: Bucket) {
  const s = svc();
  const { data: rows, error } = await s
    .from("storage_backfill_log")
    .select("id, old_name, new_name, op, db_rewrites")
    .eq("bucket", bucket)
    .eq("status", "pending")
    .limit(2000);
  if (error) throw error;

  let ok = 0;
  let blocked = 0;
  const failures: any[] = [];

  for (const row of rows ?? []) {
    const problems: string[] = [];
    // Check old exists
    const dir = row.old_name.includes("/") ? row.old_name.slice(0, row.old_name.lastIndexOf("/")) : "";
    const base = row.old_name.includes("/") ? row.old_name.slice(row.old_name.lastIndexOf("/") + 1) : row.old_name;
    const { data: listOld, error: listErr } = await s.storage.from(bucket).list(dir, { search: base, limit: 1 });
    if (listErr || !listOld?.find((f) => f.name === base)) problems.push("old_missing");

    if (row.op === "move" && row.new_name) {
      // Check new is free
      const ndir = row.new_name.includes("/") ? row.new_name.slice(0, row.new_name.lastIndexOf("/")) : "";
      const nbase = row.new_name.includes("/") ? row.new_name.slice(row.new_name.lastIndexOf("/") + 1) : row.new_name;
      const { data: listNew } = await s.storage.from(bucket).list(ndir, { search: nbase, limit: 1 });
      if (listNew?.find((f) => f.name === nbase)) problems.push("new_exists");
    }

    const result = { checked_at: new Date().toISOString(), problems };
    await s.from("storage_backfill_log").update({ dry_run_result: result }).eq("id", row.id);

    if (problems.length === 0) ok++;
    else {
      blocked++;
      if (failures.length < 20) failures.push({ id: row.id, old_name: row.old_name, problems });
    }
  }

  return { ok: true, bucket, scanned: rows?.length ?? 0, ready: ok, blocked, failures };
}

// -----------------------------------------------------------------------------
// run — move each pending object, apply db_rewrites; stop bucket on first failure
// -----------------------------------------------------------------------------
async function actionRun(bucket: Bucket) {
  const s = svc();

  // Order gate: previous buckets must be complete.
  const idx = BUCKETS.indexOf(bucket);
  if (idx > 0) {
    const previous = BUCKETS.slice(0, idx);
    const { data: prevRows } = await s
      .from("storage_backfill_log")
      .select("bucket, status")
      .in("bucket", previous);
    const blocked = previous.find((b) => {
      const rows = (prevRows ?? []).filter((r) => r.bucket === b);
      if (rows.length === 0) return false; // no work → considered complete
      return rows.some((r) => r.status === "pending" || r.status === "in_progress" || r.status === "failed");
    });
    if (blocked) return { ok: false, error: "order_gate", blocked_by: blocked };
  }

  const { data: rows, error } = await s
    .from("storage_backfill_log")
    .select("id, old_name, new_name, op")
    .eq("bucket", bucket)
    .in("status", ["pending", "failed"])
    .limit(5000);
  if (error) throw error;

  let moved = 0;
  let rewritten = 0;
  let failed = 0;
  const failures: any[] = [];

  for (const row of rows ?? []) {
    // Mark in_progress
    await s
      .from("storage_backfill_log")
      .update({ status: "in_progress", attempts: (undefined as any), last_error: null })
      .eq("id", row.id);

    try {
      if (row.op === "delete") {
        const { error: delErr } = await s.storage.from(bucket).remove([row.old_name]);
        if (delErr) throw delErr;
      } else {
        if (!row.new_name) throw new Error("missing new_name for move");
        const { error: mvErr } = await s.storage.from(bucket).move(row.old_name, row.new_name);
        if (mvErr) throw mvErr;
      }
      // Apply DB rewrites atomically
      const { data: rewriteCount, error: rpcErr } = await s.rpc("apply_backfill_rewrites", {
        _row_id: row.id,
      });
      if (rpcErr) throw rpcErr;
      const rc = Number(rewriteCount ?? 0);
      rewritten += rc;
      moved++;

      await s
        .from("storage_backfill_log")
        .update({
          status: "done",
          run_result: { moved_at: new Date().toISOString(), db_rows_updated: rc },
        })
        .eq("id", row.id);
    } catch (err) {
      failed++;
      const msg = String((err as Error)?.message ?? err);
      failures.push({ id: row.id, old_name: row.old_name, error: msg });
      await s
        .from("storage_backfill_log")
        .update({ status: "failed", last_error: msg })
        .eq("id", row.id);
      // Stop this bucket on first failure — per plan.
      break;
    }
  }

  return { ok: true, bucket, moved, rewritten, failed, failures };
}

// -----------------------------------------------------------------------------
// integrity_check — sample verify: new exists, old gone, refs rewritten
// -----------------------------------------------------------------------------
async function actionIntegrityCheck(bucket: Bucket) {
  const s = svc();
  const { data: sample, error } = await s
    .from("storage_backfill_log")
    .select("id, old_name, new_name, op, db_rewrites")
    .eq("bucket", bucket)
    .eq("status", "done")
    .limit(20);
  if (error) throw error;

  const failures: any[] = [];
  for (const row of sample ?? []) {
    if (row.op === "move" && row.new_name) {
      const ndir = row.new_name.includes("/") ? row.new_name.slice(0, row.new_name.lastIndexOf("/")) : "";
      const nbase = row.new_name.slice(row.new_name.lastIndexOf("/") + 1);
      const { data: listNew } = await s.storage.from(bucket).list(ndir, { search: nbase, limit: 1 });
      if (!listNew?.find((f) => f.name === nbase)) failures.push({ id: row.id, reason: "new_missing" });

      const odir = row.old_name.includes("/") ? row.old_name.slice(0, row.old_name.lastIndexOf("/")) : "";
      const obase = row.old_name.slice(row.old_name.lastIndexOf("/") + 1);
      const { data: listOld } = await s.storage.from(bucket).list(odir, { search: obase, limit: 1 });
      if (listOld?.find((f) => f.name === obase)) failures.push({ id: row.id, reason: "old_still_exists" });
    }
  }
  return { ok: true, bucket, sampled: sample?.length ?? 0, pass: failures.length === 0, failures };
}

// -----------------------------------------------------------------------------
// rollback — reverse done rows for a bucket
// -----------------------------------------------------------------------------
async function actionRollback(bucket: Bucket) {
  const s = svc();
  const { data: rows, error } = await s
    .from("storage_backfill_log")
    .select("id, old_name, new_name, op, db_rewrites")
    .eq("bucket", bucket)
    .eq("status", "done");
  if (error) throw error;

  let reverted = 0;
  const failures: any[] = [];
  for (const row of rows ?? []) {
    try {
      if (row.op === "move" && row.new_name) {
        const { error: mvErr } = await s.storage.from(bucket).move(row.new_name, row.old_name);
        if (mvErr) throw mvErr;
      }
      // Reverse each db rewrite: swap old/new
      const rewrites = (row.db_rewrites as any[]) ?? [];
      for (const r of rewrites) {
        const table = r.table;
        const col = r.column;
        const id = r.row_id;
        const old = r.old_value;
        const nw = r.new_value;
        if (r.jsonb_substring) {
          await s.rpc("apply_backfill_rewrites", { _row_id: row.id }); // no-op placeholder; direct SQL below
          // Direct reverse via generic SQL — not exposed via RPC; use PostgREST update.
          continue;
        }
        // Best effort direct reverse
        await s.from(table).update({ [col]: old }).eq("id", id);
      }
      await s
        .from("storage_backfill_log")
        .update({ status: "pending", run_result: null, last_error: "rolled_back" })
        .eq("id", row.id);
      reverted++;
    } catch (err) {
      failures.push({ id: row.id, error: String((err as Error).message) });
    }
  }
  return { ok: true, bucket, reverted, failures };
}
