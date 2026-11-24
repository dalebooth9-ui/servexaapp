/**
 * "Changes since last year" — compares a riser report with the most recent
 * earlier submitted report of the same type for the same riser (or the same
 * site + riser location when there is no riser record). Flags are advisory
 * only and never block submitting. Queries run under the user's own RLS, so
 * only the user's own company's reports and sites are ever compared.
 */

export type CompareField = { id: string; label: string; type: string; section?: string; options?: string[] };
export type FlagLevel = "check" | "note" | "unclear";
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
  source?: "app" | "archive";
  fileName?: string | null;
  /** Field ids the reader could not read clearly on an old scanned report. */
  unclear?: string[];
};
export type PossibleArchive = { id: string; fileName: string; siteName: string | null; date: string | null; previous: PreviousReport };

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
  unclear: string[] = [],
): ComparisonFlag[] {
  const flags: ComparisonFlag[] = [];
  const unclearSet = new Set(unclear);
  const countField = fields.find((x) => x.id === "number_of_outlets" || (/outlet/i.test(x.label || "") && /(number|no\.?|count|how many)/i.test(x.label || "")));
  for (const f of fields || []) {
    if (!f?.id || f.id.startsWith("_") || /signature|photo|file|image|table|repeating/i.test(f.type || "")) continue;
    const identity = IDENTITY.test(f.label || "") || f.id === "riser_location" || f.id === "cabinet_keys" || f.id === "valve_type" || f.id === countField?.id;
    if (!identity && SKIP_LABEL.test(f.label || "")) continue;
    const p = displayValue(previous?.[f.id]);
    const c = displayValue(current?.[f.id]);
    const label = (f.label || f.id).replace(/^BS\s?9990:2015\s[\d.]+\s*/i, "").replace(/:\s*$/, "");
    if (unclearSet.has(f.id)) {
      if (p || c) flags.push({ key: f.id, label, previous: p || "unreadable", current: c, level: "unclear", reason: "Unclear on the old report — not treated as a difference" });
      continue;
    }
    if (!p) continue; // nothing to compare against
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
  const rank = { check: 0, note: 1, unclear: 2 } as const;
  return flags.sort((a, b) => rank[a.level] - rank[b.level]);
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
  opts: { jobId: string; templateId: string; riserAssetId?: string | null; siteUnitId?: string | null; siteId?: string | null; riserLocation?: string | null; before?: string | null; orgId?: string | null; excludeResponseId?: string | null },
): Promise<PreviousReport | null> {
  const { jobId, templateId, riserAssetId, siteUnitId, siteId, riserLocation, before, orgId, excludeResponseId } = opts;
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
  if (siteUnitId) {
    // Site units (hydrants etc.) are matched by their own id, never by text.
    const { data } = await q.eq("responses->>_site_unit_id", siteUnitId).limit(1);
    rows = data || [];
  }
  if (!rows.length && riserAssetId) {
    const { data } = await q.eq("responses->>riser_asset_id", riserAssetId).limit(1);
    rows = data || [];
  }
  if (!rows.length && siteId && riserLocation) {
    const { data: siteJobs } = await supabase.from("jobs").select("id").eq("site_id", siteId).neq("id", jobId);
    const ids = (siteJobs || []).map((j: any) => j.id);
    if (ids.length) {
      const { data } = await q.in("job_id", ids.slice(0, 300)).limit(50);
      const loc = riserLocation.trim().toLowerCase();
      rows = (data || []).filter((r: any) => {
        const a = parseAnswers(r.responses);
        return (!riserAssetId || !a.riser_asset_id || a.riser_asset_id === riserAssetId) && String(a.riser_location || "").trim().toLowerCase() === loc;
      }).slice(0, 1);
    }
  }
  const row = rows[0];
  if (!row) return null;
  const { data: job } = await supabase.from("jobs").select("reference_number").eq("id", row.job_id).maybeSingle();
  return { responseId: row.id, jobId: row.job_id, jobReference: job?.reference_number ?? null, date: row.submitted_at, answers: parseAnswers(row.responses), source: "app" };
}

/** Defects raised from the previous report/job for this riser. */
export async function loadPreviousDefects(supabase: any, prev: PreviousReport, riserAssetId?: string | null) {
  const { data } = await supabase.from("defects").select("id, title, status, asset_id, source_response_id, job_id")
    .or(`source_response_id.eq.${prev.responseId},job_id.eq.${prev.jobId}`);
  return (data || []).filter((d: any) => !riserAssetId || !d.asset_id || d.asset_id === riserAssetId || d.source_response_id === prev.responseId);
}

/** Parse a UK date ("8/7/22", "14/03/2021", ISO) to ISO yyyy-mm-dd, or null. */
export function parseUkDate(v: any): string | null {
  if (blank(v)) return null;
  const t = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]), d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const UNCLEAR_BELOW = 0.6;
const UNCLEAR_TEXT = /^(\?+|unclear|illegible|unreadable)$/i;

/** Turn a filed archive document (already read by the sheet reader) into comparable answers. */
export function archiveToPrevious(doc: any): PreviousReport {
  const header = (doc.header_data && typeof doc.header_data === "object") ? doc.header_data : {};
  const extracted = (doc.extracted && typeof doc.extracted === "object") ? doc.extracted : {};
  const answers: Record<string, any> = { ...extracted };
  for (const k of ["riser_location", "number_of_outlets", "cabinet_keys", "valve_type"]) if (blank(answers[k]) && !blank(header[k])) answers[k] = header[k];
  const conf = header._field_confidence && typeof header._field_confidence === "object" ? header._field_confidence : {};
  const unclear = Object.entries(conf).filter(([, v]) => typeof v === "number" && v < UNCLEAR_BELOW).map(([k]) => k);
  for (const [k, v] of Object.entries(answers)) if (typeof v === "string" && UNCLEAR_TEXT.test(v.trim())) unclear.push(k);
  const paths: string[] = Array.isArray(doc.file_paths) ? doc.file_paths : [];
  const fileName = doc.title || (paths[0] ? paths[0].split("/").pop() : null) || doc.document_type || "Archived report";
  const date = doc.document_date || parseUkDate(extracted.date) || parseUkDate(header.date) || null;
  return { responseId: doc.id, jobId: "", jobReference: null, date, answers, source: "archive", fileName, unclear: Array.from(new Set(unclear)) };
}

const words = (s: string | null | undefined) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const postcode = (s: string | null | undefined) => (String(s || "").toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0] || "").replace(/\s+/g, "");

/** Name/address similarity between a site and an unlinked archive document (0–1). */
export function siteSimilarity(site: { name?: string | null; address?: string | null; postcode?: string | null }, docSite: string | null): number {
  if (!docSite) return 0;
  const pc = postcode(site.postcode || site.address);
  if (pc && postcode(docSite) === pc) return 1;
  const a = words(`${site.name || ""} ${site.address || ""}`), b = words(docSite);
  if (!a.size || !b.size) return 0;
  let hit = 0; b.forEach((w) => a.has(w) && hit++);
  return hit / Math.min(a.size, b.size);
}

const newer = (a: PreviousReport | null, b: PreviousReport | null) => {
  if (!a) return b; if (!b) return a;
  return (b.date || "") > (a.date || "") ? b : a;
};

/**
 * Archived (paper/PDF) reports already read by the sheet reader, same company and
 * report type. Linked to the site = confident; unlinked but similar = possible.
 */
export async function findArchivePrevious(
  supabase: any,
  opts: { orgId?: string | null; siteId: string | null; site: { name?: string | null; address?: string | null; postcode?: string | null }; templateId: string; templateName?: string | null; riserLocation?: string | null; riserAssetId?: string | null; before?: string | null; decisions?: Record<string, "ok" | "needs_fixing">; strictIdentity?: boolean },
): Promise<{ confident: PreviousReport | null; possible: PossibleArchive[] }> {
  let q = supabase.from("archived_documents").select("id, site_id, asset_id, site_name, site_address, title, document_type, template_id, document_date, extracted, header_data, file_paths, status, org_id");
  if (opts.orgId) q = q.eq("org_id", opts.orgId);
  const { data, error } = await q.limit(1000);
  if (error || !data) return { confident: null, possible: [] };
  const typeName = (opts.templateName || "").toLowerCase();
  const loc = (opts.riserLocation || "").trim().toLowerCase();
  let confident: PreviousReport | null = null;
  const possible: PossibleArchive[] = [];
  for (const d of data as any[]) {
    const sameType = d.template_id === opts.templateId || (!!typeName && String(d.document_type || d.template_name || "").toLowerCase() === typeName);
    if (!sameType) continue;
    const prev = archiveToPrevious(d);
    if (opts.strictIdentity && !isEarlierMatchingArchive(d, prev, opts)) continue;
    if (opts.before && prev.date && prev.date > opts.before.slice(0, 10)) continue;
    // Filed against a riser: that choice wins over location text.
    if (d.asset_id && opts.riserAssetId) {
      if (d.asset_id !== opts.riserAssetId) continue;
      confident = newer(confident, prev); continue;
    }
    const dloc = String(prev.answers.riser_location || "").trim().toLowerCase();
    if (loc && dloc && dloc !== loc) continue; // a different riser at the same site
    const decision = opts.decisions?.[`archive_match:${d.id}`];
    if (decision === "needs_fixing") continue;
    if ((opts.siteId && d.site_id === opts.siteId) || decision === "ok") { confident = newer(confident, prev); continue; }
    if (!d.site_id && siteSimilarity(opts.site, d.site_name || d.site_address) >= 0.6) {
      possible.push({ id: d.id, fileName: prev.fileName || "Archived report", siteName: d.site_name || d.site_address || null, date: prev.date, previous: prev });
    }
  }
  possible.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { confident, possible };
}

export function isEarlierMatchingArchive(doc: { status: string; site_id: string | null; asset_id?: string | null }, previous: PreviousReport, opts: { siteId: string | null; riserAssetId?: string | null; riserLocation?: string | null; before?: string | null }): boolean {
  if (doc.status !== "filed" || doc.site_id !== opts.siteId || !previous.date || (opts.before && previous.date.slice(0,10) >= opts.before.slice(0,10))) return false;
  if (doc.asset_id) return doc.asset_id === opts.riserAssetId;
  const location = String(previous.answers.riser_location || "").trim().toLowerCase();
  return Boolean(opts.riserLocation && location && location === opts.riserLocation.trim().toLowerCase());
}

/** Most recent filed report (in-app or archive), whatever year it is from. */
export async function findMostRecentPrevious(
  supabase: any,
  opts: { jobId: string; templateId: string; templateName?: string | null; riserAssetId?: string | null; siteUnitId?: string | null; siteId?: string | null; riserLocation?: string | null; before?: string | null; orgId?: string | null; excludeResponseId?: string | null; decisions?: Record<string, "ok" | "needs_fixing">; strictIdentity?: boolean },
): Promise<{ previous: PreviousReport | null; possible: PossibleArchive[] }> {
  const app = await findPreviousReport(supabase, opts);
  let site: any = {};
  if (opts.siteId) {
    const { data } = await supabase.from("sites").select("name, address, postcode").eq("id", opts.siteId).maybeSingle();
    site = data || {};
  }
  const arch = await findArchivePrevious(supabase, { orgId: opts.orgId, siteId: opts.siteId || null, site, templateId: opts.templateId, templateName: opts.templateName, riserLocation: opts.riserLocation, riserAssetId: opts.riserAssetId || null, before: opts.before, decisions: opts.decisions, strictIdentity: opts.strictIdentity }).catch(() => ({ confident: null, possible: [] as PossibleArchive[] }));
  const previous = newer(app, arch.confident);
  // Only ask about an unlinked archive file when it would be newer than what we already have.
  const possible = arch.possible.filter((p) => !previous || (p.date || "") > (previous.date || ""));
  return { previous, possible };
}

/** Full comparison for one saved report row. */
export async function compareSavedResponse(supabase: any, row: { id: string; job_id: string; template_id: string; org_id?: string | null; submitted_at?: string | null; responses: any }, fields: CompareField[], siteId: string | null, templateName?: string | null, decisions: Record<string, "ok" | "needs_fixing"> = {}) {
  const answers = parseAnswers(row.responses);
  const { previous: prev, possible } = await findMostRecentPrevious(supabase, {
    jobId: row.job_id, templateId: row.template_id, templateName, riserAssetId: answers.riser_asset_id || null,
    siteId, riserLocation: answers.riser_location || null, before: row.submitted_at || null, orgId: row.org_id || null, excludeResponseId: row.id, decisions,
  });
  if (!prev) return { previous: null, possible, flags: [] as ComparisonFlag[], answers };
  const defects = prev.source === "app" ? await loadPreviousDefects(supabase, prev, answers.riser_asset_id || null) : [];
  return { previous: prev, possible, flags: compareReports(fields, prev.answers, answers, defects, prev.unclear || []), answers };
}
