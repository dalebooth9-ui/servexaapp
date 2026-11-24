import { describe, it, expect } from "vitest";
import { usesPrintedSheetLayout, hasTableAnswers } from "@/lib/printedSheetLayout";
import { isRatingField, normaliseRating } from "@/lib/ratingFields";
import { pickOption } from "@/lib/paperFormFill";
import { normalizeExtractedAnswers } from "@/lib/scanPipeline";

describe("Fair is kept on Good / Fair / Poor ratings", () => {
  const cabinets = { id: "c", label: "Outlet cabinets in good condition?", type: "checkbox" };
  it("treats outlet cabinets as a three-way rating", () => expect(isRatingField(cabinets)).toBe(true));
  it("treats a Good/Fair/Poor select as a rating", () => expect(isRatingField({ label: "Pump", options: ["Good", "Fair", "Poor"] })).toBe(true));
  it("does not treat a plain yes/no tick as a rating", () => expect(isRatingField({ label: "Pit dry?" })).toBe(false));
  it("keeps Fair when the scan says Fair", () => expect(normalizeExtractedAnswers({ c: "FAIR" }, [cabinets as any]).c).toBe("Fair"));
  it("the PDF boxes FAIR for a Fair answer", () => expect(pickOption(["GOOD", "FAIR", "POOR"], "Fair")).toBe("FAIR"));
  it("the PDF still boxes GOOD for an old yes tick", () => expect(pickOption(["GOOD", "FAIR", "POOR"], true)).toBe("GOOD"));
  it("the PDF boxes POOR for Poor", () => expect(pickOption(["GOOD", "FAIR", "POOR"], normaliseRating("poor"))).toBe("POOR"));
});

describe("Printed-sheet layout", () => {
  it.each([
    "Dry Riser — Pressure Test", "Dry Riser — Visual Inspection", "Dry Riser — Commissioning",
    "Wet Riser — Annual Service & Test", "Wet Riser — Visual Inspection",
    "Fire Hydrant — Annual Inspection", "Fire Hydrant — 6 Month Visual Check",
  ])("%s uses the printed sheet", (n) => expect(usesPrintedSheetLayout(n)).toBe(true));
  it.each([
    "Residential & Domestic Sprinkler — Annual Service", "Commercial Sprinkler — Annual Service (BS EN 12845)",
    "Dry Riser — Visual Inspection — RETIRED duplicate", "Emergency Lighting",
  ])("%s keeps the report layout", (n) => expect(usesPrintedSheetLayout(n)).toBe(false));
  it("table answers keep the report layout", () => {
    expect(hasTableAnswers([{ id: "z", type: "repeating_table" }], { z: [{ a: 1 }] })).toBe(true);
    expect(hasTableAnswers([{ id: "z", type: "repeating_table" }], { z: [] })).toBe(false);
  });
});
