/**
 * Structured remedial items captured directly on a job sheet.
 *
 * Replaces free-text "Comments" parsing for templates that opt into the
 * `remedial_items` field type. Free-text parsing remains as a fallback for
 * older templates (see src/lib/carryForwardRemedials.ts).
 */

export type RemedialSeverity = "low" | "medium" | "high" | "critical";

export type RemedialItem = {
  id: string;
  description: string;
  severity: RemedialSeverity;
  photo_ids: string[];
  already_completed: boolean;
};

export const REMEDIAL_SEVERITIES: RemedialSeverity[] = ["low", "medium", "high", "critical"];

export const REMEDIAL_ITEMS_FIELD_TYPE = "remedial_items";

export function isRemedialItemsField(field: { type?: string | null } | null | undefined): boolean {
  return String(field?.type || "") === REMEDIAL_ITEMS_FIELD_TYPE;
}

export function newRemedialItemId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function coerceSeverity(value: unknown): RemedialSeverity {
  const s = String(value || "").toLowerCase().trim();
  return (REMEDIAL_SEVERITIES as string[]).includes(s) ? (s as RemedialSeverity) : "medium";
}

/**
 * Tolerant parser — the value may be a real array (preferred) or a JSON
 * string, depending on how the response was stored/round-tripped.
 */
export function parseRemedialItems(value: unknown): RemedialItem[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t.startsWith("[")) return [];
    try {
      raw = JSON.parse(t);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r: any) => ({
      id: String(r.id || newRemedialItemId()),
      description: String(r.description || "").trim(),
      severity: coerceSeverity(r.severity),
      photo_ids: Array.isArray(r.photo_ids) ? r.photo_ids.map((p: any) => String(p)).filter(Boolean) : [],
      already_completed: r.already_completed === true,
    }))
    .filter((r) => r.description.length > 0 || r.photo_ids.length > 0);
}

/** Plain-text rendering for PDF/Word/read-only surfaces. */
export function formatRemedialItemsText(value: unknown): string {
  const items = parseRemedialItems(value);
  if (!items.length) return "";
  return items
    .map((i) => {
      const bits = [i.description];
      const tags: string[] = [];
      if (i.severity && i.severity !== "medium") tags.push(i.severity.toUpperCase());
      if (i.already_completed) tags.push("ALREADY COMPLETED PLEASE CHECK");
      if (tags.length) bits.push(`(${tags.join(" — ")})`);
      return `• ${bits.join(" ")}`;
    })
    .join("\n");
}
