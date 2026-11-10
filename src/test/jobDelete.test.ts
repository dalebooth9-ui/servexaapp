import { describe, it, expect } from "vitest";
import { jobDeleteSummary, plainDeleteError } from "@/lib/jobDelete";

const base = { id: "1", reference: "VFP-1", name: "x", blockers: [], visits: 0, risers: 0, draft_quotes: 0, draft_reports: 0, assignments: 0, photos: 0 };

describe("job delete", () => {
  it("lists linked records", () => {
    expect(jobDeleteSummary({ ...base, visits: 3, risers: 2, draft_quotes: 1 })).toBe(
      "This job has 3 scheduled visits, 2 risers, 1 draft quote. Delete all of these?",
    );
  });
  it("explains foreign key failures in plain English", () => {
    expect(plainDeleteError('update or delete on table "jobs" violates foreign key constraint "x" on table "job_risers"')).toBe(
      "Couldn't delete: the job is still linked to job risers.",
    );
  });
});
