// Derive defect proposals from a filled-in job sheet's extracted answers
// and freeform remarks. Used by the archive conversion flow so historic
// paper reports don't drop their defects on the floor — the office reviews
// each proposal (tick / untick / edit) before anything is written.
//
// Deterministic client-side logic — no extra AI call — so it runs identically
// on the initial file (ArchiveReviewDialog) and on retro-convert.
import { supabase } from "@/integrations/supabase/client";

export type ProposedDefect = {
  key: string; // stable id for React keys / selection
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  location_on_site: string; // "" when unknown
  source_field_label: string; // "" when derived from a remarks line
};

// Words that turn a "NO" / free-text remark into a defect proposal.
const REMARK_KEYWORDS = [
  "missing", "damage", "damaged", "defect", "defective", "faulty", "fault",
  "broken", "cracked", "leaking", "leak", "corroded", "corrosion", "rust",
  "seized", "blocked", "obstructed", "expired", "out of date", "not working",
  "inoperable", "u/s", "u\\s", "unserviceable", "replace", "require",
  "required", "needed", "needs", "worn", "loose", "snapped", "bent",
  "damaged strap", "no padlock", "no strap", "no cap", "no chain",
];

const CRITICAL_HINTS = ["fire", "leaking", "pressure", "hazard", "critical", "life"];

const NO_LIKE = new Set(["no", "fail", "failed", "unsatisfactory", "u/s"]);

const looksLikeNo = (v: unknown) =>
  typeof v === "string" && NO_LIKE.has(v.trim().toLowerCase());

const isDescriptiveDefect = (v: unknown) => {
  if (typeof v !== "string") return false;
  const s = v.toLowerCase();
  if (NO_LIKE.has(s.trim())) return true;
  return REMARK_KEYWORDS.some((k) => s.includes(k));
};

const severityFor = (text: string): ProposedDefect["severity"] => {
  const s = text.toLowerCase();
  if (CRITICAL_HINTS.some((k) => s.includes(k))) return "high";
  if (/(missing|broken|leak|cracked|snapped|not working|inoperable|u\/s)/.test(s)) {
    return "high";
  }
  if (/(worn|loose|corroded|damaged|expired)/.test(s)) return "medium";
  return "medium";
};

// Best-effort location extraction from a remark: "padlock & strap missing on
// levels 2 & 4" → "levels 2 & 4". Falls back to "".
const extractLocation = (text: string): string => {
  const patterns = [
    /(on|at)\s+(level[s]?\s+[\d,\s&and]+)/i,
    /(on|at)\s+(floor[s]?\s+[\d,\s&and]+)/i,
    /(on|at)\s+(riser\s+\d+[a-z]?)/i,
    /(level[s]?\s+[\d,\s&and]+)/i,
    /(floor[s]?\s+[\d,\s&and]+)/i,
    /(basement|ground floor|roof|plant\s*room|reception|corridor\s+[a-z0-9]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[2] || m[1] || m[0];
  }
  return "";
};

// Categorise a proposal from its label + text, defaulting to "other".
const categoryFor = (label: string, text: string): string => {
  const hay = `${label} ${text}`.toLowerCase();
  if (/dry\s*riser|wet\s*riser|riser|landing valve|outlet/.test(hay)) return "dry_riser";
  if (/sprinkler/.test(hay)) return "sprinkler";
  if (/extinguisher/.test(hay)) return "extinguisher";
  if (/alarm|detector/.test(hay)) return "fire_alarm";
  if (/emergency\s*light/.test(hay)) return "emergency_lighting";
  if (/suppress/.test(hay)) return "suppression";
  if (/fire\s*door|passive|compartment/.test(hay)) return "passive_fire";
  return "other";
};

type TemplateFieldLite = {
  id: string;
  label: string;
  type?: string;
  section?: string;
};

const REMARK_FIELD_HINTS = /(remark|comment|note|defect|observation|issue|action)/i;

const splitRemarkLines = (raw: string): string[] => {
  return raw
    .split(/\r?\n|(?<=[.;])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
};

export function proposeDefectsFromExtraction(
  fields: TemplateFieldLite[],
  answers: Record<string, any>,
  header: Record<string, any> = {},
): ProposedDefect[] {
  const out: ProposedDefect[] = [];
  const riserLocation = String(header?.riser_location || "").trim();

  for (const f of fields || []) {
    const raw = answers?.[f.id];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = String(raw).trim();
    if (!value) continue;

    // Ignore explicit N/A responses — they aren't defects.
    const lower = value.toLowerCase();
    if (lower === "n/a" || lower === "na") continue;

    const isRemarkField = REMARK_FIELD_HINTS.test(f.label || "");
    if (isRemarkField) {
      for (const line of splitRemarkLines(value)) {
        if (!isDescriptiveDefect(line)) continue;
        const loc = extractLocation(line) || riserLocation;
        out.push({
          key: `remark:${f.id}:${out.length}`,
          title: line.length > 90 ? `${line.slice(0, 87)}…` : line,
          description: `From "${f.label}" on the scanned sheet: ${line}`,
          severity: severityFor(line),
          category: categoryFor(f.label, line),
          location_on_site: loc,
          source_field_label: f.label,
        });
      }
      continue;
    }

    // Structured condition question with a NO / fail / descriptive answer.
    if (looksLikeNo(value) || isDescriptiveDefect(value)) {
      const title = looksLikeNo(value)
        ? `${f.label} — answered ${value.toUpperCase()}`
        : `${f.label}: ${value}`;
      out.push({
        key: `field:${f.id}`,
        title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
        description: `From "${f.label}" (${f.section || "Answers"}) on the scanned sheet: ${value}`,
        severity: severityFor(value),
        category: categoryFor(f.label, value),
        location_on_site: extractLocation(value) || riserLocation,
        source_field_label: f.label,
      });
    }
  }

  // Deduplicate by title (keep first) — repeated NO answers on similar
  // rows shouldn't spawn 5 near-identical proposals.
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = d.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type CreatedArchiveDefect = { id: string; title: string };

/**
 * Insert confirmed proposals as defect records linked to the archived
 * document (source_kind = 'archive'). Never linked to a job.
 */
export async function createArchiveSourcedDefects(params: {
  userId: string;
  archivedId: string;
  customerId: string | null;
  siteId: string | null;
  documentDate: string | null;
  templateName: string | null;
  proposals: ProposedDefect[];
}): Promise<CreatedArchiveDefect[]> {
  const {
    userId,
    archivedId,
    siteId,
    documentDate,
    templateName,
    proposals,
  } = params;
  if (!proposals.length) return [];

  const sourceNote = documentDate
    ? `from archived report dated ${documentDate}`
    : `from archived report`;

  const rows = proposals.map((p) => ({
    title: p.title,
    description: [
      p.description,
      `(Auto-proposed ${sourceNote}${templateName ? ` — ${templateName}` : ""}. Reviewed and confirmed by office before creation.)`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    severity: p.severity,
    category: p.category,
    location_on_site: p.location_on_site || null,
    site_id: siteId,
    job_id: null,
    reported_by: userId,
    source_kind: "archive",
    source_archived_document_id: archivedId,
    status: "open",
  }));

  const { data, error } = await supabase
    .from("defects")
    .insert(rows as any)
    .select("id, title");
  if (error) {
    console.error("[createArchiveSourcedDefects] insert failed", error);
    throw error;
  }
  return (data as any[]) || [];
}
