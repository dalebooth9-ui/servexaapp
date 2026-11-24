import { describe, it, expect } from "vitest";
import { realLineBreaks, splitSheetNotes, applySheetNotes, promoteUnmapped } from "@/lib/paperSheetNotes";

const ELITE = "PICK KEYS UP FROM ITC BUSINESS PARK SECURITY CABIN, DE24 8UP\\nANY ISSUES RING KENNY 07468752639\\nINLET VALVE: PN16 / TABLE D\\nOUTLET VALVE: PN16 FLANGE / MALE THREAD / TABLE D FLANGE / FEMALE THREAD";

describe("converted sheet notes", () => {
  it("turns literal \\n into real line breaks", () => {
    expect(realLineBreaks("LID NEEDS PAINTING\\nGAUGE READER FAULTY")).toBe("LID NEEDS PAINTING\nGAUGE READER FAULTY");
  });
  it("splits inlet valve, outlet valve and access notes into their own rows", () => {
    const s = splitSheetNotes(ELITE);
    expect(s.inlet_valve).toBe("PN16 / TABLE D");
    expect(s.outlet_valve).toBe("PN16 FLANGE / MALE THREAD / TABLE D FLANGE / FEMALE THREAD");
    expect(s.access_notes).toBe("PICK KEYS UP FROM ITC BUSINESS PARK SECURITY CABIN, DE24 8UP\nANY ISSUES RING KENNY 07468752639");
    expect(s.other).toBe("");
  });
  it("leaves additional notes empty once everything has a row", () => {
    const fields = [{ id: "access_notes", label: "Access notes" }, { id: "inlet_valve", label: "Inlet valve" }, { id: "outlet_valve", label: "Outlet valve" }];
    const r = applySheetNotes({ additional_notes: ELITE }, fields);
    expect(r.inlet_valve).toBe("PN16 / TABLE D");
    expect(r.access_notes).toContain("RING KENNY");
    expect(r.additional_notes).toBeNull();
  });
  it("keeps lines in notes when the template has no row for them", () => {
    const r = applySheetNotes({ additional_notes: ELITE }, []);
    expect(r.additional_notes).toContain("INLET VALVE: PN16 / TABLE D");
  });
  it("adds a template row for a sheet question with no row, keeping free text aside", () => {
    const { added, answers, remaining } = promoteUnmapped(
      [{ id: "pit_dry", label: "Pit Dry", type: "checkbox" }],
      [{ label: "3. Is Pit Structurally Sound?", value: "Yes" }, { label: "Is Pit Dry?", value: "No" }, { label: "Notes", value: "Tenant says the gate sticks" }],
    );
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ id: "pit_structurally_sound", label: "Pit Structurally Sound", type: "checkbox" });
    expect(answers).toEqual({ pit_structurally_sound: "yes", pit_dry: "no" });
    expect(remaining).toEqual([{ label: "Notes", value: "Tenant says the gate sticks" }]);
  });
});

import { hydrantLocationText, hydrantPoText } from "@/lib/paperSheetNotes";
import { isPrintableFinancialField } from "@/lib/printBrandingRules";

describe("hydrant header cells", () => {
  it("puts the hydrant number and location in the location box", () => {
    expect(hydrantLocationText({ reference: "2", hydrant_location: "CORNER OF NOBLE ST AND NELSON ST" })).toBe("Hydrant 2 – CORNER OF NOBLE ST AND NELSON ST");
  });
  it("never prints the hydrant number as the PO", () => {
    expect(hydrantPoText(null, { reference: "2" })).toBe("");
    expect(hydrantPoText("PO-4471", { reference: "2" })).toBe("PO-4471");
  });
  it("keeps flow rate rows on printed sheets while hiding money rows", () => {
    expect(isPrintableFinancialField({ id: "flow_rate", label: "Flow Rate (L/min)" })).toBe(false);
    expect(isPrintableFinancialField({ id: "flow_rate_lps", label: "Flow Rate (L/s)" })).toBe(false);
    expect(isPrintableFinancialField({ id: "hourly_rate", label: "Hourly rate" })).toBe(true);
  });
});
