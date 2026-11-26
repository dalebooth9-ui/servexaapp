/** Per-company Planner settings (app_settings key "planner_config"): feature switches, job tags and cheat-sheet sections.
 *  A company with no saved row gets the defaults below — every feature on, the starter tag set and one "General" section. */
export const PLANNER_CONFIG_KEY = "planner_config";

export type PlannerFeature = "weeklySheet" | "provisional" | "import" | "flags" | "clash" | "tags" | "cheatSheet" | "followUps";
export const PLANNER_FEATURES: { key: PlannerFeature; label: string; description: string }[] = [
  { key: "weeklySheet", label: "Weekly sheet printing", description: "Print or download each engineer's weekly sheet from the Planner." },
  { key: "provisional", label: "Month-only (provisional) bookings and Look-ahead", description: "Book a job for a month without a day, and plan months ahead on the Look-ahead tab." },
  { key: "import", label: "Photo/paste import", description: "Turn a photo, spreadsheet or pasted lines into reviewed Planner entries." },
  { key: "flags", label: "Time and access flags", description: "Time window, call-ahead, access contact and notes on each job." },
  { key: "clash", label: "Double-booking warning", description: "A gentle warning when a site is booked twice on a day or in a week." },
  { key: "tags", label: "Tags", description: "Coloured tags on jobs and a tag filter in the Job Pool." },
  { key: "cheatSheet", label: "Cheat sheet", description: "A quick reference page for everyone, edited by admins." },
  { key: "followUps", label: "Follow-up reminders", description: "Dated reminders on a job that show on the office dashboard when due." },
];

export interface JobTagDef { key: string; label: string; color: string; highlight: boolean }
/** Starter set only — each company renames, recolours, adds or removes them in Settings. */
export const DEFAULT_JOB_TAGS: JobTagDef[] = [
  { key: "remedial", label: "Remedial", color: "#db2777", highlight: true },
  { key: "sos", label: "SOS", color: "#dc2626", highlight: true },
  { key: "materials", label: "Materials needed", color: "#d97706", highlight: false },
  { key: "quote_follow_up", label: "Quote follow-up", color: "#0284c7", highlight: false },
  { key: "priority", label: "Priority", color: "#7c3aed", highlight: true },
];
export const DEFAULT_CHEAT_SECTIONS = ["General"];

export interface PlannerConfig { features: Record<PlannerFeature, boolean>; tags: JobTagDef[]; cheatSections: string[] }

const HEX = /^#[0-9a-f]{6}$/i;
export function parsePlannerConfig(v: unknown): PlannerConfig {
  const o = (v && typeof v === "object" ? v : {}) as any;
  const f = (o.features && typeof o.features === "object" ? o.features : {}) as Record<string, unknown>;
  const features = Object.fromEntries(PLANNER_FEATURES.map(({ key }) => [key, f[key] !== false])) as Record<PlannerFeature, boolean>;
  const tags: JobTagDef[] = Array.isArray(o.tags)
    ? o.tags.filter((t: any) => t && typeof t.key === "string" && typeof t.label === "string" && t.label.trim())
        .map((t: any) => ({ key: t.key, label: t.label.trim(), color: HEX.test(t.color) ? t.color : "#64748b", highlight: !!t.highlight }))
    : DEFAULT_JOB_TAGS.map((t) => ({ ...t }));
  const cheatSections: string[] = Array.isArray(o.cheatSections)
    ? [...new Set<string>(o.cheatSections.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim()))]
    : [...DEFAULT_CHEAT_SECTIONS];
  return { features, tags, cheatSections };
}
export const defaultPlannerConfig = () => parsePlannerConfig(null);

export const tagDef = (defs: JobTagDef[], key: string) => defs.find((t) => t.key === key);

/** Unique key for a new tag label. */
export function newTagKey(label: string, defs: JobTagDef[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "tag";
  let k = base, n = 2; while (defs.some((t) => t.key === k)) k = `${base}_${n++}`;
  return k;
}

/** Tag keys a job effectively carries: its own tags, plus remedial/priority/SOS implied by the job itself
 *  (only matters if the company still has a tag with that key). */
export function effectiveTagKeys(j: { tags?: string[] | null; isRemedial?: boolean; priority?: string | null; jobType?: string | null; jobName?: string | null }): string[] {
  const s = new Set(j.tags || []);
  const pr = (j.priority || "").toLowerCase();
  const t = `${j.jobType || ""} ${j.jobName || ""}`.toLowerCase();
  if (j.isRemedial || /\bremedial\b/.test(t)) s.add("remedial");
  if (["high", "urgent", "critical"].includes(pr)) s.add("priority");
  if (["sos", "emergency"].includes(pr) || /\b(sos|emergency)\b/.test(t)) s.add("sos");
  return [...s];
}
/** Shaded on the printed sheet only when one of the job's tags has "highlight on printed sheet" ticked. */
export function isTagHighlighted(keys: string[], defs: JobTagDef[]): boolean {
  return keys.some((k) => tagDef(defs, k)?.highlight);
}

/** Section order from settings, then any section names still used by older notes. */
export function cheatSectionOrder(config: string[], entrySections: string[]): string[] {
  return [...config, ...[...new Set(entrySections)].filter((s) => !config.includes(s))];
}

/** Chip colours from the tag's own colour (user data, not theme). */
export function tagChipStyle(color: string, on = true): Record<string, string> {
  return on ? { borderColor: color, color, backgroundColor: `${color}1f` } : {};
}
