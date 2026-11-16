/**
 * Suggests defects from a submitted report's free text: Comments, Materials
 * required and photo captions. Deterministic word rules so nothing is created
 * silently — the office/engineer confirms each suggestion.
 */
export type DefectSuggestion = {
  key: string;
  title: string;
  description: string;
  works_required: string;
  materials_required: string;
  photo: string | null;
  photoCaption: string | null;
  sources: string[];
};

const PROBLEM_WORDS =
  /\b(needs?|need(ed|ing)?|missing|poor|damaged?|broken|leak(s|ing)?|replace(ment|d)?|re-?fit(ting)?|re-?fix|loose|corroded|corrosion|rust(y|ed)?|fail(ed|ing|s)?|faulty|not working|cracked|seized|defect(ive)?|worn|stiff|blocked|obstructed|vandalis|incorrect|no\s+\w+\s+(fitted|present)|install(ed)?\s+badly|poor(ly)?\s+install)/i;
const STOP = new Set(["the","a","an","of","to","and","on","in","at","is","be","needs","need","missing","poor","install","installed","new","re","fitting","refitting","refit","gf","floor","needed","with","for","x","inch","mm"]);
const NOISE = /^(n\/?a|none|nil|no|ok|good|vfp-\d+|-+)$/i;

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/)
    .map(w => w.replace(/s$/, "")).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}
function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ").replace(/[.;,]+$/, "");
  if (!t) return t;
  const lower = t === t.toUpperCase() ? t.toLowerCase().replace(/\bgf\b/g, "GF") : t;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function split(s: string): string[] {
  return s.split(/\s*(?:\+|;|\n|,|\band\b|&)\s*/i).map(x => x.trim()).filter(x => x && !NOISE.test(x));
}
function cleanMaterial(m: string): string {
  return m.replace(/\b\d+(\s*(”|"|inch|in|mm))?\s*/gi, "").replace(/\s+/g, " ").trim();
}

type Item = { text: string; kind: "comment" | "material" | "caption"; photo?: string | null };

export function suggestDefectsFromReport(responses: Record<string, any> | null | undefined): DefectSuggestion[] {
  const r = responses || {};
  const str = (v: any) => (typeof v === "string" ? v : "");
  const commentKeys = Object.keys(r).filter(k => !k.startsWith("_") && /comment|notes?$|issues?|observ/i.test(k) && typeof r[k] === "string");
  const materialKeys = Object.keys(r).filter(k => !k.startsWith("_") && /material/i.test(k) && typeof r[k] === "string");
  const items: Item[] = [];
  for (const k of commentKeys) for (const p of split(str(r[k]))) if (PROBLEM_WORDS.test(p)) items.push({ text: p, kind: "comment" });
  for (const k of materialKeys) for (const p of split(str(r[k]))) items.push({ text: p, kind: "material" });
  const caps: any[] = Array.isArray(r._site_photo_captions) ? r._site_photo_captions : [];
  const paths: any[] = Array.isArray(r._site_photo_paths) ? r._site_photo_paths : [];
  caps.forEach((c, i) => {
    const t = str(c).trim();
    if (t && PROBLEM_WORDS.test(t)) items.push({ text: t, kind: "caption", photo: str(paths[i]) || null });
  });

  type Group = { items: Item[]; words: Set<string> };
  const groups: Group[] = [];
  for (const it of items) {
    const w = words(it.kind === "material" ? cleanMaterial(it.text) : it.text);
    const g = groups.find(g => w.some(x => g.words.has(x)));
    if (g) { g.items.push(it); w.forEach(x => g.words.add(x)); }
    else groups.push({ items: [it], words: new Set(w) });
  }

  return groups.map(g => {
    const comment = g.items.find(i => i.kind === "comment");
    const material = g.items.find(i => i.kind === "material");
    const caption = g.items.find(i => i.kind === "caption");
    const mat = material ? cleanMaterial(material.text) || material.text : "";
    let title: string;
    if (comment && !(material && /missing/i.test(comment.text) === false && !words(comment.text).some(w => words(mat).includes(w)))) title = sentence(comment.text);
    else if (material) title = g.items.some(i => /missing/i.test(i.text)) || !comment ? `Missing ${mat.toLowerCase()}` : sentence(comment!.text);
    else title = sentence((caption || g.items[0]).text);
    // Materials-only group: "Missing drain plug" reads better than the comment fragment.
    if (material && comment && /missing/i.test(comment.text)) title = `Missing ${mat.toLowerCase()}`;
    const sources = g.items.map(i => `${i.kind === "comment" ? "Comments" : i.kind === "material" ? "Materials" : "Photo"}: ${i.text}`);
    const works = comment ? sentence(comment.text) : material ? `Supply and fit ${mat.toLowerCase()}` : sentence((caption || g.items[0]).text);
    const key = Array.from(g.words).sort().slice(0, 6).join("-") || title.toLowerCase().replace(/\W+/g, "-");
    return {
      key,
      title: title.slice(0, 200),
      description: `Found in the report.\n${sources.join("\n")}`,
      works_required: works,
      materials_required: material ? material.text.trim() : "",
      photo: caption?.photo || null,
      photoCaption: caption?.text || null,
      sources,
    };
  });
}
