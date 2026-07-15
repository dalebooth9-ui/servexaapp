// Shared scope inference for auto-created (email PO) jobs.
//
// Given the free-text work description that arrived by email, guess which
// job category slug applies and which canonical job-sheet template names
// should be pre-attached so the engineer never opens the job with zero
// paperwork. Rules err on the side of NOT guessing: when the wording is
// ambiguous (e.g. plain "sprinkler service" — residential or commercial?)
// we return no category and let the Jobs-to-Approve review card force the
// office coordinator to pick one before approval.

export interface InferredScope {
  /** job_categories.slug to store on jobs.category. null when ambiguous. */
  categorySlug: string | null;
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

export function inferJobScope(input: {
  description?: string | null;
  subject?: string | null;
  body?: string | null;
}): InferredScope {
  const haystack = [input.description, input.subject, input.body]
    .map(norm)
    .join("\n");

  const remedialItems = extractRemedialItems(input.description || input.body || "");
  const isRemedial = detectRemedial(haystack);

  if (!haystack.trim()) {
    return { categorySlug: null, templateNames: [], reasons: [], isRemedial, remedialItems };
  }

  const has = (...needles: string[]) => needles.some((n) => haystack.includes(n));
  const reasons: string[] = [];
  if (isRemedial) reasons.push("Wording indicates remedial / snag / retest works — marked as remedial.");

  const mentionsDryRiser = has("dry riser", "dry-riser", "dryriser");
  const mentionsWetRiser = has("wet riser", "wet-riser");
  const mentionsRiserGeneric = has("riser") && !mentionsDryRiser && !mentionsWetRiser;
  const mentionsHydrant = has("hydrant");
  const mentionsSprinkler = has("sprinkler");
  const mentionsExtinguisher = has("extinguisher");

  const mentionsPressureTest = has(
    "pressure test", "pressure-test", "hydraulic test", "wet test", "retest", "re-test", "re test", "annual test"
  );
  const mentionsVisual = has("visual inspection", "6 month visual", "six month visual", "visual check", "visual test");
  const mentionsInstall = has("install", "installation", "commission", "commissioning", "new install");
  const mentionsService = has("service", "annual service", "maintenance");

  const finish = (out: Omit<InferredScope, "isRemedial" | "remedialItems">): InferredScope => ({
    ...out,
    isRemedial,
    remedialItems,
  });

  // ── Dry riser ────────────────────────────────────────────────────────
  if (mentionsDryRiser || mentionsRiserGeneric) {
    if (mentionsInstall) {
      reasons.push("Wording mentions dry riser installation/commissioning — pressure test sheet attached for commissioning.");
      return finish({ categorySlug: "dry_riser_installation", templateNames: ["Dry Riser Pressure test"], reasons });
    }
    if (mentionsPressureTest) {
      reasons.push("Wording mentions dry riser pressure test / retest.");
      return finish({ categorySlug: "dry_riser_pressure_test", templateNames: ["Dry Riser Pressure test"], reasons });
    }
    if (mentionsVisual) {
      reasons.push("Wording mentions dry riser visual inspection.");
      return finish({ categorySlug: "dry_riser_visual", templateNames: ["Dry Riser Visual"], reasons });
    }
    if (mentionsService) {
      reasons.push("Wording mentions dry riser service — attached both pressure test and visual sheets.");
      return finish({ categorySlug: "dry_riser_service", templateNames: ["Dry Riser Pressure test", "Dry Riser Visual"], reasons });
    }
  }

  if (mentionsWetRiser) {
    if (mentionsVisual) {
      reasons.push("Wording mentions wet riser visual inspection.");
      return finish({ categorySlug: "wet_riser_visual", templateNames: [], reasons });
    }
    if (mentionsService || mentionsPressureTest) {
      reasons.push("Wording mentions wet riser annual service.");
      return finish({ categorySlug: "wet_riser_annual_service", templateNames: [], reasons });
    }
  }

  if (mentionsHydrant) {
    if (has("5 year", "five year", "major overhaul")) {
      reasons.push("Wording mentions hydrant 5-year major overhaul.");
      return finish({ categorySlug: "fire_hydrant_service", templateNames: ["Fire Hydrant – 5 Year Major Overhaul"], reasons });
    }
    reasons.push("Wording mentions fire hydrant — 6 month visual check attached.");
    return finish({ categorySlug: "fire_hydrant_service", templateNames: ["6 Month Visual Check"], reasons });
  }

  if (mentionsExtinguisher) {
    reasons.push("Wording mentions fire extinguishers.");
    return finish({ categorySlug: "extinguisher_service", templateNames: [], reasons });
  }

  if (mentionsSprinkler) {
    reasons.push("Wording mentions sprinklers — reviewer must pick residential/commercial category and sheet.");
    return finish({ categorySlug: null, templateNames: [], reasons });
  }

  return finish({ categorySlug: null, templateNames: [], reasons });
}

// ── Remedial detection ─────────────────────────────────────────────────
const REMEDIAL_KEYWORDS = [
  "remedial", "remediation", "defect", "snag", "snagging",
  "retest", "re-test", "re test",
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
  // 1. Bulleted / numbered lines
  const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bulletRe = /^(?:[-*•·]|\d+[.)]|\(\d+\)|[a-z][.)])\s+/i;
  const bulleted = lines.filter((l) => bulletRe.test(l)).map((l) => l.replace(bulletRe, "").trim());
  if (bulleted.length >= 2) return dedupe(bulleted).slice(0, 30);

  // 2. Single-paragraph "supply and fit X and retest Y and Z" — split on
  //    top-level " and " / "; " / ", and " when the paragraph is long enough.
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

  const has = (...needles: string[]) => needles.some((n) => haystack.includes(n));
  const reasons: string[] = [];

  const mentionsDryRiser = has("dry riser", "dry-riser", "dryriser");
  const mentionsWetRiser = has("wet riser", "wet-riser");
  const mentionsRiserGeneric = has("riser") && !mentionsDryRiser && !mentionsWetRiser;
  const mentionsHydrant = has("hydrant");
  const mentionsSprinkler = has("sprinkler");
  const mentionsExtinguisher = has("extinguisher");

  const mentionsPressureTest = has(
    "pressure test", "pressure-test", "hydraulic test", "wet test", "retest", "re-test", "re test", "annual test"
  );
  const mentionsVisual = has("visual inspection", "6 month visual", "six month visual", "visual check", "visual test");
  const mentionsInstall = has("install", "installation", "commission", "commissioning", "new install");
  const mentionsService = has("service", "annual service", "maintenance");

  // ── Dry riser ────────────────────────────────────────────────────────
  if (mentionsDryRiser || mentionsRiserGeneric) {
    if (mentionsInstall) {
      reasons.push("Wording mentions dry riser installation/commissioning — pressure test sheet attached for commissioning.");
      return {
        categorySlug: "dry_riser_installation",
        templateNames: ["Dry Riser Pressure test"],
        reasons,
      };
    }
    if (mentionsPressureTest) {
      reasons.push("Wording mentions dry riser pressure test / retest.");
      return {
        categorySlug: "dry_riser_pressure_test",
        templateNames: ["Dry Riser Pressure test"],
        reasons,
      };
    }
    if (mentionsVisual) {
      reasons.push("Wording mentions dry riser visual inspection.");
      return {
        categorySlug: "dry_riser_visual",
        templateNames: ["Dry Riser Visual"],
        reasons,
      };
    }
    // "dry riser service" with no other cue — attach both annual sheets.
    if (mentionsService) {
      reasons.push("Wording mentions dry riser service — attached both pressure test and visual sheets.");
      return {
        categorySlug: "dry_riser_service",
        templateNames: ["Dry Riser Pressure test", "Dry Riser Visual"],
        reasons,
      };
    }
  }

  // ── Wet riser ────────────────────────────────────────────────────────
  if (mentionsWetRiser) {
    if (mentionsVisual) {
      reasons.push("Wording mentions wet riser visual inspection.");
      return { categorySlug: "wet_riser_visual", templateNames: [], reasons };
    }
    if (mentionsService || mentionsPressureTest) {
      reasons.push("Wording mentions wet riser annual service.");
      return { categorySlug: "wet_riser_annual_service", templateNames: [], reasons };
    }
  }

  // ── Hydrant ──────────────────────────────────────────────────────────
  if (mentionsHydrant) {
    if (has("5 year", "five year", "major overhaul")) {
      reasons.push("Wording mentions hydrant 5-year major overhaul.");
      return {
        categorySlug: "fire_hydrant_service",
        templateNames: ["Fire Hydrant – 5 Year Major Overhaul"],
        reasons,
      };
    }
    reasons.push("Wording mentions fire hydrant — 6 month visual check attached.");
    return {
      categorySlug: "fire_hydrant_service",
      templateNames: ["6 Month Visual Check"],
      reasons,
    };
  }

  // ── Extinguisher ─────────────────────────────────────────────────────
  if (mentionsExtinguisher) {
    reasons.push("Wording mentions fire extinguishers.");
    return {
      categorySlug: "extinguisher_service",
      templateNames: [],
      reasons,
    };
  }

  // ── Sprinkler ────────────────────────────────────────────────────────
  // Residential vs commercial isn't determinable from wording alone, so we
  // never auto-set the category here — reviewer picks it.
  if (mentionsSprinkler) {
    reasons.push("Wording mentions sprinklers — reviewer must pick residential/commercial category and sheet.");
    return { categorySlug: null, templateNames: [], reasons };
  }

  return { categorySlug: null, templateNames: [], reasons };
}
