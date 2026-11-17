import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorLogger";

export const JOB_STATUS_PERMISSION_MESSAGE = "Only admins and office staff can change a job's status.";

export type StatusUpdateContext = {
  realRole: string | null;
  orgId: string | null;
  previewingAsEngineer?: boolean;
};

/** Plain-English message for a failed status change. */
export function jobStatusFailureMessage(error: { code?: string; message?: string } | null, updated: number, requested: number): string {
  if (error) {
    if (error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? "")) {
      return JOB_STATUS_PERMISSION_MESSAGE;
    }
    return `Couldn't change the job status: ${error.message ?? "unknown error"}. Please try again.`;
  }
  if (updated < requested) return JOB_STATUS_PERMISSION_MESSAGE;
  return "";
}

/**
 * Changes job status and returns a plain-English failure message (or null on success).
 * Every failure is logged with the real role and company.
 */
export async function updateJobStatus(ids: string[], status: string, ctx: StatusUpdateContext): Promise<string | null> {
  const { data, error } = await supabase.from("jobs").update({ status } as never).in("id", ids).select("id");
  const updated = data?.length ?? 0;
  const message = jobStatusFailureMessage(error, updated, ids.length);
  if (!message) return null;
  logError({
    source: "api",
    message: `Job status change failed: ${message}`,
    context: {
      action: "job_status_change",
      job_ids: ids,
      new_status: status,
      real_role: ctx.realRole,
      org_id: ctx.orgId,
      previewing_as_engineer: !!ctx.previewingAsEngineer,
      updated,
      db_error: error ? { code: error.code, message: error.message, details: error.details } : null,
    },
  });
  return message;
}
