import { describe, expect, it } from "vitest";
import { paperReportFilename, uniquePaperFilename } from "@/lib/paperReportDownload";

describe("paper report file names", () => {
  it("uses the sheet date and the requested identity order", () => {
    expect(paperReportFilename("Customer", "Site", "2019-02-06T12:00:00Z", "Visual Inspection")).toBe("Customer - Site - 06-02-2019 - Visual Inspection.pdf");
  });
  it("accepts the reviewed UK date", () => {
    expect(paperReportFilename("Customer", "Site", "25/12/2022", "Pressure Test")).toBe("Customer - Site - 25-12-2022 - Pressure Test.pdf");
  });
  it("preserves two reports whose requested names collide in a ZIP", () => {
    const used = new Set<string>();
    expect(uniquePaperFilename("Report.pdf", used)).toBe("Report.pdf");
    expect(uniquePaperFilename("Report.pdf", used)).toBe("Report (2).pdf");
  });
});