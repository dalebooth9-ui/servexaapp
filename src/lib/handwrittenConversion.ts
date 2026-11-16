// "Convert to digital report" — turning a handwritten sheet photo already on
// a job into a DRAFT online report. Pure helpers so the never-guess rules and
// the transcription wording are testable.

/** Below this the reader was guessing between marks — leave the field blank. */
export const CONVERSION_CONFIDENCE_MIN = 0.6;

export const TRANSCRIBED_KEY = "_transcribed_from";

export type TranscribedFrom = {
  submission_ids: string[];
  by_user_id: string;
  by_name: string;
  at: string; // ISO timestamp
};

type Field = { id: string; type: string };

const NON_ANSWER_TYPES = new Set(["signature", "photo", "photos", "image", "heading", "section", "info", "file"]);

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Drop every value the reader wasn't sure about. Returns the kept answers and
 *  the ids it blanked (to highlight). Never ticks a check it couldn't read. */
export function blankUncertainAnswers(
  extracted: Record<string, any>,
  confidence: Record<string, number>,
  fields: Field[],
  min = CONVERSION_CONFIDENCE_MIN,
): { values: Record<string, any>; blanked: string[] } {
  const values: Record<string, any> = {};
  const blanked: string[] = [];
  const known = new Set(fields.map((f) => f.id));
  for (const [k, v] of Object.entries(extracted || {})) {
    const c = confidence?.[k];
    if (known.has(k) && typeof c === "number" && c < min) {
      blanked.push(k);
      continue;
    }
    values[k] = v;
  }
  return { values, blanked };
}

/** Fields still empty after the sheet + job pre-fill, or blanked as unsure —
 *  the reviewer must check these against the original. */
export function fieldsToCheck(
  finalValues: Record<string, any>,
  blanked: string[],
  fields: Field[],
): string[] {
  const out: string[] = [];
  const blankedSet = new Set(blanked);
  for (const f of fields) {
    if (NON_ANSWER_TYPES.has(String(f.type).toLowerCase())) continue;
    if (blankedSet.has(f.id) || isBlank(finalValues[f.id])) out.push(f.id);
  }
  return out;
}

export function formatUkDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });
}

/** The line printed on the report so it is clear it was typed up from paper. */
export function transcriptionNote(t: Partial<TranscribedFrom> | null | undefined): string | null {
  if (!t || !t.by_name || !t.at) return null;
  const date = formatUkDate(t.at);
  if (!date) return null;
  return `Transcribed from handwritten original by ${t.by_name}, ${date}`;
}

/** submission id → newest report created from it. */
export function convertedSourceMap(
  rows: Array<{ id: string; created_at?: string | null; status?: string | null; responses?: any }>,
): Map<string, { responseId: string; status: string }> {
  const out = new Map<string, { responseId: string; status: string; at: string }>();
  for (const r of rows || []) {
    const t = r.responses?.[TRANSCRIBED_KEY] as TranscribedFrom | undefined;
    if (!t || !Array.isArray(t.submission_ids)) continue;
    const at = String(r.created_at || t.at || "");
    for (const sid of t.submission_ids) {
      const prev = out.get(sid);
      if (!prev || at > prev.at) out.set(sid, { responseId: r.id, status: String(r.status || "draft"), at });
    }
  }
  return new Map([...out].map(([k, v]) => [k, { responseId: v.responseId, status: v.status }]));
}
