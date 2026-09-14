/**
 * Derives a job's work-type slugs (category + detected_work_types) from the
 * quantities and service text captured at creation time.
 *
 * Jobs created from dropped paperwork used to be saved with the dialog's
 * default category ("general") even when the extraction had already filled in
 * pressure-test / visual quantities or an "other service type" of "Remedial".
 * With category = 'general' the sheet auto-attach found nothing, so engineers
 * opened the job to an empty "Today on this job" panel.
 */

export type DerivedWorkTypes = {
  /** Primary category slug to store on jobs.category */
  category: string;
  /** Every work type the job covers (jobs.detected_work_types) */
  detectedWorkTypes: string[];
};

export interface WorkTypeInput {
  category?: string | null;
  pressure_test_qty?: number | null;
  visual_qty?: number | null;
  other_qty?: number | null;
  other_service_type?: string | null;
  name?: string | null;
}

const GENERIC_CATEGORIES = new Set(["", "general", "other", "uncategorised", "uncategorized"]);

export function isGenericCategory(slug?: string | null): boolean {
  return GENERIC_CATEGORIES.has(String(slug || "").trim().toLowerCase());
}

/** True when the text describes remedial / repair work. */
export function mentionsRemedial(text?: string | null): boolean {
  return /remedial|repair|rectif|snag/i.test(String(text || ""));
}

export function deriveJobWorkTypes(input: WorkTypeInput): DerivedWorkTypes {
  const pt = Number(input.pressure_test_qty || 0);
  const vis = Number(input.visual_qty || 0);
  const oth = Number(input.other_qty || 0);
  const otherType = String(input.other_service_type || "");
  const name = String(input.name || "");
  const existing = String(input.category || "").trim();

  const slugs: string[] = [];
  if (pt > 0) slugs.push("dry_riser_pressure_test");
  if (vis > 0) slugs.push("dry_riser_visual");

  const remedialText = mentionsRemedial(otherType) || mentionsRemedial(name);
  if (remedialText) {
    // Pair remedial work with the dry riser sheet when the job is clearly a
    // dry riser visit; otherwise use the generic Remedial Works Report.
    const dryRiser = slugs.length > 0 || /dry\s*riser|riser/i.test(name) || /dry\s*riser/i.test(otherType);
    slugs.push(dryRiser ? "dry_riser_remedial" : "remedial");
  } else if (oth > 0 && otherType.trim()) {
    const slug = otherType.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (slug) slugs.push(slug);
  }

  const detectedWorkTypes = Array.from(new Set(slugs));

  // Keep an explicitly chosen (non-generic) category — the office knows best.
  const category = !isGenericCategory(existing)
    ? existing
    : detectedWorkTypes[0] || existing || "general";

  return { category, detectedWorkTypes };
}

/**
 * Pulls remedial actions out of an AI-generated markdown job brief.
 *
 * Looks for the list that follows a "remedial" lead-in ("Remedial Actions:",
 * "rectify the following defects"), and otherwise falls back to any scope list
 * item that describes a repair. Returns clean one-line descriptions.
 */
export function parseRemedialActionsFromBrief(brief?: string | null): string[] {
  const text = String(brief || "");
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  let inRemedialList = false;

  const clean = (s: string) =>
    s
      .replace(/^\s*(?:[*\-+]|\d+\.)\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const isListItem = (s: string) => /^\s*(?:[*\-+]|\d+\.)\s+\S/.test(s);
  const isNested = (s: string) => /^\s{4,}(?:[*\-+]|\d+\.)\s+/.test(s);

  // Only the scope/remedial part of a brief describes work to do — equipment
  // lists and completion criteria are not remedial actions.
  let inScope = false;

  for (const raw of lines) {
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      inRemedialList = false;
      inScope = /scope of work|remedial|works? required|defects?/i.test(heading[1]);
      continue;
    }
    if (!isListItem(raw)) {
      // A prose lead-in such as "rectify the following defects:" opens a list.
      if (/rectify the following|following remedial|remedial actions?\s*:/i.test(raw)) {
        inRemedialList = true;
        inScope = true;
      }
      continue;
    }
    if (!inScope) continue;
    if (isNested(raw)) continue; // sub-bullets are detail, not separate items

    const body = clean(raw);
    if (!body || body.length < 6) continue;

    if (inRemedialList) {
      items.push(body);
      continue;
    }
    if (/^remedial (?:actions?|works?)\s*:/i.test(body)) {
      const after = body.replace(/^remedial (?:actions?|works?)\s*:\s*/i, "").trim();
      if (after.length > 5) items.push(after);
      continue;
    }
    if (mentionsRemedial(body) || /^replace(?:ment)?\b|\brenew\b/i.test(body)) {
      items.push(body);
    }
  }


  // De-duplicate, cap length
  const seen = new Set<string>();
  return items
    .map((i) => i.slice(0, 500))
    .filter((i) => {
      const k = i.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
