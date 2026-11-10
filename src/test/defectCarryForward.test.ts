import { describe, it, expect } from "vitest";
import { suggestWorksAndMaterials, remedialsForRiser, carriedReportFields, type CarriedRemedial } from "@/lib/defectCarryForward";

describe("suggestWorksAndMaterials", () => {
  it("turns 'inlet box needs securing' into 'Secure inlet box'", () => {
    expect(suggestWorksAndMaterials("Dry riser — inlets: Secure dry riser inlet box", "inlet box needs securing").works).toBe("Secure inlet box");
  });
  it("missing parts become supply-and-fit with materials", () => {
    expect(suggestWorksAndMaterials("Missing outlet cap")).toEqual({ works: "Supply and fit outlet cap", materials: "Outlet cap" });
  });
  it("leaves fields blank when nothing can be inferred", () => {
    expect(suggestWorksAndMaterials("General observation")).toEqual({ works: "", materials: "" });
  });
});

const row = (id: string, asset_id: string | null): CarriedRemedial => ({ id, asset_id, title: "Inlet sign required", riser: null, works_required: "Fit inlet sign", materials_required: "Inlet sign", visit_date: null, carry_outcome: null, carry_comment: null });
describe("job report defect membership", () => {
  it("includes unmatched defects as general items on a riser's report", () => {
    expect(remedialsForRiser([row("general", null), row("riser3", "3"), row("riser4", "4")], "3").map(r => r.id)).toEqual(["general", "riser3"]);
  });
  it("prints the selected defect's works and materials", () => {
    const report = carriedReportFields([row("wade", null)]);
    expect(report.answers.carried_wade).toContain("Works required: Fit inlet sign");
    expect(report.answers.carried_wade).toContain("Materials required: Inlet sign");
  });
});
