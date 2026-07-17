/**
 * Find the most recent PRIOR submitted job_sheet_response for the same
 * site + template (preferring same asset when linked). Used by the
 * "Previous report" comparison panel so office staff can sanity-check a
 * newly scanned/filed sheet against last year's answers.
 *
 * All lookups are org-scoped via jobs.org_id (RLS enforces the same).
 */
import { supabase } from "@/integrations/supabase/client";

export type PreviousResponse = {
  level: "asset" | "site" | "customer";
  responseId: string;
  jobId: string;
  jobReference: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  submittedByName?: string | null;
  responses: Record<string, any>;
};

export async function findPreviousResponse(params: {
  currentJobId: string;
  templateId: string;
  /** Exclude this response id in addition to jobs matching currentJobId. */
  currentResponseId?: string;
}): Promise<PreviousResponse | null> {
  const { currentJobId, templateId, currentResponseId } = params;

  const { data: cur } = await supabase
    .from("jobs")
    .select("id, site_id, asset_id, customer_id")
    .eq("id", currentJobId)
    .maybeSingle();
  if (!cur) return null;

  const levels: { level: PreviousResponse["level"]; col: "asset_id" | "site_id" | "customer_id"; val: string | null }[] = [
    { level: "asset", col: "asset_id", val: cur.asset_id },
    { level: "site", col: "site_id", val: cur.site_id },
    { level: "customer", col: "customer_id", val: cur.customer_id },
  ];

  for (const { level, col, val } of levels) {
    if (!val) continue;
    let q: any = (supabase as any)
      .from("job_sheet_responses")
      .select(
        "id, job_id, responses, submitted_at, submitted_by, status, jobs!inner(id, reference_number, site_id, asset_id, customer_id)"
      )
      .eq("template_id", templateId)
      .eq("status", "submitted")
      .neq("job_id", currentJobId)
      .eq(`jobs.${col}`, val)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (currentResponseId) q = q.neq("id", currentResponseId);

    const { data, error } = await q;
    if (error) continue;
    if (data && data.length > 0) {
      const row: any = data[0];
      let submittedByName: string | null = null;
      if (row.submitted_by) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", row.submitted_by)
          .maybeSingle();
        submittedByName = prof?.full_name ?? null;
      }
      return {
        level,
        responseId: row.id,
        jobId: row.job_id,
        jobReference: row.jobs?.reference_number ?? null,
        submittedAt: row.submitted_at,
        submittedBy: row.submitted_by,
        submittedByName,
        responses: (row.responses || {}) as Record<string, any>,
      };
    }
  }
  return null;
}

/**
 * Historic (pre-Servexa) report fallback — used when no in-Servexa prior
 * response exists for a job's site+template. We try to match the template
 * by name/slug against historic_reports.report_type_label / report_type
 * for the same site.
 */
export type PreviousHistoricReport = {
  id: string;
  siteId: string;
  reportDate: string | null;
  reportTypeLabel: string | null;
  originalFilename: string;
  storagePath: string;
};

export async function findPreviousHistoricReport(params: {
  currentJobId: string;
  templateId: string;
}): Promise<PreviousHistoricReport | null> {
  const { currentJobId, templateId } = params;
  const { data: cur } = await supabase
    .from("jobs")
    .select("site_id")
    .eq("id", currentJobId)
    .maybeSingle();
  if (!cur?.site_id) return null;

  const { data: tpl } = await supabase
    .from("job_sheet_templates")
    .select("name, job_category")
    .eq("id", templateId)
    .maybeSingle();

  let q: any = (supabase as any)
    .from("historic_reports")
    .select(
      "id, site_id, report_date, report_type, report_type_label, original_filename, storage_path",
    )
    .eq("site_id", cur.site_id)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(20);

  const { data } = await q;
  const rows: any[] = data || [];
  if (rows.length === 0) return null;

  // Prefer rows whose report_type/label loosely matches template name/slug.
  const tplName = ((tpl as any)?.name || "").toLowerCase();
  const tplSlug = ((tpl as any)?.job_category || "").toLowerCase();
  const scored = rows.map((r) => {
    const hay =
      `${r.report_type_label || ""} ${r.report_type || ""}`.toLowerCase();
    let s = 0;
    if (tplName && hay.includes(tplName)) s += 100;
    if (tplSlug && hay.includes(tplSlug)) s += 60;
    if (tplName) {
      for (const w of tplName.split(/\s+/).filter((x: string) => x.length > 3)) {
        if (hay.includes(w)) s += 10;
      }
    }
    return { r, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const chosen = scored[0].s > 0 ? scored[0].r : rows[0];
  return {
    id: chosen.id,
    siteId: chosen.site_id,
    reportDate: chosen.report_date,
    reportTypeLabel: chosen.report_type_label,
    originalFilename: chosen.original_filename,
    storagePath: chosen.storage_path,
  };
}

// ---------- Diff logic ----------

export type TemplateFieldLite = {
  id: string;
  label: string;
  type: string;
  section?: string;
};

export type FieldDiff = {
  fieldId: string;
  label: string;
  section: string;
  previous: string;
  current: string;
  status: "unchanged" | "changed" | "cleared" | "new";
  /** True when this diff warrants a warning highlight. */
  highSignal: boolean;
  reason?: string;
};

const OUTLET_RE = /outlets?\b/i;
const RISER_RE = /riser\s*location/i;
const CONDITION_HINT_RE = /(condition|pass|fail|working|operational|ok|serviceable|leak|damage|defect|corros|test|result)/i;

function displayValue(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    const t = v.trim();
    const l = t.toLowerCase();
    if (l === "true") return "Yes";
    if (l === "false") return "No";
    if (l === "yes" || l === "no" || l === "n/a" || l === "na") return l === "na" ? "N/A" : l.toUpperCase().replace("N/A", "N/A");
    return t;
  }
  if (typeof v === "number") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function norm(v: string): string {
  return v.trim().toLowerCase();
}

export function diffResponses(
  templateFields: TemplateFieldLite[],
  previous: Record<string, any>,
  current: Record<string, any>,
): FieldDiff[] {
  return templateFields
    .filter((f) => !["photo", "signature", "heading", "instruction"].includes(f.type))
    .map((f): FieldDiff => {
      const prev = displayValue(previous?.[f.id]);
      const curr = displayValue(current?.[f.id]);
      const pn = norm(prev);
      const cn = norm(curr);

      let status: FieldDiff["status"] = "unchanged";
      if (pn === "" && cn !== "") status = "new";
      else if (pn !== "" && cn === "") status = "cleared";
      else if (pn !== cn) status = "changed";

      let highSignal = false;
      let reason: string | undefined;

      if (status !== "unchanged") {
        // outlets or riser location change
        if (OUTLET_RE.test(f.label)) {
          highSignal = true;
          reason = "Number of outlets changed";
        } else if (RISER_RE.test(f.label)) {
          highSignal = true;
          reason = "Riser location changed";
        }

        // pass → fail
        if (f.type === "pass_fail" || CONDITION_HINT_RE.test(f.label)) {
          if (pn === "pass" && cn === "fail") {
            highSignal = true;
            reason = "Pass → Fail";
          }
        }

        // yes → no
        if ((f.type === "checkbox" || CONDITION_HINT_RE.test(f.label))) {
          if (pn === "yes" && cn === "no") {
            highSignal = true;
            reason = "Yes → No";
          }
        }

        // cleared (was answered, now blank)
        if (status === "cleared") {
          highSignal = true;
          reason = reason || "Was answered previously, now blank";
        }
      }

      return {
        fieldId: f.id,
        label: f.label,
        section: f.section || "General",
        previous: prev,
        current: curr,
        status,
        highSignal,
        reason,
      };
    });
}
