import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_DAILY_CAP = 200;
const MAX_QUERIES = 4;
const MAX_ROWS = 50;
const MAX_RECEIPTS = 12;

/* ------------------------------------------------------------------ *
 * QUERY SAFETY: a closed whitelist. The model never writes SQL — it
 * fills in a tiny JSON shape that we validate field-by-field and then
 * execute through PostgREST **as the signed-in user**, so RLS does the
 * org scoping. There is no code path here that can write data.
 * ------------------------------------------------------------------ */

type TableSpec = {
  columns: string[];
  searchColumns: string[];
  defaultOrder?: { column: string; ascending: boolean };
  link?: (row: Record<string, unknown>) => string | null;
  label: (row: Record<string, unknown>) => string;
};

const TABLES: Record<string, TableSpec> = {
  jobs: {
    columns: [
      "id", "reference_number", "name", "customer", "customer_id", "site_id", "status",
      "category", "priority", "job_type", "due_date", "created_at", "completed_at",
      "completed_by", "result", "brief", "customer_po", "is_remedial", "address",
      "detected_work_types", "allocated_days", "source", "contract_id",
    ],
    searchColumns: ["reference_number", "name", "customer", "address", "customer_po", "brief"],
    defaultOrder: { column: "created_at", ascending: false },
    link: (r) => (r.id ? `/jobs/${r.id}` : null),
    label: (r) => [r.reference_number, r.name].filter(Boolean).join(" — ") || "Job",
  },
  customers: {
    columns: ["id", "name", "email", "phone", "address", "created_at"],
    searchColumns: ["name", "email", "address"],
    defaultOrder: { column: "name", ascending: true },
    link: (r) => (r.id ? `/customers/${r.id}` : null),
    label: (r) => String(r.name ?? "Customer"),
  },
  sites: {
    columns: [
      "id", "name", "address", "postcode", "site_type", "category", "riser_location",
      "outlets_count", "what3words", "contact_name", "contact_phone", "contact_email",
      "notes", "created_at", "parent_id",
    ],
    searchColumns: ["name", "address", "postcode", "contact_name"],
    defaultOrder: { column: "name", ascending: true },
    link: () => "/sites",
    label: (r) => String(r.name ?? "Site"),
  },
  defects: {
    columns: [
      "id", "title", "description", "severity", "status", "category", "site_id", "job_id",
      "asset_id", "remedial_job_id", "location_on_site", "bs_standard_reference",
      "resolution_notes", "created_at", "resolved_at",
    ],
    searchColumns: ["title", "description", "location_on_site", "category"],
    defaultOrder: { column: "created_at", ascending: false },
    link: () => "/defects",
    label: (r) => String(r.title ?? "Defect"),
  },
  assets: {
    columns: [
      "id", "name", "asset_tag", "category", "asset_type", "site_id", "status",
      "install_date", "warranty_expiry", "riser_location", "outlets_count", "make",
      "model", "serial_number", "last_inspection_at", "last_inspection_type",
      "last_inspection_result", "created_at",
    ],
    searchColumns: ["name", "asset_tag", "serial_number", "make", "model"],
    defaultOrder: { column: "name", ascending: true },
    link: (r) => (r.id ? `/assets/${r.id}` : null),
    label: (r) => String(r.name ?? r.asset_tag ?? "Asset"),
  },
  service_contracts: {
    columns: [
      "id", "reference_number", "name", "customer_id", "start_date", "renewal_date",
      "contract_value", "billing_frequency", "status", "notes", "created_at",
    ],
    searchColumns: ["reference_number", "name", "notes"],
    defaultOrder: { column: "renewal_date", ascending: true },
    link: (r) => (r.id ? `/contracts/${r.id}` : null),
    label: (r) => [r.reference_number, r.name].filter(Boolean).join(" — ") || "Contract",
  },
  job_visits: {
    columns: [
      "id", "job_id", "engineer_id", "scheduled_date", "scheduled_time", "status",
      "completed_at", "notes", "created_at",
    ],
    searchColumns: ["notes"],
    defaultOrder: { column: "scheduled_date", ascending: false },
    link: () => "/planner",
    label: (r) => `Visit ${r.scheduled_date ?? ""}`.trim(),
  },
  job_assignments: {
    columns: ["id", "job_id", "engineer_id", "assigned_at"],
    searchColumns: [],
    defaultOrder: { column: "assigned_at", ascending: false },
    link: () => "/planner",
    label: () => "Assignment",
  },
  archived_documents: {
    columns: [
      "id", "title", "document_type", "document_date", "template_name", "customer_id",
      "site_id", "site_name", "site_address", "status", "filed_at", "page_count",
      "notes", "created_at",
    ],
    searchColumns: ["title", "document_type", "template_name", "site_name", "notes"],
    defaultOrder: { column: "document_date", ascending: false },
    link: () => "/archive",
    label: (r) => String(r.title ?? r.template_name ?? "Archived document"),
  },
  job_sheet_responses: {
    columns: ["id", "job_id", "template_id", "status", "submitted_at", "submitted_by", "created_at", "last_amended_at"],
    searchColumns: [],
    defaultOrder: { column: "created_at", ascending: false },
    link: () => null,
    label: () => "Job sheet",
  },
  profiles: {
    columns: ["id", "user_id", "full_name", "created_at"],
    searchColumns: ["full_name"],
    defaultOrder: { column: "full_name", ascending: true },
    link: () => "/engineers",
    label: (r) => String(r.full_name ?? "Team member"),
  },
};

const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is_null", "not_null"] as const;
type Op = typeof OPS[number];

type QuerySpec = {
  id?: string;
  table: string;
  mode?: "rows" | "count";
  filters?: Array<{ column: string; op: Op; value?: unknown }>;
  search?: { value: string };
  order?: { column: string; ascending?: boolean };
  limit?: number;
};

function validateSpec(spec: QuerySpec): { ok: true; spec: Required<Pick<QuerySpec, "table">> & QuerySpec } | { ok: false; error: string } {
  if (!spec || typeof spec !== "object") return { ok: false, error: "Malformed query." };
  const t = TABLES[spec.table];
  if (!t) return { ok: false, error: `Table "${spec.table}" is not available to the assistant.` };
  if (spec.mode && spec.mode !== "rows" && spec.mode !== "count") return { ok: false, error: "Invalid mode." };

  for (const f of spec.filters ?? []) {
    if (!t.columns.includes(f.column)) return { ok: false, error: `Column "${f.column}" is not available on ${spec.table}.` };
    if (!OPS.includes(f.op)) return { ok: false, error: `Operator "${f.op}" is not allowed.` };
    if (f.op === "in") {
      if (!Array.isArray(f.value) || f.value.length === 0 || f.value.length > 40) return { ok: false, error: "Invalid list value." };
      if (f.value.some((v) => typeof v === "object")) return { ok: false, error: "Invalid list value." };
    } else if (f.op !== "is_null" && f.op !== "not_null") {
      const ty = typeof f.value;
      if (ty !== "string" && ty !== "number" && ty !== "boolean") return { ok: false, error: "Invalid filter value." };
      if (ty === "string" && (f.value as string).length > 200) return { ok: false, error: "Filter value too long." };
    }
  }
  if (spec.order && !t.columns.includes(spec.order.column)) return { ok: false, error: `Cannot sort by "${spec.order.column}".` };
  if (spec.search && typeof spec.search.value !== "string") return { ok: false, error: "Invalid search value." };
  return { ok: true, spec };
}

function escapeOrValue(v: string) {
  // PostgREST `or=` list is comma separated; strip separators & wildcards we don't want.
  return v.replace(/[,()*%]/g, " ").trim();
}

async function runSpec(db: any, spec: QuerySpec) {
  const t = TABLES[spec.table];
  const limit = Math.min(Math.max(Number(spec.limit) || 20, 1), MAX_ROWS);
  const isCount = spec.mode === "count";

  let q = isCount
    ? db.from(spec.table).select("*", { count: "exact", head: true })
    : db.from(spec.table).select(t.columns.join(","));

  for (const f of spec.filters ?? []) {
    switch (f.op) {
      case "is_null": q = q.is(f.column, null); break;
      case "not_null": q = q.not(f.column, "is", null); break;
      case "in": q = q.in(f.column, f.value as unknown[]); break;
      case "ilike": q = q.ilike(f.column, `%${String(f.value).replace(/[%]/g, "")}%`); break;
      default: q = (q as any)[f.op](f.column, f.value);
    }
  }

  const term = spec.search?.value ? escapeOrValue(spec.search.value) : "";
  if (term && t.searchColumns.length) {
    q = q.or(t.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
  }

  if (!isCount) {
    const ord = spec.order ?? t.defaultOrder;
    if (ord) q = q.order(ord.column, { ascending: ord.ascending ?? true, nullsFirst: false });
    q = q.limit(limit);
  }

  const { data, error, count } = await q;
  if (error) return { table: spec.table, error: error.message };
  return isCount
    ? { table: spec.table, mode: "count", count: count ?? 0 }
    : { table: spec.table, mode: "rows", row_count: (data ?? []).length, rows: data ?? [] };
}

/* --------------------------- name hydration --------------------------- */

async function hydrate(db: any, results: any[]) {
  const customerIds = new Set<string>();
  const siteIds = new Set<string>();
  const jobIds = new Set<string>();
  const userIds = new Set<string>();

  for (const r of results) {
    for (const row of r.rows ?? []) {
      if (row.customer_id) customerIds.add(row.customer_id);
      if (row.site_id) siteIds.add(row.site_id);
      if (row.job_id) jobIds.add(row.job_id);
      if (row.remedial_job_id) jobIds.add(row.remedial_job_id);
      for (const k of ["engineer_id", "submitted_by", "completed_by"]) {
        if (row[k]) userIds.add(row[k]);
      }
    }
  }

  const maps = { customers: {} as any, sites: {} as any, jobs: {} as any, people: {} as any };
  const take = (s: Set<string>) => Array.from(s).slice(0, 200);

  await Promise.all([
    customerIds.size
      ? db.from("customers").select("id,name").in("id", take(customerIds)).then(({ data }: any) =>
          (data ?? []).forEach((c: any) => (maps.customers[c.id] = c.name)))
      : null,
    siteIds.size
      ? db.from("sites").select("id,name,address").in("id", take(siteIds)).then(({ data }: any) =>
          (data ?? []).forEach((s: any) => (maps.sites[s.id] = s.name)))
      : null,
    jobIds.size
      ? db.from("jobs").select("id,reference_number,name").in("id", take(jobIds)).then(({ data }: any) =>
          (data ?? []).forEach((j: any) => (maps.jobs[j.id] = { ref: j.reference_number, name: j.name })))
      : null,
    userIds.size
      ? db.from("profiles").select("user_id,full_name").in("user_id", take(userIds)).then(({ data }: any) =>
          (data ?? []).forEach((p: any) => (maps.people[p.user_id] = p.full_name)))
      : null,
  ]);

  for (const r of results) {
    for (const row of r.rows ?? []) {
      if (row.customer_id && maps.customers[row.customer_id]) row.customer_name = maps.customers[row.customer_id];
      if (row.site_id && maps.sites[row.site_id]) row.site_name_resolved = maps.sites[row.site_id];
      if (row.job_id && maps.jobs[row.job_id]) row.job_reference = maps.jobs[row.job_id].ref;
      if (row.remedial_job_id && maps.jobs[row.remedial_job_id]) row.remedial_job_reference = maps.jobs[row.remedial_job_id].ref;
      for (const k of ["engineer_id", "submitted_by", "completed_by"]) {
        if (row[k] && maps.people[row[k]]) row[`${k}_name`] = maps.people[row[k]];
      }
    }
  }
  return maps;
}

/* --------------------------- receipts --------------------------- */

function buildReceipts(results: any[]) {
  const seen = new Set<string>();
  const receipts: Array<{ label: string; url: string; description: string }> = [];
  for (const r of results) {
    const t = TABLES[r.table];
    if (!t) continue;
    for (const row of r.rows ?? []) {
      const url = t.link?.(row);
      if (!url) continue;
      const label = t.label(row);
      const key = `${url}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bits = [row.customer_name, row.site_name_resolved ?? row.site_name, row.status].filter(Boolean);
      receipts.push({ label: label.slice(0, 70), url, description: bits.join(" · ").slice(0, 90) || r.table });
      if (receipts.length >= MAX_RECEIPTS) return receipts;
    }
  }
  return receipts;
}

/* --------------------------- prompts --------------------------- */

function schemaDoc() {
  return Object.entries(TABLES)
    .map(([name, t]) => `- ${name}: ${t.columns.join(", ")}${t.searchColumns.length ? `\n  free-text search covers: ${t.searchColumns.join(", ")}` : ""}`)
    .join("\n");
}

const PLANNER_SYSTEM = (today: string) => `You are the Servexa Assistant's DATA mode. You answer questions about the signed-in user's OWN organisation's operational data.

Today's date is ${today} (UK, en-GB). All dates are ISO (YYYY-MM-DD) in the database.

You do NOT write SQL. You call the plan_queries tool with a small JSON query shape that the server validates and runs READ-ONLY, as the signed-in user, so their organisation's access rules apply automatically.

AVAILABLE TABLES AND COLUMNS (nothing else exists for you):
${schemaDoc()}

USEFUL VALUES:
- jobs.status: pending_review, active, completed, requires_revisit, rejected
- jobs.category examples: dry_riser_service, dry_riser_visual, dry_riser_pressure_test, dry_riser_installation, dry_riser_remedial, sprinkler_service, sprinkler_remedial, commercial_sprinkler_service, extinguisher_service, wet_riser_annual_service, pressure_test, general
- For a FAMILY of work ("dry riser work", "sprinkler jobs") use ilike on category with the stem, e.g. category ilike "dry_riser" — do not guess one exact value.
- jobs.completed_at is NULL on some older completed jobs. For "what did we complete in <period>", filter status eq completed and use completed_at for the period, but ALSO run a second query on created_at for that period so nothing with a missing completion date is silently dropped; mention in the answer if a record had no completion date recorded.
- defects.status: open, quoted, resolved. defects.severity: low, medium, high
- job_visits.status: upcoming, completed
- Engineers are people in profiles (full_name). To count an engineer's work: find their profiles.user_id by name, then filter job_visits.engineer_id / jobs.completed_by.
- "Renewals" = service_contracts.renewal_date.
- IDs are UUIDs — never guess one. To filter by a customer/site name, first query customers/sites by name, then filter by the returned id (you get two rounds: plan a lookup, you will see results and may plan again).

FILTER OPERATORS: eq, neq, gt, gte, lt, lte, ilike (contains, case-insensitive), in, is_null, not_null.

RULES:
1. READ-ONLY. There is no way to create, change or delete anything. If the user asks you to DO something (book a job, assign an engineer, delete/close a record, send an email), call respond and politely explain that the assistant can currently look things up and that actions are coming in a later release — then offer a link to the right page.
2. Never ask about, or attempt to reach, another organisation's data. If asked, call respond and decline briefly.
3. If the question is genuinely ambiguous (e.g. two customers could match), call respond with ONE short clarifying question.
4. If the question is a "how do I…" product/how-to question rather than a question about their records, call use_help_notes.
5. Otherwise call plan_queries with 1-${MAX_QUERIES} queries. Use mode "count" when the user only wants a number. Keep limits small (default 20, max ${MAX_ROWS}).
6. Never invent records, references or numbers.`;

const ANSWER_SYSTEM = (today: string) => `You are the Servexa Assistant answering a question about the user's own organisation's data. Today is ${today}. Use en-GB spelling.

You are given the exact rows returned by the read-only queries. Rules:
1. Use ONLY these rows. Never invent a record, reference number, name, date or total. If the rows are empty, say plainly that nothing matched, and suggest how they might widen the search.
2. Be concise: a one-line answer, then a short bullet or numbered list of the specific records (max 8), each with its reference/name and the one or two facts that matter (status, date, site, customer).
3. Counts must be arithmetic on the rows/count values given — never estimated.
4. Do not include raw UUIDs.
5. The app shows the matching records as tappable links underneath your answer, so don't paste URLs — you may say "tap a record below to open it".`;

const RESPOND_TOOL = {
  type: "function",
  function: {
    name: "respond",
    description: "Reply directly without querying data (clarifying question, refusal, or decline of an action request).",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string" },
        quick_actions: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, url: { type: "string" }, description: { type: "string" } },
            required: ["label", "url", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["message", "quick_actions"],
      additionalProperties: false,
    },
  },
};

const HELP_TOOL = {
  type: "function",
  function: {
    name: "use_help_notes",
    description: "The question is a product how-to question, not a question about the organisation's records. Hand it to the help-notes assistant.",
    parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"], additionalProperties: false },
  },
};

const PLAN_TOOL = {
  type: "function",
  function: {
    name: "plan_queries",
    description: "Run 1-4 validated read-only lookups over the whitelisted tables.",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              table: { type: "string" },
              mode: { type: "string", enum: ["rows", "count"] },
              limit: { type: "number" },
              search: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
              order: {
                type: "object",
                properties: { column: { type: "string" }, ascending: { type: "boolean" } },
                required: ["column", "ascending"],
                additionalProperties: false,
              },
              filters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    column: { type: "string" },
                    op: { type: "string", enum: OPS as unknown as string[] },
                    value_text: { type: "string" },
                    value_list: { type: "array", items: { type: "string" } },
                  },
                  required: ["column", "op"],
                  additionalProperties: false,
                },
              },
            },
            required: ["table"],
            additionalProperties: false,
          },
        },
      },
      required: ["queries"],
      additionalProperties: false,
    },
  },
};

const ANSWER_TOOL = {
  type: "function",
  function: {
    name: "final_answer",
    description: "Compose the final grounded answer from the query results.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false,
    },
  },
};

async function callAi(apiKey: string, body: Record<string, unknown>) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", stream: false, ...body }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(text.slice(0, 300)), { status: resp.status });
  }
  const raw = await resp.text();
  let toolName = "";
  let toolArgs = "";
  let content = "";
  const ct = resp.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream") || raw.startsWith("data:") || raw.startsWith(": OPENROUTER")) {
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") continue;
      try {
        const chunk = JSON.parse(json);
        const delta = chunk.choices?.[0]?.delta;
        const tc = delta?.tool_calls?.[0];
        if (tc?.function?.name) toolName = tc.function.name;
        if (tc?.function?.arguments) toolArgs += tc.function.arguments;
        if (delta?.content) content += delta.content;
      } catch { /* partial */ }
    }
  } else {
    const data = JSON.parse(raw);
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (tc?.function?.name) toolName = tc.function.name;
    if (tc?.function?.arguments) toolArgs = tc.function.arguments;
    content = data.choices?.[0]?.message?.content ?? "";
  }
  let args: any = {};
  try { args = toolArgs ? JSON.parse(toolArgs) : {}; } catch { /* ignore */ }
  return { toolName, args, content };
}

function normaliseFilters(raw: any[]): QuerySpec["filters"] {
  return (raw ?? []).map((f: any) => {
    if (f.op === "in") return { column: f.column, op: f.op, value: f.value_list ?? [] };
    if (f.op === "is_null" || f.op === "not_null") return { column: f.column, op: f.op };
    return { column: f.column, op: f.op, value: f.value_text };
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // The ONLY client used for data questions: anon key + the caller's JWT, so
  // every query runs under their RLS policies (org scoped). Never service role.
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  try {
    const { messages, currentPage } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured." }, 500);

    // Org id via RLS-safe helper (returns the caller's own org only).
    const { data: orgId } = await db.rpc("get_user_org_id");
    if (!orgId) return json({ error: "No organisation found for your account." }, 403);

    /* ------------------- cost control: per-org daily cap ------------------- */
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const today = new Date().toISOString().slice(0, 10);

    let cap = DEFAULT_DAILY_CAP;
    const { data: capRow } = await admin
      .from("app_settings").select("value").eq("org_id", orgId).eq("key", "ai_data_daily_cap").maybeSingle();
    const capVal = Number((capRow as any)?.value?.limit ?? (capRow as any)?.value);
    if (Number.isFinite(capVal) && capVal > 0) cap = capVal;

    const { data: usageRow } = await admin
      .from("ai_data_usage").select("question_count").eq("org_id", orgId).eq("usage_date", today).maybeSingle();
    const used = (usageRow as any)?.question_count ?? 0;
    if (used >= cap) {
      return json({
        message: `You've reached today's limit of ${cap} data questions for your organisation. The counter resets at midnight — in the meantime I can still answer "how do I…" questions from the help notes.`,
        quick_actions: [],
        receipts: [],
        limit_reached: true,
      });
    }
    await admin.from("ai_data_usage").upsert(
      { org_id: orgId, usage_date: today, question_count: used + 1, updated_at: new Date().toISOString() },
      { onConflict: "org_id,usage_date" },
    );

    /* ------------------------------ plan ------------------------------ */
    const convo = (messages ?? []).slice(-8);
    const planMessages: any[] = [
      { role: "system", content: `${PLANNER_SYSTEM(today)}\n\nThe user is currently on: ${currentPage || "(unknown page)"}.` },
      ...convo,
    ];

    const results: any[] = [];
    let rounds = 0;

    while (rounds < 2) {
      rounds++;
      const plan = await callAi(LOVABLE_API_KEY, {
        messages: planMessages,
        tools: [PLAN_TOOL, RESPOND_TOOL, HELP_TOOL],
        tool_choice: "required",
      });

      if (plan.toolName === "use_help_notes") {
        return json({ route: "help", message: "", quick_actions: [], receipts: [] });
      }
      if (plan.toolName === "respond") {
        return json({
          message: plan.args.message || plan.content || "Could you rephrase that?",
          quick_actions: plan.args.quick_actions ?? [],
          receipts: [],
        });
      }
      if (plan.toolName !== "plan_queries") break;

      const specs: QuerySpec[] = (plan.args.queries ?? []).slice(0, MAX_QUERIES).map((q: any) => ({
        table: q.table,
        mode: q.mode === "count" ? "count" : "rows",
        limit: q.limit,
        search: q.search,
        order: q.order,
        filters: normaliseFilters(q.filters),
      }));

      const roundResults: any[] = [];
      for (const spec of specs) {
        const check = validateSpec(spec);
        if (!check.ok) { roundResults.push({ table: spec.table, error: check.error }); continue; }
        roundResults.push(await runSpec(db, spec));
      }
      await hydrate(db, roundResults);
      results.push(...roundResults);

      // Feed the results back so the model can do one follow-up round (e.g. it
      // looked up a customer id and now wants that customer's jobs).
      planMessages.push({ role: "assistant", content: `[ran queries]\n${JSON.stringify(roundResults).slice(0, 12000)}` });
      planMessages.push({
        role: "user",
        content: rounds < 2
          ? "Those are the results. If you now have everything needed to answer, reply with the respond tool ONLY if no data is needed; otherwise call plan_queries once more for the final data you need. Do not repeat identical queries."
          : "Final results above.",
      });

      // If the model asked for rows and got them with no dangling id lookups, stop early.
      if (roundResults.some((r) => (r.row_count ?? 0) > 0 || r.mode === "count")) {
        if (rounds >= 1 && !specs.some((s) => s.table === "customers" || s.table === "sites" || s.table === "profiles")) break;
      }
    }

    /* ------------------------------ answer ------------------------------ */
    const receipts = buildReceipts(results);
    const payload = JSON.stringify(results).slice(0, 24000);

    const answer = await callAi(LOVABLE_API_KEY, {
      messages: [
        { role: "system", content: ANSWER_SYSTEM(today) },
        ...convo,
        { role: "user", content: `QUERY RESULTS (the only facts you may use):\n${payload}` },
      ],
      tools: [ANSWER_TOOL],
      tool_choice: { type: "function", function: { name: "final_answer" } },
    });

    const message = answer.args.message || answer.content ||
      "I couldn't find anything matching that in your records.";

    return json({ message, quick_actions: [], receipts, used: used + 1, cap });
  } catch (e: any) {
    if (e?.status === 429) return json({ error: "Rate limit reached. Please try again in a moment." }, 429);
    if (e?.status === 402) return json({ error: "AI usage limit reached. Please top up credits." }, 402);
    console.error("ai-data-assistant error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
