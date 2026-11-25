import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { buildSprinklerSheetModel, isSprinklerSheet, sprinklerStandard, rowFor, tableFor, revisitRows } from "@/lib/printedSheetModel";
import { usesPrintedSheetLayout, printedSheetHandlesTables } from "@/lib/printedSheetLayout";
import { sprinklerReportSheet } from "@/lib/sprinklerReportSheet";
import { renderPrintedSheetPages } from "@/workers/printedSheetPages";
import { sprinklerReportFilename } from "@/lib/sprinklers";

const job = (extra: any = {}) => ({ customer: "Acme Housing", customer_po: "PO-778", poOnly: true, due_date: "2026-11-19", site: { name: "Riverside Court", address: "1 River Rd, Derby", postcode: "DE1 1AA", contact_name: null, contact_phone: null, contact_email: null, riser_location: "Basement plant room" }, ...extra });
const flats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, label: `Flat ${i + 1}`, head_count: 4 }));
const results = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`u${i + 1}`, { result: i % 9 === 3 ? "no_access" : i % 11 === 5 ? "remedial" : "ok", heads: i === 7 ? 5 : 4, note: i % 11 === 5 ? "Head painted over in kitchen" : "" }]));

function render(name: string, fields: any[], answers: any, extra: any = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const model = buildSprinklerSheetModel({ name, fields, answers, defects: extra.defects, issues: extra.issues });
  renderPrintedSheetPages(doc, { model, jobInfo: { ...job(), filled: { answers, techName: "C. Whittaker", techDate: "19/11/2026" } } as any, logo: null, accreditationLogos: [] });
  return { doc, model, text: (doc.output() as string) };
}

describe("sprinkler printed sheet", () => {
  it("sprinkler templates now use the printed sheet, retired ones don't", () => {
    expect(usesPrintedSheetLayout("Commercial Sprinkler — Annual Service (BS EN 12845)")).toBe(true);
    expect(usesPrintedSheetLayout("Residential & Domestic Sprinkler — Annual Service")).toBe(true);
    expect(isSprinklerSheet("Sprinkler System — Annual Service — RETIRED duplicate")).toBe(false);
    expect(printedSheetHandlesTables("Sprinkler — Annual Service")).toBe(true);
    expect(printedSheetHandlesTables("Dry Riser Pressure Test")).toBe(false);
  });
  it("closing statement standard: BS EN 12845 commercial, BS 9251 residential", () => {
    expect(sprinklerStandard("Commercial Sprinkler — Annual Service (BS EN 12845)")).toBe("BS EN 12845");
    expect(sprinklerStandard("Residential & Domestic Sprinkler — Annual Service")).toBe("BS 9251:2021");
  });
  it("keeps Fair on three-way ratings and boxes it", () => {
    const r = rowFor({ id: "c", label: "Condition", type: "select", options: ["Good", "Fair", "Poor"], required: false, section: "x" }, { c: "Fair" });
    expect(r.picked).toBe("FAIR");
  });
  it("turns literal \\n into real line breaks", () => {
    const r = rowFor({ id: "n", label: "Notes", type: "textarea", required: false, section: "x" }, { n: "LID NEEDS PAINTING\\nGAUGE FAULTY" });
    expect(r.answer).toBe("LID NEEDS PAINTING\nGAUGE FAULTY");
  });
  it("tables keep every column except photos, and list no-access flats for revisit", () => {
    const t = tableFor({ id: "d", label: "Dwelling Access Log", type: "repeating_table", required: false, section: "x", columns: [{ id: "u", label: "Unit", type: "text" }, { id: "r", label: "Access Result", type: "dropdown" }, { id: "p", label: "Photos", type: "photo_gallery" }] } as any, { d: [{ u: "1", r: "Access Gained" }, { u: "2", r: "No Answer" }] });
    expect(t.columns).toEqual(["Unit", "Access Result"]);
    expect(revisitRows(t)).toEqual([["2", "No Answer"]]);
  });
  it("single house hides empty plant sections; a 'tank present: No' prints only that row", () => {
    const fields = [{ id: "property_type", label: "Property Type", type: "select", options: ["Single Dwelling (House/Flat)", "Block of Flats"], section: "System Details" }, { id: "pump_x", label: "Pump ok?", type: "checkbox", section: "Fire Pump" }, { id: "tank_present", label: "Tank present?", type: "checkbox", section: "Storage Tank" }, { id: "tank_loc", label: "Tank Location", type: "text", section: "Storage Tank" }] as any;
    const m = buildSprinklerSheetModel({ name: "Sprinkler — Annual Service", fields, answers: { property_type: "Single Dwelling (House/Flat)", tank_present: "NO" } });
    const labels = m.blocks.map((b: any) => b.label);
    expect(labels).not.toContain("FIRE PUMP");
    expect(labels).toContain("Tank present?");
    expect(labels).not.toContain("Tank Location");
  });
  it("last-visit remedials print first", () => {
    const m = buildSprinklerSheetModel({ name: "Sprinkler — Annual Service", fields: [{ id: "a", label: "A", type: "text", section: "General" }, { id: "carried_1", label: "Flat 3: head painted", type: "textarea", section: "REMEDIAL WORKS OUTSTANDING FROM PREVIOUS VISIT" }] as any, answers: {} });
    expect((m.blocks[0] as any).label).toMatch(/^REMEDIAL WORKS OUTSTANDING/);
  });
  it("a 45-flat block runs to several pages with every flat, headings repeated, page numbers and revisit list", () => {
    const s = sprinklerReportSheet({ report: { visit_type: "annual", answers: { engineer: "C. Whittaker", wsr_secure: "Y", zones: [{ name: "Zone 1 - Ground", no_damage: "Y", pressure: "4.2", sign: "Y" }] }, unit_results: results(45) }, system: { system_type: "block", register: { supply_room_location: "Basement" } }, units: flats(45) });
    const { doc, text } = render(s.name, s.fields, s.answers);
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(2);
    expect(text).toContain(`Page ${pages} of ${pages}`);
    for (const n of [1, 23, 45]) expect(text).toContain(`(Flat ${n})`);
    expect(text).toContain("REVISIT / NO ACCESS");
    expect(text).toContain("BS 9251:2021");
    expect((text.match(/\(Flat no\.\)/g) || []).length).toBeGreaterThan(1);
  });
  it("single-house register report omits tank, pump, zone and monitoring sections", () => {
    const s = sprinklerReportSheet({ report: { visit_type: "annual", answers: {} }, system: { system_type: "house", register: {} }, units: [] });
    const secs = s.fields.map((f) => f.section);
    expect(secs).not.toContain("Storage tank");
    expect(secs).not.toContain("Pump");
    expect(secs).not.toContain("Zone valves");
    expect(secs).toContain("General condition");
  });
  it("filename stays Customer - Site - dd-mm-yyyy - Residential Sprinkler Service.pdf", () => {
    expect(sprinklerReportFilename("Acme", "Riverside Court", "2026-11-19")).toBe("Acme - Riverside Court - 19-11-2026 - Residential Sprinkler Service.pdf");
  });
});
