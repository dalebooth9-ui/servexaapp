import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_FILES = 1500;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024; // 400MB of source files in total
const PART_BYTES = 25 * 1024 * 1024; // flush a zip part every ~35MB (edge memory safety)
const DAILY_LIMIT = 3;
const LINK_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ---------- helpers ----------

const safe = (s: unknown, fallback = "Unfiled") => {
  const v = String(s ?? "").trim();
  if (!v) return fallback;
  return v.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 80);
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

function parseRef(input: string | null | undefined, defaultBucket: string) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (raw.startsWith("storage://")) {
    const rest = raw.slice("storage://".length);
    const i = rest.indexOf("/");
    if (i < 1) return null;
    return { bucket: rest.slice(0, i), path: rest.slice(i + 1) };
  }
  const m = raw.match(/\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  if (/^https?:\/\//i.test(raw)) return null;
  return { bucket: defaultBucket, path: raw };
}

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  // Store-only (level 0): PDFs/images are already compressed and the edge CPU budget is tight.
  // zipSync: fflate's async path spawns a Worker, which the edge runtime lacks.
  return Promise.resolve(zipSync(files, { level: 0 }));
}

// ---------- export worker ----------

async function runExport(exportId: string, orgId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};
  const notes: string[] = [];
  let bytes = 0;

  const setStatus = async (patch: Record<string, unknown>) => {
    await admin.from("data_exports").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", exportId);
  };

  const fetchAll = async (table: string, select: string, orderCol = "created_at") => {
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from(table)
        .select(select)
        .eq("org_id", orgId)
        .order(orderCol, { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  try {
    await setStatus({ status: "running", stage: "Collecting records", progress: 5 });

    const [customers, sites, jobs, defects, quotes, renewals, archived] = await Promise.all([
      fetchAll("customers", "id,name,address,phone,email,created_at"),
      fetchAll("sites", "id,name,address,postcode,contact_name,contact_phone,contact_email,what3words,parent_id,created_at"),
      fetchAll(
        "jobs",
        "id,reference_number,name,customer,customer_id,site_id,status,priority,category,job_type,due_date,customer_po,completed_at,created_at",
      ),
      fetchAll(
        "defects",
        "id,title,description,severity,status,location_on_site,site_id,job_id,created_at,resolved_at",
      ),
      fetchAll(
        "invoices",
        "id,invoice_number,document_type,customer_name,status,subtotal,tax_amount,total,due_date,sent_at,created_at",
      ),
      fetchAll("service_contract_renewals", "id,contract_id,previous_renewal_date,new_renewal_date,previous_value,new_value,applied_increase_pct,renewed_at", "renewed_at"),
      fetchAll(
        "archived_documents",
        "id,customer_id,site_id,site_name,title,template_name,document_type,document_date,file_paths,report_pdf_path,created_at",
      ),
    ]);

    const custName = new Map(customers.map((c: any) => [c.id, c.name]));
    const siteName = new Map(sites.map((s: any) => [s.id, s.name]));

    const csvs: Record<string, any[]> = {
      customers,
      sites,
      jobs,
      defects,
      quotes: quotes.filter((q: any) => q.document_type === "quote"),
      invoices: quotes.filter((q: any) => q.document_type !== "quote"),
      renewals,
      archived_documents: archived.map((a: any) => ({ ...a, file_paths: (a.file_paths || []).length })),
    };
    for (const [name, rows] of Object.entries(csvs)) {
      counts[name] = rows.length;
      const csv = toCsv(rows as Record<string, unknown>[]);
      if (csv) files[`csv/${name}.csv`] = new TextEncoder().encode("\uFEFF" + csv);
    }

    await setStatus({ stage: "Collecting documents", progress: 20, counts });

    // Build the file manifest: archived documents + job documents.
    type Item = { bucket: string; path: string; zipPath: string };
    const items: Item[] = [];
    const seen = new Set<string>();
    const push = (ref: { bucket: string; path: string } | null, folder: string, name: string) => {
      if (!ref || items.length >= MAX_FILES) return;
      const key = `${ref.bucket}/${ref.path}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ ...ref, zipPath: `${folder}/${name}` });
    };

    for (const a of archived as any[]) {
      const folder = `documents/${safe(custName.get(a.customer_id))}/${safe(a.site_name || siteName.get(a.site_id))}/archive`;
      const base = safe(a.title || a.template_name || "document") + "-" + String(a.id).slice(0, 8);
      if (a.report_pdf_path) push(parseRef(a.report_pdf_path, "submissions"), folder, `${base}.pdf`);
      (a.file_paths || []).forEach((p: string, i: number) => {
        const ext = (p.split(".").pop() || "bin").slice(0, 5);
        push(parseRef(p, "submissions"), `${folder}/scans`, `${base}-page-${i + 1}.${ext}`);
      });
    }

    const jobById = new Map(jobs.map((j: any) => [j.id, j]));
    const jobDocs = await fetchAll("job_documents", "id,job_id,file_name,file_url,document_type,created_at");
    counts.job_documents = jobDocs.length;
    for (const d of jobDocs as any[]) {
      const j: any = jobById.get(d.job_id);
      const folder = `documents/${safe(j?.customer || custName.get(j?.customer_id))}/${safe(siteName.get(j?.site_id))}/${safe(j?.reference_number || "job")}`;
      push(parseRef(d.file_url, "submissions"), folder, safe(d.file_name || `${d.id}.bin`, "file.bin"));
    }

    await setStatus({ stage: `Packaging ${items.length} files`, progress: 30, counts });

    const stamp = new Date().toISOString().slice(0, 10);
    const parts: Array<{ path: string; size: number; name: string }> = [];
    let partNo = 0;
    let partBytes = 0;
    let fileCount = 0;

    const flush = async (last: boolean) => {
      if (!Object.keys(files).length) return;
      partNo++;
      const zipped = await zipAsync(files);
      for (const k of Object.keys(files)) delete files[k];
      partBytes = 0;
      const name = `servexa-export-${stamp}-${exportId.slice(0, 8)}${last && partNo === 1 ? "" : `-part${partNo}`}.zip`;
      const path = `${orgId}/${name}`;
      const { error: upErr } = await admin.storage
        .from("data-exports")
        .upload(path, zipped, { contentType: "application/zip", upsert: true });
      if (upErr) throw new Error(upErr.message);
      parts.push({ path, size: zipped.byteLength, name });
      await setStatus({ parts, stage: `Packaged part ${partNo}` });
    };

    const readme = () =>
      new TextEncoder().encode(
        [
          "Servexa data export",
          `Generated: ${new Date().toISOString()}`,
          "",
          "csv/            spreadsheet exports of your records (open in Excel)",
          "documents/      your PDFs and scans, foldered by customer / site / job",
          "",
          "Large exports are split into several zip parts — download them all;",
          "each part holds a different set of your documents.",
          "",
          ...notes,
        ].join("\n"),
      );

    let done = 0;
    let skipped = 0;
    for (const item of items) {
      if (bytes >= MAX_TOTAL_BYTES) {
        notes.push(
          `Stopped adding files at ${Math.round(bytes / 1048576)}MB — run another export or contact support for the remainder.`,
        );
        break;
      }
      try {
        const { data, error } = await admin.storage.from(item.bucket).download(item.path);
        if (error || !data) {
          skipped++;
        } else {
          const buf = new Uint8Array(await data.arrayBuffer());
          bytes += buf.byteLength;
          partBytes += buf.byteLength;
          fileCount++;
          let zp = item.zipPath;
          let n = 2;
          while (files[zp]) zp = item.zipPath.replace(/(\.[^.]*)?$/, `-${n++}$1`);
          files[zp] = buf;
        }
      } catch {
        skipped++;
      }
      done++;
      if (partBytes >= PART_BYTES) await flush(false);
      if (done % 25 === 0) {
        await setStatus({
          stage: `Packaging files (${done}/${items.length})`,
          progress: Math.min(85, 30 + Math.round((done / Math.max(1, items.length)) * 55)),
        });
      }
    }
    counts.files = fileCount;
    if (skipped) notes.push(`${skipped} file(s) could not be read and were skipped.`);

    await setStatus({ stage: "Compressing", progress: 90, counts });
    files["README.txt"] = readme();
    await flush(true);

    await setStatus({
      status: "complete",
      progress: 100,
      stage: "Ready to download",
      file_path: parts[0]?.path ?? null,
      file_size: parts.reduce((n, p) => n + p.size, 0),
      parts,
      counts,
      expires_at: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
      completed_at: new Date().toISOString(),
      error: notes.length ? notes.join(" ") : null,

    });
  } catch (e) {
    await admin
      .from("data_exports")
      .update({
        status: "failed",
        stage: null,
        error: String((e as Error)?.message || e).slice(0, 500),
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", exportId);
  }
}

// ---------- request handling ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("org_id").eq("user_id", user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const orgId = (profile as any)?.org_id;
  const isAdmin = (roles || []).some((r: any) => r.role === "admin" || r.role === "platform_admin");
  if (!orgId || !isAdmin) return json({ error: "Only an organisation admin can export data." }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* no body */ }
  const action = String(body?.action || "start");

  if (action === "download") {
    const id = String(body?.id || "");
    const partIndex = Number.isFinite(Number(body?.part)) ? Number(body.part) : 0;
    const { data: row } = await admin
      .from("data_exports")
      .select("id, org_id, status, file_path, parts, expires_at")
      .eq("id", id)
      .maybeSingle();
    if (!row || (row as any).org_id !== orgId) return json({ error: "Export not found." }, 404);
    const r: any = row;
    const parts: Array<{ path: string }> = Array.isArray(r.parts) && r.parts.length
      ? r.parts
      : r.file_path
        ? [{ path: r.file_path }]
        : [];
    const target = parts[partIndex]?.path;
    if (r.status !== "complete" || !target) return json({ error: "That export isn't ready yet." }, 400);
    if (r.expires_at && new Date(r.expires_at) < new Date()) {
      return json({ error: "That download link has expired — please run a new export." }, 410);
    }
    const { data: signed, error } = await admin.storage
      .from("data-exports")
      .createSignedUrl(target, 60 * 10, { download: target.split("/").pop() });
    if (error || !signed?.signedUrl) return json({ error: "Could not create the download link." }, 500);
    return json({ url: signed.signedUrl });
  }


  if (action === "start") {
    await admin
      .from("data_exports")
      .update({ status: "failed", error: "This export stopped unexpectedly — please try again." })
      .eq("org_id", orgId)
      .in("status", ["queued", "running"])
      .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    const { data: running } = await admin
      .from("data_exports")
      .select("id")
      .eq("org_id", orgId)
      .in("status", ["queued", "running"])
      .limit(1);
    if (running && running.length) {
      return json({ error: "An export is already running. Please wait for it to finish." }, 429);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("data_exports")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: `You can run ${DAILY_LIMIT} exports a day. Please try again tomorrow.` }, 429);
    }

    const { data: created, error: insErr } = await admin
      .from("data_exports")
      .insert({ org_id: orgId, requested_by: user.id, status: "queued", stage: "Queued" })
      .select("id")
      .single();
    if (insErr || !created) return json({ error: insErr?.message || "Could not start the export." }, 500);

    await admin.from("audit_logs").insert({
      user_id: user.id,
      org_id: orgId,
      action: `Started a full data export (${(created as any).id})`,
      resource_id: (created as any).id,
    });

    // @ts-ignore Deno edge runtime
    EdgeRuntime.waitUntil(runExport((created as any).id, orgId));
    return json({ id: (created as any).id });
  }

  return json({ error: "Unknown action" }, 400);
});
