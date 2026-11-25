import { describe, it, expect } from "vitest";
import { cleanUnmapped, unmappedNotesText } from "@/lib/paperSheetItems";
import { applyRecordIdentity, withPreviousVersion, paperScanPaths } from "@/lib/paperReportEdit";
import { parseSheetDate } from "@/lib/paperReportDate";

describe("converted paper report edit/redo", () => {
  it("reads the sheet date 17/11/26 as 17 Nov 2026", () => expect(parseSheetDate("17/11/26")).toBe("2026-11-17"));
  it("sheet questions with no template row are printed, not dropped", () => {
    const text = unmappedNotesText([{ label: "Have all inspection and test records been filled in? (BS9990:2015 7.4.6)", value: "yes" }]);
    expect(text).toContain("BS9990:2015 7.4.6");
    expect(text).toContain(": yes");
  });
  it("blank labels and duplicates are removed", () => {
    expect(cleanUnmapped([{ label: "" }, { label: "A", value: "x" }, { label: "a", value: "X" }])).toEqual([{ label: "A", value: "x" }]);
  });
  it("customer wording follows the chosen customer record", () => {
    const out = applyRecordIdentity({ customer_name: "WATKINS" }, [{ id: "customer_name", label: "Customer Name:" }], { customerName: "Watkin's" });
    expect(out.customer_name).toBe("Watkin's");
  });
  it("fills missing site identity from confirmed records without replacing the sheet's own wording", () => {
    const fields = [{ id: "site_name", label: "Site Name / Location" }];
    const ids = { siteName: "Midlands House", siteAddress: "Nelson Street, Derby DE1 2SA" };
    expect(applyRecordIdentity({}, fields, ids).site_name).toBe("Midlands House, Nelson Street, Derby DE1 2SA");
    expect(applyRecordIdentity({ site_name: "REAR OF BUILDING" }, fields, ids).site_name).toBe("REAR OF BUILDING");
  });
  it("redo/edit always keeps the previous answers", () => {
    const v = withPreviousVersion({ a: 1, _previous_versions: [{ reason: "x" }] }, { at: "t", byUserId: "u", reason: "redo conversion", templateId: "t1" });
    expect(v).toHaveLength(2);
    expect(v[1].responses).toEqual({ a: 1 });
  });
  it("finds original scan pages from either saved location", () => {
    expect(paperScanPaths({ _paper_pdf_input: { sourcePaths: ["p1"] } })).toEqual(["p1"]);
  });
});
