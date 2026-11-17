import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { jobStatusFailureMessage, JOB_STATUS_PERMISSION_MESSAGE } from "@/lib/jobStatusUpdate";

describe("job status failure message", () => {
  it("says only admins/office can change status when blocked by permissions", () => {
    expect(jobStatusFailureMessage({ code: "42501", message: "denied" }, 0, 1)).toBe("Only admins and office staff can change a job's status.");
  });
  it("treats a silently skipped row as a permission refusal", () => {
    expect(jobStatusFailureMessage(null, 0, 1)).toBe(JOB_STATUS_PERMISSION_MESSAGE);
  });
  it("returns no message when every job updated", () => {
    expect(jobStatusFailureMessage(null, 2, 2)).toBe("");
  });
});
