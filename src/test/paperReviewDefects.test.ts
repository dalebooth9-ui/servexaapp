import { describe, expect, it } from "vitest";
import { proposeDefectsFromExtraction } from "@/lib/proposeArchiveDefects";

describe("paper review defect proposals", () => {
  it("includes failed sheet items", () => {
    expect(proposeDefectsFromExtraction([{ id: "valve", label: "Valve condition", type: "checkbox" }], { valve: "fail" })).toMatchObject([{ key: "field:valve", source_field_label: "Valve condition" }]);
  });
  it("includes remedial work in remarks", () => {
    expect(proposeDefectsFromExtraction([{ id: "notes", label: "Comments", type: "textarea" }], { notes: "Remedial work to landing valve" })).toHaveLength(1);
  });
  it("does not propose N/A annotations as defects", () => {
    expect(proposeDefectsFromExtraction([{ id: "cab", label: "Cabinet condition" }], { cab: "N/A - EXPOSED VALVE" })).toEqual([]);
  });
});