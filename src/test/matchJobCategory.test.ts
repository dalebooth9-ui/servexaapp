import { describe, it, expect } from "vitest";
import { matchJobCategory } from "../../supabase/functions/_shared/matchJobCategory";

const viva = [
  ["Dry Riser Pressure test", "dry_riser_pressure_test"], ["Fire Hydrant Service", "fire_hydrant_service"],
  ["Wet Riser Annual Service", "wet_riser_annual_service"], ["Dry Riser Visual", "dry_riser_visual"],
  ["Site Survey", "site_survey"], ["Wet Riser Visual", "wet_riser_visual"],
  ["Dry Riser Service / Testing", "dry_riser_service"], ["Extinguisher Service", "extinguisher_service"],
  ["General", "general"], ["Dry Riser installation", "dry_riser_installation"],
  ["Residential Sprinkler Service", "sprinkler_service"], ["Commercial Sprinkler Service", "commercial_sprinkler_service"],
  ["Dry Riser Remedial", "dry_riser_remedial"], ["Residential Sprinkler Remedial", "sprinkler_remedial"],
].map(([name, slug]) => ({ name, slug }));

describe("matchJobCategory (company's own job types)", () => {
  it("dry riser pressure test", () => {
    expect(matchJobCategory(viva, ["Please carry out dry riser pressure test"]).slug).toBe("dry_riser_pressure_test");
  });
  it("annual service", () => {
    expect(matchJobCategory(viva, ["PO for annual service"]).slug).toBe("wet_riser_annual_service");
  });
  it("hydrant service → Fire Hydrant Service", () => {
    expect(matchJobCategory(viva, ["hydrant service at block A"]).slug).toBe("fire_hydrant_service");
  });
  it("uncertain wording is left blank as Needs a type", () => {
    const m = matchJobCategory(viva, ["works at the riser please"]);
    expect(m.slug).toBeNull();
    expect(m.status).toBe("needs_type");
  });
  it("uses only the given company's list", () => {
    expect(matchJobCategory([{ name: "Hydrant Flow Test", slug: "hft" }, { name: "Boiler Service", slug: "b" }], ["hydrant flow test"]).slug).toBe("hft");
    expect(matchJobCategory([{ name: "Boiler Service", slug: "b" }], ["hydrant service"]).slug).toBeNull();
  });
  it("dry riser work never falls back to a generic dry riser type", () => {
    const m = matchJobCategory(viva, ["Dry riser service at block A"]);
    expect(m.slug).toBeNull();
    expect(m.status).toBe("needs_type");
    expect(matchJobCategory(viva, ["dry riser testing"]).slug).toBeNull();
  });
  it("dry riser annual → Pressure test, 6-monthly → Visual", () => {
    expect(matchJobCategory(viva, ["Annual dry riser service"]).slug).toBe("dry_riser_pressure_test");
    expect(matchJobCategory(viva, ["6 monthly dry riser check"]).slug).toBe("dry_riser_visual");
    expect(matchJobCategory(viva, ["dry riser visual inspection"]).slug).toBe("dry_riser_visual");
  });
  it("service plus remedial picks main and notes the other", () => {
    const m = matchJobCategory(viva, ["Dry riser pressure test, plus dry riser remedial works to outlet"]);
    expect(m.slug).toBe("dry_riser_pressure_test");
    expect(m.others).toContain("Dry Riser Remedial");
  });
});
