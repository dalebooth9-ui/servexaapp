/** Every defect status the database accepts (see validate_defect_fields). */
export const DEFECT_STATUSES = ["open", "in_progress", "scheduled", "quoted", "approved", "job_created", "resolved", "declined", "deferred"] as const;

export const DEFECT_STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", scheduled: "Scheduled", quoted: "Quoted", approved: "Approved",
  job_created: "Job Created", resolved: "Resolved", declined: "Declined", deferred: "Deferred",
};

/** Plain-English reason a defect status change was refused. */
export function defectStatusErrorMessage(err: { message?: string; code?: string } | null | undefined): string {
  const msg = String(err?.message || "");
  if (/Invalid defect status/i.test(msg)) return `The defect couldn't be updated: "${msg.split(":").pop()?.trim()}" isn't a status the system accepts.`;
  if (/row-level security|permission denied|42501/i.test(msg) || err?.code === "42501") return "The defect couldn't be updated: you don't have permission to change this defect.";
  if (/belongs to another|organisation|org/i.test(msg)) return "The defect couldn't be updated: it's linked to a record from another company.";
  if (/fetch|network|Failed to fetch/i.test(msg)) return "The defect couldn't be updated: no connection. Try again when you have signal.";
  return `The defect couldn't be updated: ${msg || "unknown error"}`;
}
