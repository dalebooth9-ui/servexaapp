import { describe, it, expect } from "vitest";
import { engineerDuplicateWarnings } from "./engineerDuplicates";
describe("engineerDuplicateWarnings", () => {
  it("flags shared phone and near-identical name", () => {
    const w = engineerDuplicateWarnings([
      { user_id: "a", full_name: "Dale Booth", phone: "07886 078482" },
      { user_id: "b", full_name: "Dale Booth (Office)", phone: "+447886078482" },
      { user_id: "c", full_name: "Wayne Smith", phone: "07000 000000" },
    ]);
    expect(w.a).toContain("Same phone as Dale Booth (Office)");
    expect(w.b).toContain("Similar name to Dale Booth");
    expect(w.c).toBeUndefined();
  });
});
