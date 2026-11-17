/** The single stage-driven button in the job page header. */
export type JobMainAction = "fill_in_report" | "send_to_customer" | "create_invoice" | null;

export const JOB_MAIN_ACTION_LABEL: Record<Exclude<JobMainAction, null>, string> = {
  fill_in_report: "Fill in report",
  send_to_customer: "Send to customer",
  create_invoice: "Create invoice",
};

export function jobMainAction(status: string | null | undefined): JobMainAction {
  switch (status) {
    case "cancelled":
      return null;
    case "pending_review":
      return "send_to_customer";
    case "completed":
    case "archived":
      return "create_invoice";
    default:
      return "fill_in_report";
  }
}
