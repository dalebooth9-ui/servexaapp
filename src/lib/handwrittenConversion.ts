// "Convert to digital report" — turning a handwritten sheet photo already on
// a job into a DRAFT online report. Pure helpers so the never-guess rules and
// the transcription wording are testable.

/** Below this the reader was guessing between marks — leave the field blank. */
export const CONVERSION_CONFIDENCE_MIN = 0.6;
/** Short handwritten codes/names (key types, names, PO numbers) are easy to
 *  misread, so they only go blue when the reading is very clear. */
export const SHORT_TEXT_CONFIDENCE_MIN = 0.95;

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

const YES = new Set(["yes", "y", "true", "tick", "ticked", "✓", "✔", "good", "pass"]);
const NO = new Set(["no", "n", "false", "cross", "x", "✗", "✘", "fail"]);

/** Turn what the reader saw ("yes", "N/A", "pass") into the value the online
 *  form actually stores for that field type. Unknown marks return undefined
 *  so they stay blank and are flagged — never guessed. */
export function normaliseForField(type: string, raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  const t = String(type || "").toLowerCase();
  if (t === "checkbox") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw).trim().toLowerCase();
    if (!s) return undefined;
    if (YES.has(s)) return true;
    if (NO.has(s)) return false;
    if (["n/a", "na", "n.a.", "not applicable"].includes(s)) return "N/A";
    if (s === "no access") return "NO ACCESS";
    return undefined;
  }
  if (t === "pass_fail") {
    const s = String(raw).trim().toLowerCase();
    if (["pass", "yes", "p"].includes(s)) return "pass";
    if (["fail", "no", "f"].includes(s)) return "fail";
    if (["n/a", "na"].includes(s)) return "n/a";
    return s ? String(raw) : undefined;
  }
  return raw;
}

/** Map every extracted answer to its form type; marks that can't be mapped are
 *  returned in `unclear`. */
export function normaliseAnswers(
  extracted: Record<string, any>,
  fields: Field[],
): { values: Record<string, any>; unclear: string[] } {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const values: Record<string, any> = {};
  const unclear: string[] = [];
  for (const [k, v] of Object.entries(extracted || {})) {
    const f = byId.get(k);
    if (!f) { values[k] = v; continue; }
    const n = normaliseForField(f.type, v);
    if (n === undefined || (typeof n === "string" && !n.trim())) {
      if (!isBlank(v)) unclear.push(k);
      continue;
    }
    values[k] = n;
  }
  return { values, unclear };
}

const MATERIAL_RE = /^(?:missing|replace(?:ment)?|new|supply(?: and fit)?|needs? (?:a )?new|requires? (?:a )?new|broken|no)\s+(.+)$/i;

/** Split a handwritten issues note into comments and materials. A part like
 *  "missing drain plug" becomes the material "drain plug"; everything else
 *  stays in comments as written. */
export function splitIssuesNote(note: string): { comments: string; materials: string[] } {
  const parts = String(note || "")
    .split(/\s*(?:\+|;|&|\band\b|\n)\s*/i)
    .map((p) => p.trim().replace(/[.,]+$/, ""))
    .filter(Boolean);
  const comments: string[] = [];
  const materials: string[] = [];
  for (const p of parts) {
    const m = p.match(MATERIAL_RE);
    if (m) materials.push(m[1].trim().toLowerCase());
    else comments.push(p);
  }
  return { comments: comments.join("; "), materials };
}

/** Field ids with a value that came from the sheet (not from job details). */
export function readFieldIds(values: Record<string, any>, fields: Field[]): string[] {
  return fields
    .filter((f) => !NON_ANSWER_TYPES.has(String(f.type).toLowerCase()) && !isBlank(values[f.id]))
    .map((f) => f.id);
}

// ── Question-by-question conversion result ──────────────────────────────────

export type ConversionAnswer = {
  field_id: string;
  value: string | null;
  best_guess: string | null;
  confidence: number;
  box: { x: number; y: number; w: number; h: number } | null;
  note?: string | null;
};

export type ClassifiedConversion = {
  /** Answers confidently read — go straight into the draft (blue). */
  values: Record<string, any>;
  read: string[];
  /** Every other question — amber "check this". */
  check: string[];
  /** One-tap suggestion per amber question (already in the form's format). */
  suggestions: Record<string, any>;
  boxes: Record<string, { x: number; y: number; w: number; h: number }>;
};

export function answerFieldList<T extends Field>(fields: T[]): T[] {
  return fields.filter((f) => !NON_ANSWER_TYPES.has(String(f.type).toLowerCase()) && String(f.type).toLowerCase() !== "repeating_table");
}

/** Sort every question into read (blue) or check (amber). read + check always
 *  equals the number of questions. */
export function classifyConversion(
  answers: Record<string, ConversionAnswer>,
  fields: Field[],
  min = CONVERSION_CONFIDENCE_MIN,
  /** Stricter bar for handwritten free text (used when the photo is blurred/dark). */
  textMin = min,
): ClassifiedConversion {
  const out: ClassifiedConversion = { values: {}, read: [], check: [], suggestions: {}, boxes: {} };
  for (const f of answerFieldList(fields)) {
    const a = answers?.[f.id];
    if (a?.box) out.boxes[f.id] = a.box;
    const ftype = String(f.type).toLowerCase();
    const isText = ["text", "textarea"].includes(ftype);
    const isNote = /comment|material|note|remark|issue/i.test(`${f.id} ${(f as any).label || ""}`);
    const bar = ftype === "text" && !isNote ? Math.max(textMin, SHORT_TEXT_CONFIDENCE_MIN) : isText ? textMin : min;
    const confident = a && a.value !== null && a.confidence >= bar ? normaliseForField(f.type, a.value) : undefined;
    if (confident !== undefined && !(typeof confident === "string" && !confident.trim())) {
      out.values[f.id] = confident;
      out.read.push(f.id);
      continue;
    }
    out.check.push(f.id);
    const guess = a ? normaliseForField(f.type, a.best_guess ?? a.value) : undefined;
    if (guess !== undefined && !(typeof guess === "string" && !guess.trim())) out.suggestions[f.id] = guess;
  }
  // Issues note: materials go to Materials, the bracket-type work to Comments.
  const hasMaterials = fields.some((f) => f.id === "materials_required");
  for (const bag of [out.values, out.suggestions]) {
    if (hasMaterials && typeof bag.comments === "string") {
      const split = splitIssuesNote(bag.comments);
      if (split.materials.length) {
        if (!String(bag.materials_required || "").trim()) bag.materials_required = split.materials.join("\n");
        bag.comments = split.comments;
      }
    }
  }
  if (out.values.materials_required && out.check.includes("materials_required")) {
    out.check = out.check.filter((id) => id !== "materials_required");
    out.read.push("materials_required");
    delete out.suggestions.materials_required;
  }
  return out;
}
