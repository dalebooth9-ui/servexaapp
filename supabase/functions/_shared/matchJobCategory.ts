// Picks a job type from the company's OWN job_categories list (never a fixed
// list) using the PO's subject, body and attachment text. Words that are rare
// across the company's types (e.g. "hydrant", "pressure") weigh more than
// common ones ("service", "riser"). Uncertain → slug null ("Needs a type").
// Kept dependency-free so the frontend test can import it too.

export interface OrgCategory { slug: string; name: string }
export interface CategoryMatch {
  slug: string | null;
  status: "suggested" | "needs_type";
  others: string[]; // names of other work types also mentioned
}

const STOP = new Set(["and", "the", "of", "for", "to", "a", "an", "&", "/", "-"]);
const SYN: Record<string, string> = {
  testing: "test", tests: "test", tested: "test", servicing: "service", services: "service",
  remedials: "remedial", repair: "remedial", repairs: "remedial", inspection: "visual",
  sprinklers: "sprinkler", hydrants: "hydrant", risers: "riser", extinguishers: "extinguisher",
  installation: "install", installations: "install", installing: "install",
  surveys: "survey", yearly: "annual",
};

export const tokens = (s: string): string[] =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((t) => t && !STOP.has(t)).map((t) => SYN[t] ?? t);

export function matchJobCategory(categories: OrgCategory[], texts: (string | null | undefined)[]): CategoryMatch {
  const cats = categories.filter((c) => c.slug && c.slug !== "general");
  const hay = new Set(tokens(texts.filter(Boolean).join(" ")));
  if (!cats.length || !hay.size) return { slug: null, status: "needs_type", others: [] };

  const df = new Map<string, number>();
  const catTokens = cats.map((c) => [...new Set(tokens(c.name))]);
  for (const ts of catTokens) for (const t of ts) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t: string) => Math.log((cats.length + 1) / (df.get(t) || 1));

  const scored = cats.map((c, i) => {
    let hit = 0, miss = 0, rareHit = false;
    for (const t of catTokens[i]) {
      if (hay.has(t)) { hit += idf(t); if ((df.get(t) || 0) <= Math.max(2, cats.length / 4)) rareHit = true; }
      else miss += idf(t);
    }
    return { c, score: hit - 0.5 * miss, hit, rareHit };
  }).filter((s) => s.hit > 0 && s.rareHit).sort((a, b) => b.score - a.score);

  if (!scored.length) return { slug: null, status: "needs_type", others: [] };
  const [best, second] = scored;
  const confident = best.score > 0.5 && (!second || best.score - second.score >= 0.5);
  const others = scored.slice(confident ? 1 : 0)
    .filter((s) => s.score > 0 && s.score >= best.score * 0.5)
    .slice(0, 3).map((s) => s.c.name);
  return confident
    ? { slug: best.c.slug, status: "suggested", others }
    : { slug: null, status: "needs_type", others: [] };
}
