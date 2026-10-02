/**
 * Wet ↔ visual report mode switching.
 *
 * A report response keeps ONE row; switching only changes its template_id and
 * records `_mode_switch` inside the answers JSON. Every answer is kept in the
 * JSON (even keys the other template doesn't show), so switching back loses
 * nothing. Photos and defects are keyed by job, so they carry automatically.
 *
 * Add new pairs (wet riser, hydrant…) to MODE_SWITCH_PAIRS.
 */
import { supabase } from "@/integrations/supabase/client";

export type ModeSwitchPair = {
  key: string;
  /** Normalised template name of the full (wet/pressure) test. */
  fullName: string;
  /** Normalised template name of the visual-only fallback. */
  visualName: string;
  fullLabel: string;
  visualLabel: string;
  /** Optional field id remapping full → visual when ids differ. */
  fieldMap?: Record<string, string>;
  /** Labels of wet-test fields hidden in "visual only" fallback mode. */
  wetFieldPattern?: RegExp;
};

export const MODE_SWITCH_PAIRS: ModeSwitchPair[] = [
  {
    key: "dry_riser",
    fullName: "dry riser pressure test",
    visualName: "dry riser visual inspection",
    fullLabel: "Pressure test",
    visualLabel: "Visual inspection",
    wetFieldPattern: /test pressure|hold time|leaks? detected|pressure test result/i,
  },
];

export const SWITCH_REASONS = [
  "No water supply",
  "Building management refused",
  "No access to outlets",
  "Defect found preventing test",
  "Other",
] as const;

export type ModeSwitchState = {
  pair: string;
  active: boolean; // true = currently visual-only
  full_template_id: string;
  visual_template_id: string;
  reason: string;
  note?: string | null;
  switched_at: string;
  switched_by?: string | null;
  return_job_id?: string | null;
  return_dismissed?: boolean;
  /** true = no linked visual form; same template, wet fields hidden. */
  fallback?: boolean;
  /** Field ids hidden while in fallback mode (answers kept in JSON). */
  hidden_fields?: string[];
  /** Office-only note, never on the customer report. */
  internal_note?: string | null;
  /** Office-approved wording for a free-text "Other" reason. */
  approved_reason?: string | null;
};

/** Generic pair used when a template is linked but its name isn't in MODE_SWITCH_PAIRS. */
export const GENERIC_PAIR: ModeSwitchPair = {
  key: "linked",
  fullName: "",
  visualName: "",
  fullLabel: "Pressure test",
  visualLabel: "Visual inspection",
  wetFieldPattern: /test pressure|hold time|leaks? detected|pressure test result/i,
};

/** Wet-test field ids on a template for the given pair. */
export function wetFieldIds(fields: any[], pair: ModeSwitchPair): string[] {
  const re = pair.wetFieldPattern || GENERIC_PAIR.wetFieldPattern!;
  return (fields || []).filter((f: any) => re.test(String(f?.label || ""))).map((f: any) => String(f.id));
}

/** Field ids to hide right now (fallback visual-only mode). */
export function hiddenFieldIds(responses: any): string[] {
  const s = getSwitchState(responses);
  return s?.active && s.fallback && Array.isArray(s.hidden_fields) ? s.hidden_fields : [];
}

export function withoutHiddenFields<T extends { fields: any[] }>(tpl: T, responses: any): T {
  const hidden = hiddenFieldIds(responses);
  if (!hidden.length) return tpl;
  return { ...tpl, fields: tpl.fields.filter((f: any) => !hidden.includes(String(f.id))) };
}

/** Reason text safe for the customer: free-text "Other" only once the office approves it. */
export function customerReasonText(s: ModeSwitchState) {
  if (s.reason === "Other") return s.approved_reason?.trim() || "Other";
  return s.reason;
}

export function needsReasonReview(s: ModeSwitchState | null) {
  return !!s?.active && s.reason === "Other" && !s.approved_reason;
}

export const normName = (n?: string | null) =>
  (n || "").toLowerCase().replace(/retired.*$/, "").replace(/[^a-z0-9]+/g, " ").trim();

export function findPair(templateName?: string | null): { pair: ModeSwitchPair; side: "full" | "visual" } | null {
  const n = normName(templateName);
  for (const p of MODE_SWITCH_PAIRS) {
    if (n === p.fullName) return { pair: p, side: "full" };
    if (n === p.visualName) return { pair: p, side: "visual" };
  }
  return null;
}

export function getSwitchState(responses: any): ModeSwitchState | null {
  const s = responses?._mode_switch;
  return s && typeof s === "object" ? (s as ModeSwitchState) : null;
}

export function isVisualOnly(responses: any) {
  return !!getSwitchState(responses)?.active;
}

export function switchReasonText(s: ModeSwitchState) {
  return s.reason === "Other" && s.note ? s.note : [s.reason, s.note].filter(Boolean).join(" – ");
}

export function pdfSwitchLine(responses: any): string | null {
  const s = getSwitchState(responses);
  if (!s?.active) return null;
  const pair = MODE_SWITCH_PAIRS.find((p) => p.key === s.pair);
  const what = pair?.fullLabel.toLowerCase() || "pressure test";
  return `Visual inspection only – ${what} not carried out. Reason: ${customerReasonText(s)}`;
}

/** Copy answers across to the target template (keeps every existing key). */
export function carryAnswers(data: Record<string, any>, pair: ModeSwitchPair, toVisual: boolean) {
  const out = { ...data };
  for (const [from, to] of Object.entries(pair.fieldMap || {})) {
    const [src, dst] = toVisual ? [from, to] : [to, from];
    if (out[src] !== undefined && (out[dst] === undefined || out[dst] === "")) out[dst] = out[src];
  }
  return out;
}

export async function logSwitch(jobId: string, userId: string | undefined, details: string, action: string) {
  try {
    await supabase.from("job_activity_log").insert({ job_id: jobId, user_id: userId, action, details } as any);
  } catch { /* timeline is best-effort */ }
}

/** Jobs (in the given list) whose reports were switched to visual-only. */
export async function fetchVisualOnlyByJob(jobIds: string[]) {
  const out = new Map<string, { responseId: string; state: ModeSwitchState }>();
  if (!jobIds.length) return out;
  const { data } = await supabase
    .from("job_sheet_responses")
    .select("id, job_id, responses")
    .in("job_id", jobIds)
    .eq("responses->_mode_switch->>active", "true");
  for (const r of (data || []) as any[]) {
    const s = getSwitchState(r.responses);
    if (s?.active) out.set(r.job_id, { responseId: r.id, state: s });
  }
  return out;
}
