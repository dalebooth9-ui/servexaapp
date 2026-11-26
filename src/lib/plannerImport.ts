/** Turns AI-read planner lines into reviewable drafts; matching only, nothing is saved here. */
export interface ImportSite { id: string; name: string; postcode: string | null; customer_id?: string | null }
export interface ImportEngineer { user_id: string; full_name: string }
export interface AiPlannerLine {
  company: string; site: string; postcode: string; job_type: string; quantity: number | null;
  date: string; target_month: string; engineer: string; comments: string; time_window: string; confidence: "high" | "low"; raw: string;
}
export interface DraftEntry extends AiPlannerLine { site_id: string | null; site_new: boolean; engineer_id: string | null; include: boolean }

const norm = (s: string) => (s || "").toLowerCase().replace(/\b(ltd|limited|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const pc = (s: string) => (s || "").toUpperCase().replace(/\s+/g, "");

export function matchSite(line: { site: string; postcode: string }, sites: ImportSite[]): ImportSite | null {
  if (line.postcode && pc(line.postcode).length >= 5) {
    const byPc = sites.filter((s) => s.postcode && pc(s.postcode) === pc(line.postcode));
    if (byPc.length === 1) return byPc[0];
    const named = byPc.find((s) => norm(s.name).includes(norm(line.site)) || norm(line.site).includes(norm(s.name)));
    if (named) return named;
  }
  const n = norm(line.site); if (n.length < 3) return null;
  const exact = sites.filter((s) => norm(s.name) === n);
  if (exact.length === 1) return exact[0];
  const part = sites.filter((s) => { const sn = norm(s.name); return sn.length >= 3 && (sn.startsWith(n) || n.startsWith(sn)); });
  return part.length === 1 ? part[0] : null;
}

export function matchEngineer(name: string, engineers: ImportEngineer[]): ImportEngineer | null {
  const n = norm(name); if (!n) return null;
  const hits = engineers.filter((e) => { const f = norm(e.full_name); return f === n || f.split(" ")[0] === n || f.split(" ").map((w) => w[0]).join("") === n.replace(/ /g, ""); });
  return hits.length === 1 ? hits[0] : null;
}

/** Accepts yyyy-MM-dd only; anything else is dropped so she picks it in review. */
export const isoDateOrEmpty = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") && !isNaN(Date.parse(d)) ? d : "");
export const isoMonthOrEmpty = (m: string) => (/^\d{4}-(0[1-9]|1[0-2])$/.test((m || "").slice(0, 7)) ? m.slice(0, 7) : "");

export function toDrafts(lines: AiPlannerLine[], sites: ImportSite[], engineers: ImportEngineer[]): DraftEntry[] {
  return lines.map((l) => {
    const s = matchSite(l, sites); const e = matchEngineer(l.engineer, engineers);
    const date = isoDateOrEmpty(l.date);
    return { ...l, date, target_month: date ? "" : isoMonthOrEmpty(l.target_month), site_id: s?.id || null, site_new: !s, engineer_id: e?.user_id ?? null, include: true,
      confidence: l.confidence === "low" || !s || (!!l.engineer && !e) ? "low" : "high" };
  });
}

/** Ready to create: needs a site (existing) and either a date+engineer or a target month. */
export function draftProblem(d: DraftEntry): string | null {
  if (!d.site_id) return "Pick a site (new sites must be added first)";
  if (d.date && !d.engineer_id) return "Pick an engineer for the date";
  if (!d.date && !d.target_month) return "Add a date or target month";
  return null;
}
