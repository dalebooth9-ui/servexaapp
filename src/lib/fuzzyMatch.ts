// Smart search matching that ignores case, spaces, hyphens, and punctuation.
// Also supports multi-word queries where each word must appear somewhere
// in the combined haystack.

const normalize = (v: string): string =>
  (v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Returns true if `query` matches `fields` (any string values). Matching is:
 *   1. Case/space/punctuation-insensitive substring match on the combined
 *      normalised fields, OR
 *   2. All whitespace-separated words in the query appear (normalised) in the
 *      combined fields — order-independent.
 */
export function fuzzyMatch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = (query || "").trim();
  if (!q) return true;

  const combinedRaw = fields.filter(Boolean).join(" ");
  const combinedNorm = normalize(combinedRaw);

  const qNorm = normalize(q);
  if (qNorm && combinedNorm.includes(qNorm)) return true;

  const words = q.split(/\s+/).map(normalize).filter(Boolean);
  if (words.length > 1 && words.every((w) => combinedNorm.includes(w))) return true;

  return false;
}
