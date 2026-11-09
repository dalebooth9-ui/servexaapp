import { describe, it, expect } from "vitest";
import { suggestWorksAndMaterials } from "@/lib/defectCarryForward";

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
