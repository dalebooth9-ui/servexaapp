import { describe, expect, it } from "vitest";

import { getYesNoFieldDisplayValue, isStandardReference, type PdfTemplateField } from "@/lib/pdfBody";

const buildField = (overrides: Partial<PdfTemplateField> = {}): PdfTemplateField => ({
  id: "field_id",
  label: "Field label",
  type: "yes_no",
  required: false,
  section: "General",
  ...overrides,
});

describe("getYesNoFieldDisplayValue", () => {
  it("preserves manual N/A edits for outlet cabinet fields", () => {
    const field = buildField({
      id: "outlet_cabinets_condition",
      label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?",
      section: "Outlet hardware",
    });

    expect(getYesNoFieldDisplayValue(field, "n/a")).toBe("N/A");
    expect(getYesNoFieldDisplayValue(field, "N/A")).toBe("N/A");
  });

  it("does not force empty outlet cabinet fields to YES", () => {
    const field = buildField({
      id: "outlet_cabinets_condition",
      label: "BS9990:2015 7.4.3.1 Outlet cabinets in good condition?",
      section: "Outlet hardware",
    });

    expect(getYesNoFieldDisplayValue(field, "")).toBe("—");
  });

  it("keeps drain fields defaulting to YES when blank", () => {
    const field = buildField({
      id: "drain_valve",
      label: "Drain valve fitted?",
    });

    expect(getYesNoFieldDisplayValue(field, "")).toBe("YES");
  });
});

describe("isStandardReference", () => {
  it.each([
    "BS 9990",
    "BS9990:2015 7.4.3.1 Outlet cabinets",
    "EN 3 extinguisher",
    "EN137 SCBA",
    "BS EN 671",
    "BSEN671 hose reel",
    "bs en 12845",
  ])("matches %s", (label) => {
    expect(isStandardReference(label)).toBe(true);
  });

  it.each([
    "Is the valve fitted?",
    "BSI document review",
    "Engineer name",
    "EN route",
    "",
  ])("does not match %s", (label) => {
    expect(isStandardReference(label)).toBe(false);
  });
});