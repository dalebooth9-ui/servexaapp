/**
 * "Changes since last year" — compares a riser report with the most recent
 * earlier submitted report of the same type for the same riser (or the same
 * site + riser location when there is no riser record). Flags are advisory
 * only and never block submitting. Queries run under the user's own RLS, so
 * only the user's own company's reports and sites are ever compared.
 */

export type CompareField = { id: string; label: string; type: string; section?: string; options?: string[] };
export type FlagLevel = "check" | "note";
export type ComparisonFlag = {
  key: string;
  label: string;
  previous: string;
  current: string;
  level: FlagLevel;
  reason: string;
};
export type PreviousReport = {
  responseId: string;
  jobId: string;
  jobReference: string | null;
  date: string | null;
  answers: Record<string, any>;
};

const IDENTITY = /(riser\s*location|valve\s*type|cabinet\s*key|number\s*of\s*outlets|no\.?\s*of\s*outlets|outlets?\s*count|how many outlets|inlet\s*type)/i;
const SKIP_LABEL = /(signature|\bsign(ed)?\b|date|time|photo|po\s*number|engineer|technician|customer|site\s*details|comment|note|materials|declaration)/i;

const blank = (v: any) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Normalise an answer for display/comparison. */
export function displayValue(v: any): string {
  if (blank(v)) return "";
  if (v === true) return "YES";
  if (v === false) return "NO";
  if (typeof v === "object") return "";
  const s = String(v).trim();
  const l = s.toLowerCase();
  if (["yes", "y", "true"].includes(l)) return "YES";
  if (["no", "n", "false"].includes(l)) return "NO";
  if (l === "pass") return "PASS";
  if (l === "fail") return "FAIL";
  if (["n/a", "na", "not applicable"].includes(l)) return "N/A";
  return s;
}

const same = (a: string, b: string) => a.replace(/\s+/g, " ").toLowerCase() === b.replace(/\s+/g, " ").toLowerCase();

function outletCount(fields: CompareField[], answers: Record<string, any>): number | null {
  const f = fields.find((x) => /outlet/i.test(x.label || "") && /(number|no\.?|count|how many)/i.test(x.label || ""))
    || fields.find((x) => x.id === "number_of_outlets");
  const raw = f ? answers?.[f.id] : answers?.number_of_outlets;
  const n = Number(raw);
  if (!blank(raw) && Number.isFinite(n)) return n;
  return null;
}

/** Outlet count drop that is unlikely to be real (2+ fewer and at least a third). */
export function unlikelyOutletDrop(prev: number, curr: number): boolean {
  return curr < prev && prev - curr >= 2 && (prev - curr) / prev >= 1 / 3;
}

export function compareReports(
  fields: CompareField[],
  previous: Record<string, any>,
  current: Record<string, any>,
  previousDefects: { id: string; title: string; status?: string | null }[] = [],
): ComparisonFlag[] {
  const flags: ComparisonFlag[] = [];
  const countField = fields.find((x) => x.id === "number_of_outlets" || (/outlet/i.test(x.label || "") && /(number|no\.?|count|how many)/i.test(x.label || "")));
  for (const f of fields || []) {
    if (!f?.id || f.id.startsWith("_") || /signature|photo|file|image|table|repeating/i.test(f.type || "")) continue;
    const identity = IDENTITY.test(f.label || "") || f.id === "riser_location" || f.id === "cabinet_keys" || f.id === "valve_type" || f.id === countField?.id;
    if (!identity && SKIP_LABEL.test(f.label || "")) continue;
    const p = displayValue(previous?.[f.id]);
    const c = displayValue(current?.[f.id]);
    if (!p) continue; // nothing to compare against
    const label = (f.label || f.id).replace(/^BS\s?9990:2015\s[\d.]+\s*/i, "").replace(/:\s*$/, "");
    if (!c) {
      flags.push({ key: f.id, label, previous: p, current: "", level: "check", reason: "Answered last year, blank this year" });
      continue;
    }
    if (same(p, c)) continue;
    if (f.id === countField?.id) {
      const pn = Number(p), cn = Number(c);
      const unlikely = Number.isFinite(pn) && Number.isFinite(cn) && unlikelyOutletDrop(pn, cn);
      flags.push({ key: f.id, label, previous: p, current: c, level: unlikely ? "check" : "note", reason: unlikely ? "Unlikely change — please confirm the outlet count" : "Number of outlets changed" });
      continue;
    }
    if (identity) {
      flags.push({ key: f.id, label, previous: p, current: c, level: "note", reason: "Riser detail changed" });
      continue;
    }
    const pair = `${p}>${c}`;
    if (pair === "YES>NO" || pair === "PASS>FAIL") {
      flags.push({ key: f.id, label, previous: p, current: c, level: "note", reason: pair === "PASS>FAIL" ? "Passed last year, fails now" : "Was YES last year, NO now" });
    } else if (pair === "NO>YES" || pair === "FAIL>PASS") {
      flags.push({ key: f.id, label, previous: p, current: c, level: "note", reason: "Issue last year — was it fixed?" });
    } else {
      flags.push({ key: f.id, label, previous: p, current: c, level: "note", reason: "Answer changed" });
    }
  }
  const text = Object.values(current || {}).filter((v) => typeof v === "string").join(" ").toLowerCase();
  for (const d of previousDefects) {
    if (/resolved|closed|complete/i.test(d.status || "")) continue;
    const words = (d.title || "").toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const mentioned = words.length > 0 && words.filter((w) => text.includes(w)).length >= Math.min(2, words.length);
    if (mentioned) continue;
    flags.push({ key: `defect:${d.id}`, label: `Defect last year: ${d.title}`, previous: d.status || "open", current: "Not mentioned", level: "check", reason: "Raised last year and not mentioned — fixed, or missed?" });
  }
  return flags.sort((a, b) => (a.level === b.level ? 0 : a.level === "check" ? -1 : 1));
}

/** One-line "Last year: …" hints for the engineer form, keyed by field id. */
export function lastYearHints(fields: CompareField[], previous: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields || []) {
    if (!f?.id || f.id.startsWith("_") || /signature|photo|file|image|table|repeating/i.test(f.type || "")) continue;
    if (SKIP_LABEL.test(f.label || "") && !IDENTITY.test(f.label || "") && f.id !== "cabinet_keys") continue;
    const v = displayValue(previous?.[f.id]);
    if (v && v.length <= 60) out[f.id] = v;
  }
  return out;
}

function parseAnswers(raw: any): Record<string, any> {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return {};
}

/**
 * Most recent earlier submitted report of the same template for the same riser
 * (or same site + riser location). Same company is guaranteed by RLS and an
 * explicit org filter when known.
 */
export async function findPreviousReport(
  supabase: any,
  opts: { jobId: string; templateId: string; riserAssetId?: string | null; siteId?: string | null; riserLocation?: string | null; before?: string | null; orgId?: string | null; excludeResponseId?: string | null },
): Promise<PreviousReport | null> {
  const { jobId, templateId, riserAssetId, siteId, riserLocation, before, orgId, excludeResponseId } = opts;
  if (!templateId) return null;
  let q = supabase.from("job_sheet_responses")
    .select("id, job_id, responses, submitted_at, org_id")
    .eq("template_id", templateId).eq("status", "submitted").is("archived_at", null)
    .neq("job_id", jobId).not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  if (orgId) q = q.eq("org_id", orgId);
  if (before) q = q.lt("submitted_at", before);
  if (excludeResponseId) q = q.neq("id", excludeResponseId);
  let rows: any[] = [];
  if (riserAssetId) {
    const { data } = await q.eq("responses->>riser_asset_id", riserAssetId).limit(1);
    rows = data || [];
  }
  if (!rows.length && siteId && riserLocation) {
    const { data: siteJobs } = await supabase.from("jobs").select("id").eq("site_id", siteId).neq("id", jobId);
    const ids = (siteJobs || []).map((j: any) => j.id);
    if (ids.length) {
      const { data } = await q.in("job_id", ids.slice(0, 300)).limit(50);
      const loc = riserLocation.trim().toLowerCase();
      rows = (data || []).filter((r: any) => String(parseAnswers(r.responses).riser_location || "").trim().toLowerCase() === loc).slice(0, 1);
    }
  }
  const row = rows[0];
  if (!row) return null;
  const { data: job } = await supabase.from("jobs").select("reference_number").eq("id", row.job_id).maybeSingle();
  return { responseId: row.id, jobId: row.job_id, jobReference: job?.reference_number ?? null, date: row.submitted_at, answers: parseAnswers(row.responses) };
}

/** Defects raised from the previous report/job for this riser. */
export async function loadPreviousDefects(supabase: any, prev: PreviousReport, riserAssetId?: string | null) {
  const { data } = await supabase.from("defects").select("id, title, status, asset_id, source_response_id, job_id")
    .or(`source_response_id.eq.${prev.responseId},job_id.eq.${prev.jobId}`);
  return (data || []).filter((d: any) => !riserAssetId || !d.asset_id || d.asset_id === riserAssetId || d.source_response_id === prev.responseId);
}

/** Full comparison for one saved report row. */
export async function compareSavedResponse(supabase: any, row: { id: string; job_id: string; template_id: string; org_id?: string | null; submitted_at?: string | null; responses: any }, fields: CompareField[], siteId: string | null) {
  const answers = parseAnswers(row.responses);
  const prev = await findPreviousReport(supabase, {
    jobId: row.job_id, templateId: row.template_id, riserAssetId: answers.riser_asset_id || null,
    siteId, riserLocation: answers.riser_location || null, before: row.submitted_at || null, orgId: row.org_id || null, excludeResponseId: row.id,
  });
  if (!prev) return { previous: null, flags: [] as ComparisonFlag[], answers };
  const defects = await loadPreviousDefects(supabase, prev, answers.riser_asset_id || null);
  return { previous: prev, flags: compareReports(fields, prev.answers, answers, defects), answers };
}
