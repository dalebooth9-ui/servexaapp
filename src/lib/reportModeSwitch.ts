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
};

export const MODE_SWITCH_PAIRS: ModeSwitchPair[] = [
  {
    key: "dry_riser",
    fullName: "dry riser pressure test",
    visualName: "dry riser visual inspection",
    fullLabel: "Pressure test",
    visualLabel: "Visual inspection",
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
};

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
  return `Visual inspection only – ${what} not carried out. Reason: ${switchReasonText(s)}`;
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
