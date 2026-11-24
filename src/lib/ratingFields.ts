// Three-way condition ratings (Good / Fair / Poor). The printed sheet shows
// these as GOOD / FAIR / POOR even when the template stores a tick box, so the
// converted answer must keep "Fair" rather than collapsing it to yes/no.
export const RATING_OPTIONS = ["Good", "Fair", "Poor", "N/A"];

export function isRatingField(f: { label?: string | null; options?: any[] | null }): boolean {
  const label = String(f?.label || "");
  if (/outlet\s+cabinets?\s+in\s+good\s+condition/i.test(label)) return true;
  if (/good\s*[/,]\s*fair|fair\s*[/,]\s*poor/i.test(label)) return true;
  const opts = (f?.options || []).map((o) => String(o).toLowerCase());
  return opts.includes("fair") && (opts.includes("good") || opts.includes("poor"));
}

/** Normalise a written rating to Good / Fair / Poor / N/A; anything else is returned as written. */
export function normaliseRating(v: any): any {
  if (v === true) return "Good";
  if (v === false) return "Poor";
  const t = String(v ?? "").trim();
  const u = t.toUpperCase().replace(/[^A-Z/]/g, "");
  if (["GOOD", "G", "YES", "Y", "OK"].includes(u)) return "Good";
  if (["FAIR", "F", "AVERAGE"].includes(u)) return "Fair";
  if (["POOR", "P", "NO", "N", "BAD"].includes(u)) return "Poor";
  if (["NA", "N/A"].includes(u)) return "N/A";
  return v;
}
