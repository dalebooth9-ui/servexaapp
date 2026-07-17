// Shared scope inference for auto-created (email PO) jobs.
//
// Given the free-text work description that arrived by email, guess which
// job category slug applies and which canonical job-sheet template names
// should be pre-attached so the engineer never opens the job with zero
// paperwork. The previous version fell back to attaching the org's
// "Remedial Works Completion" sheet whenever wording was unfamiliar — that
// caused regulated work (e.g. gas-suppression Room Integrity Tests) to be
// filed against remedial paperwork.
//
// New rules:
//   1. Detect a wider set of work types (gas suppression, kitchen
//      suppression, fire alarm, emergency lighting, hose reels, wet riser,
//      water mist, smoke vents/AOV, fire doors — plus the existing dry
//      riser / hydrant / sprinkler / extinguisher).
//   2. When we recognise a specific work type, we DO NOT mark the job as
//      remedial as a fallback. The caller is expected to look up whether
//      the org has a matching job-sheet template and, if not, flag the job
//      with `template_mismatch_reason` and stop — never attach a remedial
//      sheet to a non-remedial regulated test.
//   3. Only mark `isRemedial` when the wording is explicitly a remedial
//      close-out (snags, rectify, retest of a previously failed item,
//      "supply and fit replacement").

export interface DetectedWorkType {
  /** Stable slug used for template lookup and UI badge. */
  slug: string;
  /** Human-readable label for banners / logs. */
  label: string;
  /**
   * Names (case-insensitive) that the org's job_sheet_templates would
   * ideally use for this work. Empty when no canonical name exists yet
   * (e.g. gas suppression — the office decides the exact sheet name).
   */
  canonicalTemplateNames: string[];
  /**
   * job_categories.slug / job_sheet_templates.job_category values that
   * indicate a matching template in the org's library. Matched via
   * substring so `commercial_sprinkler_service` matches `sprinkler`.
   */
  matchCategories: string[];
  /** Rough quantity mentioned in the wording (e.g. "1 x RIT" → 1). */
  qty?: number;
}

export interface InferredScope {
  /** job_categories.slug to store on jobs.category. null when ambiguous. */
  categorySlug: string | null;
  /** All detected work types (ordered by first appearance). */
  detectedWorkTypes: DetectedWorkType[];
  /**
   * Names (case-insensitive match against job_sheet_templates.name) that
   * should be pre-attached as `blank_job_sheet` job_documents rows. Empty
   * list means "no confident inference — flag for manual pick".
   */
  templateNames: string[];
  /** Human-readable reasons, surfaced in the job brief for the reviewer. */
  reasons: string[];
  /** True when the wording indicates remedial / snag / retest / supply-and-fit-replacement work. */
  isRemedial: boolean;
  /** Extracted individual works items (bulleted / numbered / action-clause lines), when the description reads like a list. */
  remedialItems: string[];
}

const norm = (s: string | null | undefined) => (s || "").toLowerCase();

// ── Work-type detectors ────────────────────────────────────────────────
// Each detector runs against the normalised haystack. Order matters only
// for label priority in the reasons list.

type Detector = {
  slug: string;
  label: string;
  canonicalTemplateNames: string[];
  matchCategories: string[];
  keywords: RegExp[];
  qtyKeyword?: RegExp;
};

const DETECTORS: Detector[] = [
  {
    slug: "gas_suppression",
    label: "Gas suppression (RIT / IG-55 / FM-200 / Novec)",
    canonicalTemplateNames: [
      "Gas Suppression — Room Integrity Test",
      "Gas Suppression — Annual Service",
    ],
    matchCategories: ["gas_suppression", "suppression", "clean_agent", "rit"],
    keywords: [
      /\brit\b/,
      /\broom\s+integrity\s+test\b/,
      /\big[\s-]?55\b/,
      /\big[\s-]?541\b/,
      /\bfm[\s-]?200\b/,
      /\bnovec(?:\s*1230)?\b/,
      /\bhfc[\s-]?227\b/,
      /\bclean\s+agent\b/,
      /\bsuppression\s+(?:discharge|retention|test|service)\b/,
      /\binergen\b/,
      /\bargonite\b/,
    ],
    qtyKeyword: /\b(\d+)\s*(?:x|×|off|no\.?)\s*(?:rit|room\s+integrity|ig[\s-]?55|ig[\s-]?541|fm[\s-]?200|novec)\b/,
  },
  {
    slug: "kitchen_suppression",
    label: "Kitchen suppression (Ansul R-102)",
    canonicalTemplateNames: [
      "Kitchen Suppression — Bi-annual Service",
      "Ansul R-102 Service",
    ],
    matchCategories: ["kitchen_suppression", "ansul"],
    keywords: [
      /\bansul\b/,
      /\br[\s-]?102\b/,
      /\bkitchen\s+(?:fire\s+)?suppression\b/,
    ],
  },
  {
    slug: "fire_alarm",
    label: "Fire alarm system (BS 5839)",
    canonicalTemplateNames: [
      "Fire Alarm — Service & Test (BS 5839)",
    ],
    matchCategories: ["fire_alarm", "alarm"],
    keywords: [
      /\bfire\s+alarm\b/,
      /\bbs\s*5839\b/,
      /\bl[1-5]\b\s*(?:cat|category|system|coverage)?/,
      /\balarm\s+panel\b/,
      /\b(?:smoke|heat)\s+detector(?:s|\s+head)?\b/,
      /\bcall\s+point(?:s)?\b/,
    ],
  },
  {
    slug: "emergency_lighting",
    label: "Emergency lighting (BS 5266)",
    canonicalTemplateNames: [
      "Emergency Lighting — Annual 3-Hour Test",
      "Emergency Lighting — Monthly Function Test",
    ],
    matchCategories: ["emergency_lighting", "em_lighting"],
    keywords: [
      /\bemergency\s+light(?:ing|s)?\b/,
      /\bem\s+lighting\b/,
      /\bbs\s*5266\b/,
      /\b3[\s-]?hour\s+test\b/,
      /\bthree[\s-]?hour\s+test\b/,
    ],
  },
  {
    slug: "hose_reel",
    label: "Hose reels",
    canonicalTemplateNames: ["Hose Reel — Annual Service"],
    matchCategories: ["hose_reel"],
    keywords: [/\bhose\s+reel(?:s)?\b/],
  },
  {
    slug: "wet_riser",
    label: "Wet riser",
    canonicalTemplateNames: ["Wet Riser — Annual Service & Test"],
    matchCategories: ["wet_riser"],
    keywords: [/\bwet[\s-]?riser(?:s)?\b/],
  },
  {
    slug: "water_mist",
    label: "Water mist system",
    canonicalTemplateNames: ["Water Mist — Annual Service"],
    matchCategories: ["water_mist"],
    keywords: [/\bwater\s?mist\b/],
  },
  {
    slug: "smoke_vent",
    label: "Smoke vents / AOV",
    canonicalTemplateNames: ["Smoke Vents / AOV — Annual Test"],
    matchCategories: ["smoke_vent", "aov", "smoke_ventilation"],
    keywords: [
      /\bsmoke\s+vent(?:s|ing|ilation)?\b/,
      /\baov(?:s)?\b/,
      /\bnatural\s+smoke\s+vent\b/,
      /\bmechanical\s+smoke\s+vent\b/,
      /\bbs\s*7346\b/,
    ],
  },
  {
    slug: "fire_door",
    label: "Fire door inspection",
    canonicalTemplateNames: ["Fire Door Inspection"],
    matchCategories: ["fire_door"],
    keywords: [
      /\bfire\s+door(?:s)?\b/,
      /\bfd\s?30\b/,
      /\bfd\s?60\b/,
    ],
  },
  {
    slug: "dry_riser_pressure_test",
    label: "Dry riser pressure test",
    canonicalTemplateNames: ["Dry Riser Pressure test", "Dry Riser — Annual Pressure Test"],
    matchCategories: ["dry_riser", "pressure_test", "dry_riser_pressure_test"],
    keywords: [
      /\bdry[\s-]?riser\b.*\b(?:pressure\s+test|hydraulic\s+test|wet\s+test|annual\s+test|retest|re[\s-]?test)\b/s,
      /\bdry[\s-]?riser\b.*\binstall(?:ation)?\b/s,
      /\bdry[\s-]?riser\b.*\bcommission(?:ing)?\b/s,
    ],
  },
  {
    slug: "dry_riser_visual",
    label: "Dry riser visual inspection",
    canonicalTemplateNames: ["Dry Riser Visual", "Dry Riser — Visual Inspection"],
    matchCategories: ["dry_riser", "visual", "dry_riser_visual"],
    keywords: [
      /\bdry[\s-]?riser\b.*\b(?:visual|6\s*month\s*visual|six\s*month\s*visual|visual\s+check|visual\s+test)\b/s,
    ],
  },
  {
    slug: "fire_hydrant",
    label: "Fire hydrant",
    canonicalTemplateNames: [
      "6 Month Visual Check",
      "Fire Hydrant – Annual Inspection",
      "Fire Hydrant — Annual Inspection",
      "Fire Hydrant – 5 Year Major Overhaul",
    ],
    matchCategories: ["fire_hydrant", "hydrant"],
    keywords: [/\bhydrant(?:s)?\b/],
  },
  {
    slug: "sprinkler",
    label: "Sprinkler system",
    canonicalTemplateNames: [
      "Sprinkler System — 6 Month Inspection",
      "Sprinkler System — Annual Service",
      "Commercial Sprinkler — Annual Service (BS EN 12845)",
      "Residential & Domestic Sprinkler — Annual Service",
    ],
    matchCategories: ["sprinkler", "sprinkler_service", "commercial_sprinkler_service"],
    keywords: [/\bsprinkler(?:s)?\b/],
  },
  {
    slug: "extinguisher",
    label: "Fire extinguishers",
    canonicalTemplateNames: [
      "Fire Extinguisher – Annual Service",
      "Fire Extinguisher — Annual Service",
    ],
    matchCategories: ["fire_extinguisher", "extinguisher", "fire_extinguishers"],
    keywords: [/\bextinguisher(?:s)?\b/],
  },
];

const CATEGORY_FROM_SLUG: Record<string, string> = {
  gas_suppression: "gas_suppression",
  kitchen_suppression: "kitchen_suppression",
  fire_alarm: "fire_alarm",
  emergency_lighting: "emergency_lighting",
  hose_reel: "hose_reel",
  wet_riser: "wet_riser",
  water_mist: "water_mist",
  smoke_vent: "smoke_vent",
  fire_door: "fire_door",
  dry_riser_pressure_test: "dry_riser_pressure_test",
  dry_riser_visual: "dry_riser_visual",
  fire_hydrant: "fire_hydrant_service",
  sprinkler: "sprinkler_service",
  extinguisher: "fire_extinguisher",
};

export function inferJobScope(input: {
  description?: string | null;
  subject?: string | null;
  body?: string | null;
}): InferredScope {
  const haystack = [input.description, input.subject, input.body]
    .map(norm)
    .join("\n");

  const remedialItems = extractRemedialItems(input.description || input.body || "");
  const explicitRemedial = detectRemedial(haystack);

  if (!haystack.trim()) {
    return {
      categorySlug: null,
      detectedWorkTypes: [],
      templateNames: [],
      reasons: [],
      isRemedial: explicitRemedial,
      remedialItems,
    };
  }

  const detected: DetectedWorkType[] = [];
  const seen = new Set<string>();
  for (const det of DETECTORS) {
    if (det.keywords.some((rx) => rx.test(haystack))) {
      if (seen.has(det.slug)) continue;
      seen.add(det.slug);
      const qtyMatch = det.qtyKeyword ? haystack.match(det.qtyKeyword) : null;
      detected.push({
        slug: det.slug,
        label: det.label,
        canonicalTemplateNames: det.canonicalTemplateNames,
        matchCategories: det.matchCategories,
        qty: qtyMatch ? parseInt(qtyMatch[1], 10) : undefined,
      });
    }
  }

  const reasons: string[] = [];
  for (const d of detected) {
    reasons.push(
      d.qty
        ? `Detected work type: ${d.label} (${d.qty}×).`
        : `Detected work type: ${d.label}.`,
    );
  }

  // Remedial rules:
  //  - if the wording only mentions remedial-style verbs AND no specific
  //    work type was found → remedial
  //  - if a specific work type was found AND wording says "remedial /
  //    snag / rectify of that work" → remedial for that work
  //  - otherwise NOT remedial (we no longer default to remedial paperwork)
  const isRemedial = explicitRemedial && (detected.length === 0 || /\b(remedial|snag|rectify|make\s+good|fault\s+repair|retest|re-?test)\b/.test(haystack) && detected.length > 0 && explicitRemedial);

  if (isRemedial && detected.length === 0) {
    reasons.push("Wording indicates remedial / snag / retest works — flagged as remedial.");
  }

  const primary = detected[0];
  const categorySlug = primary ? CATEGORY_FROM_SLUG[primary.slug] || null : null;
  const templateNames = detected.flatMap((d) => d.canonicalTemplateNames);

  return {
    categorySlug,
    detectedWorkTypes: detected,
    templateNames,
    reasons,
    isRemedial,
    remedialItems,
  };
}

// ── Remedial detection ─────────────────────────────────────────────────
const REMEDIAL_KEYWORDS = [
  "remedial", "remediation", "defect", "snag", "snagging",
  "supply and fit replacement", "supply & fit replacement",
  "replace faulty", "replace defective", "replace broken",
  "rectify", "make good", "fault repair",
];

function detectRemedial(haystack: string): boolean {
  return REMEDIAL_KEYWORDS.some((k) => haystack.includes(k));
}

/**
 * Split a free-text description into individual works items when it reads
 * like a list (numbered "1.", bulleted "-"/"•", "and" action clauses).
 * Empty when the description is a single sentence.
 */
export function extractRemedialItems(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(/\r/g, "");
  const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bulletRe = /^(?:[-*•·]|\d+[.)]|\(\d+\)|[a-z][.)])\s+/i;
  const bulleted = lines.filter((l) => bulletRe.test(l)).map((l) => l.replace(bulletRe, "").trim());
  if (bulleted.length >= 2) return dedupe(bulleted).slice(0, 30);

  const single = lines.join(" ").trim();
  if (single.length < 40) return [];
  const parts = single
    .split(/\s*(?:;|,\s+and\s+|\s+and\s+then\s+|\s+then\s+)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 8);
  if (parts.length >= 2) return dedupe(parts).slice(0, 30);
  return [];
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = s.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
}

/**
 * Resolve which of the org's job_sheet_templates match the detected work
 * types. `templates` is the org's template library (name + category +
 * job_category + status). Returns:
 *   - `matched`: templates to attach (published only, deduped by id)
 *   - `unmatchedWorkTypes`: detected types with no matching template in
 *     the library
 */
export function resolveTemplatesForWorkTypes<T extends {
  id: string;
  name: string | null;
  category?: string | null;
  job_category?: string | null;
  status?: string | null;
  updated_at?: string | null;
}>(
  detected: DetectedWorkType[],
  templates: T[],
): { matched: T[]; unmatchedWorkTypes: DetectedWorkType[] } {
  // Selection is ALWAYS constrained to published templates. Draft rows
  // (typically stale duplicates of a published canonical) must never be
  // auto-attached.
  const published = templates.filter((t) => (t.status || "published") === "published");
  const matchedIds = new Set<string>();
  const matched: T[] = [];
  const unmatched: DetectedWorkType[] = [];

  // Normalise dashes/whitespace/punctuation so "Fire Extinguisher – Annual
  // Service" (en dash) collides with "Fire Extinguisher — Annual Service"
  // (em dash) and both match "fire extinguisher - annual service".
  const foldName = (s: string) =>
    (s || "")
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-") // hyphen/en/em/minus → "-"
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\- ]+/g, "")
      .trim();

  for (const wt of detected) {
    const nameSet = new Set(wt.canonicalTemplateNames.map(foldName));
    const catSet = wt.matchCategories.map((c) => c.toLowerCase());
    const hits = published
      .filter((t) => {
        const nm = foldName(t.name || "");
        if (nameSet.has(nm)) return true;
        const cat = (t.category || "").toLowerCase();
        const jc = (t.job_category || "").toLowerCase();
        return catSet.some((c) => (cat && cat.includes(c)) || (jc && jc.includes(c)));
      })
      .filter((t) => {
        const n = (t.name || "").toLowerCase();
        const c = (t.category || "").toLowerCase();
        const j = (t.job_category || "").toLowerCase();
        return (
          !/remedial|repair\s*works|snag/.test(n) &&
          !/remedial/.test(c) &&
          !/remedial/.test(j)
        );
      });

    if (hits.length === 0) {
      unmatched.push(wt);
      continue;
    }

    // Rank candidates so, when multiple published templates match, we pick
    // the strongest signal instead of attaching nothing (or all of them):
    //   1. dash-folded exact name match beats category-only match
    //   2. job_category match beats generic category match
    //   3. most recently updated wins as final tie-break
    const scored = hits.map((t) => {
      const nm = foldName(t.name || "");
      let score = 0;
      if (nameSet.has(nm)) score += 1000;
      const jc = (t.job_category || "").toLowerCase();
      if (catSet.some((c) => jc && jc.includes(c))) score += 100;
      const cat = (t.category || "").toLowerCase();
      if (catSet.some((c) => cat && cat.includes(c))) score += 50;
      const ts = t.updated_at ? Date.parse(t.updated_at) : 0;
      return { t, score, ts: isNaN(ts) ? 0 : ts };
    });
    scored.sort((a, b) => b.score - a.score || b.ts - a.ts);
    const best = scored[0].t;
    if (!matchedIds.has(best.id)) {
      matchedIds.add(best.id);
      matched.push(best);
    }
  }

  return { matched, unmatchedWorkTypes: unmatched };
}

/**
 * Build a synthetic DetectedWorkType from a stored `jobs.category` slug
 * when the free-text detectors produced nothing. Useful when the PO
 * arrived as a scanned image and the AI parser set the category but the
 * plain-text description doesn't contain the keyword the regexes need.
 */
export function detectorForCategorySlug(slug: string | null | undefined): DetectedWorkType | null {
  if (!slug) return null;
  const s = slug.toLowerCase();
  const det = DETECTORS.find((d) => {
    if (CATEGORY_FROM_SLUG[d.slug] === s) return true;
    return d.matchCategories.some((c) => s.includes(c));
  });
  if (!det) return null;
  return {
    slug: det.slug,
    label: det.label,
    canonicalTemplateNames: det.canonicalTemplateNames,
    matchCategories: det.matchCategories,
  };
}
