/**
 * Site units: numbered things at a site that each get their own sheet and
 * history (hydrants now; fire doors, emergency lights and AOVs later).
 * Add a kind here and in the site_units.unit_kind check to reuse everything.
 */
export type UnitKind = "hydrant" | "fire_door" | "emergency_light" | "aov";

export type UnitKindConfig = {
  kind: UnitKind;
  singular: string;
  plural: string;
  types: string[];
  readingLabel?: string;
  readingUnit?: string;
  /** Template answer ids that hold the unit number / location / type / reading. */
  numberFields: string[];
  locationFields: string[];
  typeFields: string[];
  readingFields: string[];
};

export const UNIT_KINDS: Record<UnitKind, UnitKindConfig> = {
  hydrant: {
    kind: "hydrant", singular: "Hydrant", plural: "Hydrants",
    types: ["Screwdown", "Sluice", "Pillar"],
    readingLabel: "Last flow", readingUnit: "LPM",
    numberFields: ["hydrant_number", "reference", "hydrant_reference", "hydrant_no"],
    locationFields: ["hydrant_location", "site_of_main", "location"],
    typeFields: ["hydrant_type"],
    readingFields: ["flow_rate", "flow_lpm"],
  },
  fire_door: { kind: "fire_door", singular: "Fire door", plural: "Fire doors", types: [], numberFields: ["door_number", "reference"], locationFields: ["location"], typeFields: ["door_type"], readingFields: [] },
  emergency_light: { kind: "emergency_light", singular: "Emergency light", plural: "Emergency lights", types: [], numberFields: ["light_number", "reference"], locationFields: ["location"], typeFields: ["fitting_type"], readingFields: [] },
  aov: { kind: "aov", singular: "AOV", plural: "AOVs", types: [], numberFields: ["aov_number", "reference"], locationFields: ["location"], typeFields: [], readingFields: [] },
};

/** Which unit kind a template's sheets belong to, if any. */
export function unitKindForTemplate(t: { category?: string | null; job_category?: string | null; name?: string | null } | null | undefined): UnitKind | null {
  const s = `${t?.category || ""} ${t?.job_category || ""} ${t?.name || ""}`.toLowerCase();
  if (/hydrant/.test(s)) return "hydrant";
  return null;
}

const first = (answers: Record<string, any>, ids: string[]) => {
  for (const id of ids) { const v = answers?.[id]; if (v != null && String(v).trim() !== "") return String(v).trim(); }
  return "";
};

/** "1", "No 2", "Hydrant 3", "H4" → number; anything else → null. */
export function unitNumberFrom(answers: Record<string, any>, kind: UnitKind): number | null {
  const raw = first(answers, UNIT_KINDS[kind].numberFields);
  const m = raw.match(/(\d{1,4})/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Normalise a written type to one of the kind's types (case-insensitive), else keep the text. */
export function normaliseUnitType(raw: string, kind: UnitKind): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  const hit = UNIT_KINDS[kind].types.find((t) => t.toLowerCase().replace(/\s+/g, "") === v.toLowerCase().replace(/[\s-]+/g, ""));
  return hit || v;
}

/** What the filed sheet tells us about the unit (stored as _site_unit_result). */
export function unitResultFrom(answers: Record<string, any>, kind: UnitKind, inspectedIso: string | null) {
  const c = UNIT_KINDS[kind];
  const reading = first(answers, c.readingFields).replace(/[^\d.]/g, "");
  const overall = String(answers.overall_result ?? answers.result ?? answers.flow_result ?? "").toLowerCase();
  return {
    inspected: inspectedIso,
    reading: reading || null,
    reading_unit: c.readingUnit || null,
    result: /fail|no/.test(overall) ? "fail" : /pass|yes|ok|good/.test(overall) ? "pass" : null,
    location: first(answers, c.locationFields) || null,
    type: normaliseUnitType(first(answers, c.typeFields), kind) || null,
  };
}

export type UnitDefectProposal = { key: string; title: string; description: string; severity: "low" | "medium" | "high"; category: string; defaultTicked: boolean; source_field_label?: string };

const PROBLEM_WORDS = /\b(needs?|faulty|fault|broken|damaged|missing|leak(?:ing|s)?|seized|stiff|replace|repair|rust(?:y|ed)?|corroded|obstructed|blocked|no flow|not working|defective|cracked|worn)\b/i;

/** Lines in a comment that describe work needed, e.g. "grid needs painting", "gauge reader faulty". */
export function remedialLinesFromComment(text: string): string[] {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n|;|\.\s+/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 2 && PROBLEM_WORDS.test(l));
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * Extra 'Raise as defect' proposals for a unit sheet: no flow, a flow marked
 * failed/low, and remedial comments. Never invents a flow threshold — "low"
 * only comes from the sheet's own result.
 */
export function proposeUnitDefects(answers: Record<string, any>, kind: UnitKind, unitLabel: string): UnitDefectProposal[] {
  const out: UnitDefectProposal[] = [];
  if (kind === "hydrant") {
    const flowRaw = String(answers.flow_rate ?? answers.flow_lpm ?? "").trim();
    const flow = Number(flowRaw.replace(/[^\d.]/g, ""));
    const flowResult = String(answers.flow_result ?? "").toLowerCase();
    const flowTested = answers.flow_test === true || answers.flow_test === "yes" || flowRaw !== "";
    if (flowTested && flowRaw !== "" && flow === 0) {
      out.push({ key: "unit:no_flow", title: `${unitLabel}: no flow`, description: "No flow recorded at the flow test.", severity: "high", category: "hydrant", defaultTicked: true });
    } else if (/fail|low/.test(flowResult)) {
      out.push({ key: "unit:low_flow", title: `${unitLabel}: low flow${flowRaw ? ` (${flowRaw} LPM)` : ""}`, description: "Flow test recorded as failed / low on the sheet.", severity: "high", category: "hydrant", defaultTicked: true });
    }
  }
  const comments = [answers.comments, answers.notes, answers.remedial_details].filter(Boolean).join("\n");
  for (const line of remedialLinesFromComment(comments)) {
    const slug = line.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
    out.push({ key: `unit:comment:${slug}`, title: `${unitLabel}: ${sentence(line)}`, description: `From engineer comments: "${line}"`, severity: "medium", category: kind, defaultTicked: true });
  }
  return out;
}
