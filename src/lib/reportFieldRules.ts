// Shared rules for which report fields must be filled in before a report
// can go to the office. Comments, materials required and any notes/free-text
// fields are always optional, whatever the template says.

const NON_INPUT = new Set(["section", "heading", "info", "signature", "photo", "photos", "image"]);
const FREE_TEXT_TYPES = new Set(["textarea", "notes", "note", "comments", "long_text", "richtext"]);
const OPTIONAL_LABEL = /\b(comment|comments|materials?\s+required|notes?|remarks?|observations?|additional\s+info)/i;

export function isFieldRequired(f: { type?: string; label?: string; required?: boolean } | null | undefined): boolean {
  if (!f?.required) return false;
  const type = String(f.type || "").toLowerCase();
  if (NON_INPUT.has(type)) return false;
  if (FREE_TEXT_TYPES.has(type)) return false;
  if (OPTIONAL_LABEL.test(String(f.label || ""))) return false;
  return true;
}

export function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** A response counts as "started" once any non-internal answer is entered. */
export function isResponseStarted(responses: Record<string, any> | null | undefined, fields: any[]): boolean {
  const data = responses || {};
  const inputIds = new Set(fields.filter((f) => !NON_INPUT.has(String(f?.type || ""))).map((f) => f.id));
  return Object.entries(data).some(([k, v]) => !k.startsWith("_") && inputIds.has(k) && !isEmptyValue(v));
}

export const SKIP_REASONS = [
  { value: "not_required", label: "Not required" },
  { value: "no_access", label: "No access" },
  { value: "office_instructed", label: "Office instructed" },
  { value: "other", label: "Other" },
] as const;

export const skipReasonLabel = (v?: string | null) => SKIP_REASONS.find((r) => r.value === v)?.label || v || "";
