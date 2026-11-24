import { describe, it, expect } from "vitest";
import { unitNumberFrom, unitKindForTemplate, proposeUnitDefects, remedialLinesFromComment, unitResultFrom, normaliseUnitType } from "@/lib/siteUnits";

describe("hydrant units", () => {
  it("Fire Hydrant templates are hydrant units", () => expect(unitKindForTemplate({ name: "Fire Hydrant — 6 Month Visual Check", category: "fire_hydrant" })).toBe("hydrant"));
  it("dry riser templates are not units", () => expect(unitKindForTemplate({ name: "Dry Riser Visual", category: "dry_riser" })).toBeNull());
  it("reads the hydrant number from the sheet", () => {
    expect(unitNumberFrom({ reference: "1" }, "hydrant")).toBe(1);
    expect(unitNumberFrom({ hydrant_reference: "Hydrant No 2" }, "hydrant")).toBe(2);
    expect(unitNumberFrom({ reference: "" }, "hydrant")).toBeNull();
  });
  it("comments 'grid needs painting' and 'gauge reader faulty' become two defects, ticked", () => {
    const d = proposeUnitDefects({ comments: "GRID NEEDS PAINTING\nGAUGE READER FAULTY", flow_rate: "295", flow_result: "pass" }, "hydrant", "Hydrant 1");
    expect(d.map((x) => x.title)).toEqual(["Hydrant 1: Grid needs painting", "Hydrant 1: Gauge reader faulty"]);
    expect(d.every((x) => x.defaultTicked)).toBe(true);
  });
  it("zero flow offers a no-flow defect", () => expect(proposeUnitDefects({ flow_rate: "0" }, "hydrant", "Hydrant 2")[0].key).toBe("unit:no_flow"));
  it("a flow marked failed offers a low-flow defect; a plain number alone does not", () => {
    expect(proposeUnitDefects({ flow_rate: "120", flow_result: "fail" }, "hydrant", "H")[0].key).toBe("unit:low_flow");
    expect(proposeUnitDefects({ flow_rate: "120", flow_result: "pass" }, "hydrant", "H")).toEqual([]);
  });
  it("ordinary comments are not defects", () => expect(remedialLinesFromComment("Pick keys up from security cabin")).toEqual([]));
  it("records last flow in LPM and type", () => {
    const r = unitResultFrom({ flow_rate: "296", hydrant_type: "SCREWDOWN", hydrant_location: "Corner of Noble St", overall_result: "pass" }, "hydrant", "2026-04-19");
    expect(r).toMatchObject({ reading: "296", reading_unit: "LPM", type: "Screwdown", location: "Corner of Noble St", result: "pass", inspected: "2026-04-19" });
  });
  it("normalises written types", () => expect(normaliseUnitType("sluice", "hydrant")).toBe("Sluice"));
});
