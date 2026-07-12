// Smart search matching that ignores case, spaces, hyphens, em/en dashes and
// punctuation. Also supports multi-word queries where each word must appear
// somewhere in the combined haystack, and produces a match score for ranking.

const normalize = (v: string): string =>
  (v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const collectFields = (fields: (string | null | undefined)[]): string[] =>
  fields.filter((v): v is string => typeof v === "string" && v.length > 0);

/**
 * Returns true if `query` matches any of `fields`. Matching is:
 *   1. Case/space/punctuation-insensitive substring match on the combined
 *      normalised fields, OR
 *   2. All whitespace-separated words in the query appear (normalised) in the
 *      combined fields — order-independent.
 */
export function fuzzyMatch(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fuzzyScore(query, ...fields) > 0;
}

/**
 * Returns a match score for `query` against `fields`. 0 means no match.
 * Higher = better. Prefers early/prefix hits on the first field and full
 * substring hits over per-word hits.
 */
export function fuzzyScore(query: string, ...fields: (string | null | undefined)[]): number {
  const q = (query || "").trim();
  if (!q) return 1;

  const strings = collectFields(fields);
  if (strings.length === 0) return 0;

  const normFields = strings.map(normalize);
  const combinedNorm = normFields.join(" ");
  const qNorm = normalize(q);

  let score = 0;

  if (qNorm) {
    // Prefix hit on the first (primary) field is best.
    if (normFields[0] && normFields[0].startsWith(qNorm)) score += 1000;
    // Substring hit on the primary field.
    if (normFields[0] && normFields[0].includes(qNorm)) score += 500;
    // Substring hit on any field.
    const anyFieldHit = normFields.some((f) => f.includes(qNorm));
    if (anyFieldHit) score += 200;
    // Earlier position in combined fields = higher.
    const pos = combinedNorm.indexOf(qNorm);
    if (pos >= 0) score += Math.max(0, 100 - pos);
  }

  const words = q.split(/\s+/).map(normalize).filter(Boolean);
  if (words.length > 1) {
    const allWordsHit = words.every((w) => combinedNorm.includes(w));
    if (allWordsHit) {
      score += 150;
      // Bonus if all words hit the primary field.
      if (normFields[0] && words.every((w) => normFields[0].includes(w))) score += 100;
    }
  } else if (words.length === 1 && score === 0) {
    // Single-word fallback (redundant with qNorm above, but keeps behaviour explicit).
    if (combinedNorm.includes(words[0])) score += 50;
  }

  return score;
}

/**
 * Filter and rank `items` by their fuzzy match against `query`. The
 * `getFields` callback returns the searchable fields for each item; the
 * first field is treated as primary for ranking.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[]
): T[] {
  const q = (query || "").trim();
  if (!q) return items;
  const scored: Array<{ item: T; score: number; idx: number }> = [];
  items.forEach((item, idx) => {
    const score = fuzzyScore(q, ...getFields(item));
    if (score > 0) scored.push({ item, score, idx });
  });
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return scored.map((s) => s.item);
}
