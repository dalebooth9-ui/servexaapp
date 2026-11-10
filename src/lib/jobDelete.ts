export interface JobDeletePreview {
  id: string;
  reference: string;
  name: string;
  blockers: string[];
  visits: number;
  risers: number;
  draft_quotes: number;
  draft_reports: number;
  assignments: number;
  photos: number;
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** "This job has 3 scheduled visits, 2 risers, 1 draft quote. Delete all of these?" */
export function jobDeleteSummary(p: JobDeletePreview): string {
  const parts: string[] = [];
  if (p.visits) parts.push(plural(p.visits, "scheduled visit"));
  if (p.risers) parts.push(plural(p.risers, "riser"));
  if (p.draft_quotes) parts.push(plural(p.draft_quotes, "draft quote"));
  if (p.draft_reports) parts.push(plural(p.draft_reports, "unfinished report"));
  if (p.assignments) parts.push(plural(p.assignments, "assigned engineer"));
  if (p.photos) parts.push(plural(p.photos, "photo/document", "photos/documents"));
  if (!parts.length) return "Nothing else is linked to this job.";
  return `This job has ${parts.join(", ")}. Delete all of these?`;
}

/** Turn a database error into a plain-English reason. */
export function plainDeleteError(msg: string): string {
  const m = msg || "";
  if (/violates foreign key constraint.*on table "([^"]+)"/i.test(m)) {
    const t = m.match(/on table "([^"]+)"/i)?.[1]?.replace(/_/g, " ") ?? "another record";
    return `Couldn't delete: the job is still linked to ${t}.`;
  }
  if (/permission denied|row-level security|Only admins/i.test(m)) return "Couldn't delete: only admins can delete jobs.";
  if (/archive instead/i.test(m)) return `Couldn't delete: ${m}.`;
  return `Couldn't delete: ${m}`;
}
