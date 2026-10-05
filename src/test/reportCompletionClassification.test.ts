import { describe, expect, it } from "vitest";
import { classifyReportsForCompletion } from "@/lib/reportReview";

const fields = [{ id: "result", type: "text", label: "Result" }];

describe("report completion classification", () => {
  it("marks untouched reports not used and does not prompt", () => {
    const result = classifyReportsForCompletion([
      { id: "done", status: "submitted", responses: { result: "Pass" }, job_sheet_templates: { fields } },
      { id: "unused-1", status: "draft", responses: { _system_label: "System 2 of 3" }, job_sheet_templates: { fields } },
      { id: "unused-2", status: "draft", responses: {}, job_sheet_templates: { fields } },
    ]);

    expect(result).toEqual({ total: 3, completed: 1, untouchedIds: ["unused-1", "unused-2"], unfinishedIds: [] });
  });

  it("prompts once for a started unfinished report", () => {
    const result = classifyReportsForCompletion([
      { id: "done", status: "submitted", responses: { result: "Pass" }, job_sheet_templates: { fields } },
      { id: "half-filled", status: "draft", responses: { result: "Started" }, job_sheet_templates: { fields } },
    ]);

    expect(result).toEqual({ total: 2, completed: 1, untouchedIds: [], unfinishedIds: ["half-filled"] });
  });

  it("keeps already not-used reports in the office total but out of prompts", () => {
    const result = classifyReportsForCompletion([
      { id: "done", status: "submitted", responses: { result: "Pass" }, job_sheet_templates: { fields } },
      { id: "unused", status: "not_used", responses: {}, job_sheet_templates: { fields } },
    ]);

    expect(result).toEqual({ total: 2, completed: 1, untouchedIds: [], unfinishedIds: [] });
  });
});