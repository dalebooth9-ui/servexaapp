import { describe, it, expect } from "vitest";
import { blankUncertainAnswers, fieldsToCheck, transcriptionNote, convertedSourceMap } from "@/lib/handwrittenConversion";

const fields = [
  { id: "valve", type: "select" },
  { id: "glass", type: "checkbox" },
  { id: "outlets", type: "number" },
  { id: "sig", type: "signature" },
];

describe("handwritten conversion", () => {
  it("leaves unclear answers blank instead of guessing (including ticks)", () => {
    const r = blankUncertainAnswers({ valve: "Landing valve", glass: "yes" }, { valve: 0.9, glass: 0.4 }, fields);
    expect(r.values).toEqual({ valve: "Landing valve" });
    expect(r.blanked).toEqual(["glass"]);
  });

  it("flags blanked and unread answers for checking, but not signatures", () => {
    expect(fieldsToCheck({ valve: "x", outlets: 6 }, ["glass"], fields)).toEqual(["glass"]);
    expect(fieldsToCheck({ valve: "x" }, [], fields)).toEqual(["glass", "outlets"]);
  });

  it("prints who typed it up and when", () => {
    expect(transcriptionNote({ by_name: "Dale Booth", at: "2026-11-16T15:00:00Z" }))
      .toBe("Transcribed from handwritten original by Dale Booth, 16/11/2026");
    expect(transcriptionNote(null)).toBeNull();
  });

  it("links a converted photo to its newest report", () => {
    const m = convertedSourceMap([
      { id: "r1", created_at: "2026-11-16T10:00:00Z", status: "draft", responses: { _transcribed_from: { submission_ids: ["p1"] } } },
      { id: "r2", created_at: "2026-11-16T11:00:00Z", status: "submitted", responses: { _transcribed_from: { submission_ids: ["p1", "p2"] } } },
      { id: "r3", responses: {} },
    ]);
    expect(m.get("p1")).toEqual({ responseId: "r2", status: "submitted" });
    expect(m.get("p2")?.responseId).toBe("r2");
    expect(m.size).toBe(2);
  });
});
