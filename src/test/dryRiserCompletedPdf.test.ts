import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { generateJobSheetPdf, warnIfUnexpectedPdfPageSpill } from "@/components/JobSheetPdfExport";
import jsPDF from "jspdf";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
        ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }),
    },
    functions: {
      invoke: async () => ({ data: null, error: null }),
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  },
}));

vi.mock("@/lib/documentBrandingProfile", () => ({
  resolveDocumentBrandingProfile: async () => ({
    logoUrl: "",
    logoImage: null,
    accentColor: [31, 78, 121],
    isCustomerBranded: false,
  }),
}));

vi.mock("@/lib/pdfWatermark", () => ({
  WATERMARK_OPACITY: 0.12,
  loadWatermarkImage: async () => null,
  addWatermarkToAllPages: vi.fn(),
}));

vi.mock("@/lib/pdfAccreditations", () => ({
  fetchCustomerAccreditationLogos: async () => [],
  loadAccreditationLogos: async () => [],
  addAccreditationLogosToAllPages: vi.fn(),
}));

vi.mock("@/lib/pdfBranding", () => ({
  renderBrandingOverlay: vi.fn(async () => ({ mode: "none", opacity: 0, accreditationOpacity: 0 })),
}));

class StubImage {
  naturalWidth = 80;
  naturalHeight = 40;
  src = "";
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

const dryRiserPressureTemplate = {
  id: "seed-dry-riser-pressure",
  name: "Dry Riser — Pressure Test",
  description: null,
  footer_text: "This pressure test was carried out to the requirements of BS 9990:2015.",
  branding: {},
  fields: [
    { id: "scope_of_work", type: "select", label: "Scope of Work:", options: ["Pressure Test", "Visual"], required: true },
    { id: "customer_details", type: "text", label: "Customer Details:", required: true },
    { id: "site_details", type: "text", label: "Site Details:", required: true },
    { id: "date", type: "date", label: "Date:", required: true },
    { id: "po_number", type: "text", label: "PO Number:", required: true },
    { id: "riser_location", type: "text", label: "Riser Location:", required: true },
    { id: "cabinet_keys", type: "text", label: "Cabinet Keys :", section: "External Equipment", required: true },
    { id: "breeching_inlet_good_condition", type: "checkbox", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet in good condition?", section: "External Equipment", required: true, allow_notes: true },
    { id: "breeching_inlet_blank_plug_chain", type: "checkbox", label: "BS9990:2015 7.4.3.1 Does the breeching inlet have a blank plug & chain?", section: "External Equipment", required: true, allow_notes: true },
    { id: "breeching_inlet_glass_good_condition", type: "checkbox", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet glass in good condition?", section: "External Equipment", required: true, allow_notes: true },
    { id: "relevant_signs_in_place", type: "checkbox", label: "BS9990:2015 8.1 Are all relevant signs in place?", section: "External Equipment", required: true, allow_notes: true },
    { id: "breeching_inlet_cabinet_good_condition", type: "checkbox", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet cabinet in good condition?", section: "External Equipment", required: true, allow_notes: true },
    { id: "landing_valve_good_condition", type: "checkbox", label: "BS9990:2015 7.4.3.1 Is the landing valve in good condition?", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "number_of_outlets", type: "number", label: "Number of outlets :", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "valve_type", type: "text", label: "Valve type:", section: "Internal Equipment", required: false, allow_notes: true },
    { id: "landing_valve_blank_cap_chain", type: "checkbox", label: "BS9990:2015 7.4.3.1 Does the landing valve have a blank cap & chain?", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "custom_field_1771871167826", type: "checkbox", label: "BS9990:2015 7.4.3.1 Are the instantaneous washers in good condition?", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "landing_valve_padlock_strap", type: "checkbox", label: "BS9990:2015 4.1.5 Does the landing valve have a padlock & strap?", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "custom_field_1771517561119", type: "checkbox", label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "air_release_valve_installed_vertical_point", type: "checkbox", label: "BS9990:2015 4.1.3.34 Is an air release valve installed at the most vertical point of the riser stack?", section: "Air Release Valve", required: true, allow_notes: true },
    { id: "air_release_valve_installed_top_main_good_condition", type: "checkbox", label: "BS9990:2015 4.1.3.4 Is the air release valve in good condition?", section: "Air Release Valve", required: true, allow_notes: true },
    { id: "pressure_test_result_pass", type: "pass_fail", label: "Pressure test result:", section: "Pressure Test Results", required: true, allow_notes: true },
    { id: "test_pressure_bar", type: "number", label: "Test Pressure (bar):", section: "Pressure Test Results", required: true, allow_notes: true },
    { id: "hold_time_minutes", type: "number", label: "Hold Time (minutes):", section: "Pressure Test Results", required: true, allow_notes: true },
    { id: "leaks_detected", type: "checkbox", label: "Leaks Detected?", section: "Pressure Test Results", required: true, allow_notes: true },
    { id: "customer_name", type: "text", label: "Customer Name:", required: true },
    { id: "comments", type: "textarea", label: "Comments:", required: true },
    { id: "materials_required", type: "textarea", label: "Materials required:", required: true },
    { id: "technician_name", type: "select", label: "Engineers Name:", options: ["Dale Booth", "Martin Whatmough", "C. Whittaker"], required: true },
    { id: "external_equipment_pass", type: "pass_fail", label: "External equipment: ", section: "External Equipment", required: true, allow_notes: true },
    { id: "internal_equipment_pass", type: "pass_fail", label: "Internal equipment: ", section: "Internal Equipment", required: true, allow_notes: true },
    { id: "site_left_clean_tidy", type: "checkbox", label: "Site left clean & tidy?", section: "Completion", required: true, allow_notes: true },
    { id: "custom_field_1771517560408", type: "checkbox", label: "Has the drop leg been drained?", section: "Completion", required: true, allow_notes: true },
  ],
};

// Mirrors the live seed archived document used during the paper-scan audit:
// ARCH-1AB5192C / Dry Riser — Pressure Test / DMT FACILITIES LTD.
const seedArchivedResponses = {
  date: "08/07/2022",
  po_number: "CPO00063",
  customer_details: "DMT FACILITIES LTD",
  site_details: "ACTON 2, 117 GUNNERSBURY LANE, LONDON, W3 8HQ",
  riser_location: "STAIRWELL",
  cabinet_keys: "EXPOSED",
  breeching_inlet_good_condition: "yes",
  breeching_inlet_blank_plug_chain: "yes",
  breeching_inlet_glass_good_condition: "yes",
  relevant_signs_in_place: "yes",
  breeching_inlet_cabinet_good_condition: "yes",
  landing_valve_good_condition: "yes",
  number_of_outlets: "5",
  landing_valve_blank_cap_chain: "yes",
  custom_field_1771871167826: "yes",
  landing_valve_padlock_strap: "yes",
  custom_field_1771517561119: "yes",
  air_release_valve_installed_vertical_point: "NOT VISIBLE",
  air_release_valve_installed_top_main_good_condition: "yes",
  pressure_test_result_pass: "pass",
  test_pressure_bar: "12",
  hold_time_minutes: "15",
  leaks_detected: "no",
  comments: "No defects noted.",
  materials_required: "None.",
  technician_name: "C. Whittaker",
  external_equipment_pass: "pass",
  internal_equipment_pass: "pass",
  site_left_clean_tidy: "yes",
  custom_field_1771517560408: "yes",
  _number_of_outlets: "5",
  _customer_signed_name: "",
};

describe("Dry Riser completed archive PDF", () => {
  beforeEach(() => {
    (globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates the seed archived Pressure Test as exactly one PDF page", async () => {
    const { base64 } = await generateJobSheetPdf(
      dryRiserPressureTemplate as any,
      seedArchivedResponses,
      {
        address: "ACTON 2, 117 GUNNERSBURY LANE, LONDON, W3 8HQ",
        customer: "DMT FACILITIES LTD",
        customers: { name: "DMT FACILITIES LTD", logo_url: null, brand_colour: null } as any,
        reference_number: "ARCH-1AB5192C",
        customer_po: "CPO00063",
        site: { name: "ACTON 2", address: "117 GUNNERSBURY LANE, LONDON, W3 8HQ" },
      },
      "archive-1ab5192c-b86a-4269-9018-f4ace2c6bb1a",
      undefined,
      "2022-07-08",
      undefined,
      {
        engineerSig: { id: "seed-engineer", signer_name: "C. Whittaker", signer_role: "engineer" },
        sigImages: {},
      },
    );

    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const proofPath = process.env.DRY_RISER_PROOF_PDF_PATH;
    if (proofPath) {
      mkdirSync(dirname(proofPath), { recursive: true });
      writeFileSync(proofPath, bytes);
    }
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(1);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("SINGLE-PAGE REGRESSION"));
  });

  it("fires the page-spill safeguard warning when a PDF has more than one page", () => {
    const doc = new jsPDF();
    doc.addPage();

    const pageCount = warnIfUnexpectedPdfPageSpill(doc, "Dry Riser — Pressure Test", "forced-two-page.pdf", {
      test: true,
    });

    expect(pageCount).toBe(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("SINGLE-PAGE REGRESSION: 2 pages"));
  });
});