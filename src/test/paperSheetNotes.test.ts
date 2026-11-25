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

import { questionOnSheet, dropAnswersNotOnSheet } from "../../supabase/functions/_shared/notOnSheet";
import { promoteUnmapped as promote2 } from "@/lib/paperSheetNotes";
describe("hydrant answers only from the sheet", () => {
  const ocr = "FIRE HYDRANT INSPECTION 1. IS SURROUNDING PAVEMENT SOUND? YES 5. INDICATOR PLATE CORRECT 8. FITTED WITH CAP 10. HYDRANT IN WORKING ORDER 11. UNABLE TO TEST 13. FLOW RATE LPM 295 LPS COMMENTS GRID NEEDS PAINTING INLET VALVE PN16";
  const fields = [{ id: "valve_condition", label: "Main Valve Condition", type: "select" }, { id: "access_clear", label: "Access Clear (no obstruction)", type: "checkbox" }, { id: "working_order", label: "Hydrant in Working Order", type: "checkbox" }, { id: "flow_rate", label: "Flow Rate (L/min)", type: "number" }, { id: "comments", label: "Comments / Remedial Details", type: "textarea" }];
  it("drops Main Valve Condition and Access Clear, keeps what is on the sheet", () => {
    const r = dropAnswersNotOnSheet({ valve_condition: "Satisfactory", access_clear: "yes", working_order: "yes", flow_rate: 295, comments: "x" }, fields, ocr);
    expect(r.dropped.sort()).toEqual(["access_clear", "valve_condition"]);
    expect(r.kept.flow_rate).toBe(295);
  });
  it("matches a printed question", () => expect(questionOnSheet("Surrounding Pavement Sound", ocr)).toBe(true));
  it("does not invent overall pass or a flow-test answer from working order and LPM", () => {
    const r = dropAnswersNotOnSheet({ overall_result: "pass", flow_test: "yes", working_order: "yes" }, [
      { id: "overall_result", label: "Overall Inspection Result", type: "pass_fail" },
      { id: "flow_test", label: "Flow Test Carried Out", type: "checkbox" },
      fields[2],
    ], ocr);
    expect(r.kept).toEqual({ working_order: "yes" });
  });
  it("sheet wording maps to the existing row instead of a new one", () => {
    const p = promote2([{ id: "outlet_cap", label: "Outlet Cap / Blank Present (Fitted With Cap)", type: "checkbox" }, { id: "marker_post", label: "Marker Post / Indicator Plate Visible and Correct", type: "checkbox" }], [{ label: "8. Fitted with cap?", value: "yes" }, { label: "5. Indicator plate correct", value: "yes" }] as any);
    expect(p.added).toHaveLength(0);
    expect(p.answers).toEqual({ outlet_cap: "yes", marker_post: "yes" });
  });
});

import jsPDF from "jspdf";
import { renderPaperFormPage } from "@/workers/paperFormRenderer";
describe("filled hydrant sheet", () => {
  const fields = [
    { id: "valve_condition", label: "Main Valve Condition", type: "select", options: ["Satisfactory", "Stiff"], section: "Inspection Checks", required: false },
    { id: "pit_dry", label: "Pit Dry", type: "checkbox", section: "Hydrant Pit Details", required: false },
  ] as any;
  const run = (answers: any) => { const doc = new jsPDF(); renderPaperFormPage(doc, { template: { name: "Fire Hydrant — Annual Inspection", fields }, jobInfo: { filled: { answers } } as any, logo: null, accreditationLogos: [], handfill: false }); return doc.output() as string; };
  it("leaves out Main Valve Condition when the sheet had no answer", () => {
    const t = run({ pit_dry: "yes" });
    expect(t).not.toContain("Main Valve Condition");
    expect(t).toContain("Pit Dry");
  });
  it("never prints it on a hydrant sheet, even if answered", () => expect(run({ valve_condition: "Stiff" })).not.toContain("Main Valve Condition"));
});

describe("blank hydrant paperwork", () => {
  it.each(["Fire Hydrant — Annual Inspection", "Fire Hydrant — 6 Month Visual", "Fire Hydrant — 5 Year Major Overhaul"])("never borrows cabinet keys for %s", (name) => {
    const doc = new jsPDF();
    renderPaperFormPage(doc, { template: { name, fields: [{ id: "pit_dry", label: "Pit Dry", type: "checkbox", section: "Hydrant Pit Details" }] as any }, jobInfo: null, logo: null, accreditationLogos: [], handfill: true });
    const pdf = doc.output();
    expect(pdf).not.toMatch(/cabinet keys/i);
    expect(pdf).toContain("HYDRANT NO. / LOCATION:");
    expect(pdf).toContain("Pit Dry");
  });
});

describe("hydrant sheet prints only its own paper fields", () => {
  const fields = [
    { id: "site_name", label: "Site Name / Location", type: "text", section: "Site Details" },
    { id: "reference", label: "Hydrant No.", type: "text", section: "Site Details" },
    { id: "engineer", label: "Inspector Name", type: "text", section: "Site Details" },
    { id: "pit_dry", label: "Pit Dry", type: "checkbox", section: "Hydrant Pit Details" },
    { id: "remedial_required", label: "Remedial Action Required", type: "checkbox", section: "Result" },
    { id: "overall_result", label: "Overall Inspection Result", type: "pass_fail", section: "Result" },
  ] as any;
  const run = (name: string) => { const doc = new jsPDF(); renderPaperFormPage(doc, { template: { name, fields }, jobInfo: { filled: { answers: { site_name: "X", reference: "1", engineer: "C W", pit_dry: "yes", remedial_required: "yes", overall_result: "pass" }, issues: "GRID NEEDS PAINTING" } } as any, logo: null, accreditationLogos: [], handfill: false }); return doc.output() as string; };
  const t = run("Fire Hydrant — Annual Inspection");
  it("no cabinet keys box", () => expect(t).not.toContain("CABINET KEYS"));
  it("no duplicated header rows", () => { expect(t).not.toContain("Site Name / Location"); expect(t).not.toContain("Hydrant No."); expect(t).not.toContain("Inspector Name"); });
  it("no remedial / overall rows", () => { expect(t).not.toContain("Remedial Action Required"); expect(t).not.toContain("Overall Inspection Result"); });
  it("only Issues Found box", () => { expect(t).toContain("ISSUES FOUND"); expect(t).not.toContain("RECOMMENDATION"); expect(t).not.toContain("PRIORITY:"); });
  it("YES/NO prints only the ticked answer", () => { expect(t).toContain("Pit Dry"); expect(t).not.toContain("YES / NO"); });
  it("wet riser sheets get no dry-riser cabinet keys or 7.4.6 rows", () => {
    const doc = new jsPDF(); renderPaperFormPage(doc, { template: { name: "Wet Riser — Visual Inspection", fields: [{ id: "x", label: "Landing valves sound", type: "checkbox", section: "External Equipment" }] as any }, jobInfo: { filled: { answers: { x: "yes" } } } as any, logo: null, accreditationLogos: [], handfill: false });
    const w = doc.output() as string; expect(w).not.toContain("Cabinet keys"); expect(w).not.toContain("7.4.6");
  });
  it("dry riser sheets keep them", () => {
    const doc = new jsPDF(); renderPaperFormPage(doc, { template: { name: "Dry Riser — Visual Inspection", fields: [{ id: "x", label: "Inlet sound", type: "checkbox", section: "External Equipment" }] as any }, jobInfo: { filled: { answers: { x: "yes" } } } as any, logo: null, accreditationLogos: [], handfill: false });
    const d = doc.output() as string; expect(d).toContain("Cabinet keys"); expect(d).toContain("7.4.6");
  });
});
