import type { AccessDetails } from "@/lib/siteAccessRules";
import { DEFAULT_JOB_TAGS, effectiveTagKeys, isTagHighlighted, type JobTagDef } from "@/lib/plannerConfig";
import { jobFlagLines, type JobFlags } from "@/lib/jobFlags";

/** One planner booking flattened for the office's printed weekly sheet. */
export interface WeeklySheetInput {
  date: string; // yyyy-MM-dd
  engineerId: string;
  engineerName: string;
  company: string;
  siteName: string;
  siteAddress: string;
  postcode: string;
  jobName: string;
  pressureQty: number;
  visualQty: number;
  otherQty: number;
  otherType: string | null;
  priority: string | null;
  isRemedial: boolean;
  jobType: string | null;
  po: string | null;
  scheduleNotes: string | null;
  access: AccessDetails | null;
  tags?: string[] | null;
  flags?: JobFlags | null;
}

export interface WeeklySheetRow {
  date: string;
  dateLabel: string;
  engineerId: string;
  engineerName: string;
  company: string;
  site: string;
  postcode: string;
  description: string;
  comment: string;
  highlight: boolean;
}

/** "x1 pressure test", "x3 visual inspection"; falls back to the job name. */
export function jobDescription(i: Pick<WeeklySheetInput, "pressureQty" | "visualQty" | "otherQty" | "otherType" | "jobName">): string {
  const p: string[] = [];
  if (i.pressureQty > 0) p.push(`x${i.pressureQty} pressure test`);
  if (i.visualQty > 0) p.push(`x${i.visualQty} visual inspection`);
  if (i.otherQty > 0) p.push(`x${i.otherQty} ${(i.otherType || "other").toLowerCase()}`);
  return p.length ? p.join(", ") : i.jobName;
}

/** Shaded only when one of the job's tags (including remedial/priority/SOS implied by the job) has
 *  "highlight on printed sheet" ticked in the company's tag settings. */
export function isHighlighted(i: Pick<WeeklySheetInput, "priority" | "isRemedial" | "jobType" | "jobName"> & { tags?: string[] | null }, defs: JobTagDef[] = DEFAULT_JOB_TAGS): boolean {
  return isTagHighlighted(effectiveTagKeys(i), defs);
}

/** Outward postcode letters ("DE1 2SA" -> "DE") so a day's jobs cluster by town. */
export function postcodeArea(pc: string): string {
  const m = (pc || "").trim().toUpperCase().match(/^([A-Z]{1,2})(\d[A-Z\d]?)/);
  return m ? `${m[1]}${m[2].padStart(2, "0")}` : "~"; // unknown postcodes go last
}

export function sheetComment(i: Pick<WeeklySheetInput, "po" | "scheduleNotes" | "access"> & { flags?: JobFlags | null }, showFlags = true): string {
  const out: string[] = [];
  if (i.po) out.push(`PO ${i.po}`);
  if (i.flags && showFlags) out.push(...jobFlagLines(i.flags, { po: false }));
  if (i.scheduleNotes) out.push(i.scheduleNotes);
  const a = i.access || {};
  if (a.opening_hours) out.push(`Hours: ${a.opening_hours}`);
  if (a.entry_methods?.includes("Call ahead")) out.push("Call ahead");
  const contact = [a.contact_name, a.contact_phone].filter(Boolean).join(" ");
  if (contact) out.push(`Contact: ${contact}`);
  if (a.key_location) out.push(`Keys: ${a.key_location}`);
  if (a.notes) out.push(a.notes);
  return out.join(" · ");
}

function ukDate(d: string): string {
  const [y, m, day] = d.split("-");
  const wd = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date(`${d}T12:00:00Z`).getUTCDay()];
  return `${wd} ${day}/${m}/${y}`;
}

export interface WeeklySheetOptions { tagDefs?: JobTagDef[]; sortByPostcode?: boolean; showFlags?: boolean }
/** Sorted by date, then (optionally) postcode area and postcode, then customer. */
export function buildWeeklySheetRows(inputs: WeeklySheetInput[], opts: WeeklySheetOptions = {}): WeeklySheetRow[] {
  const byPc = opts.sortByPostcode !== false;
  return [...inputs]
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (byPc ? postcodeArea(a.postcode).localeCompare(postcodeArea(b.postcode)) || a.postcode.localeCompare(b.postcode) : 0) ||
      a.company.localeCompare(b.company))
    .map((i) => ({
      date: i.date,
      dateLabel: ukDate(i.date),
      engineerId: i.engineerId,
      engineerName: i.engineerName,
      company: i.company,
      site: [i.siteName, i.siteAddress && i.siteAddress !== i.siteName ? i.siteAddress : ""].filter(Boolean).join("\n"),
      postcode: i.postcode,
      description: jobDescription(i),
      comment: sheetComment(i, opts.showFlags !== false),
      highlight: isHighlighted(i, opts.tagDefs),
    }));
}

/** Groups rows per engineer (sheet per engineer), or one combined company sheet. */
export function groupSheets(rows: WeeklySheetRow[], combined: boolean): { title: string; rows: WeeklySheetRow[] }[] {
  if (combined) return [{ title: "ALL ENGINEERS", rows }];
  const m = new Map<string, { title: string; rows: WeeklySheetRow[] }>();
  for (const r of rows) {
    if (!m.has(r.engineerId)) m.set(r.engineerId, { title: r.engineerName.toUpperCase(), rows: [] });
    m.get(r.engineerId)!.rows.push(r);
  }
  return [...m.values()].sort((a, b) => a.title.localeCompare(b.title));
}
