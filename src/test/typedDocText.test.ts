import { describe, it, expect } from "vitest";
import { looksTyped, docxXmlToText } from "@/lib/typedDocText";
describe("typed old reports", () => {
  it("typed PDFs have a real text layer; scans do not", () => {
    expect(looksTyped("x".repeat(400), 2)).toBe(true);
    expect(looksTyped("Page 1", 1)).toBe(false);
  });
  it("reads Word paragraphs and table cells", () => {
    const xml = '<w:p><w:r><w:t>Riser Location:</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:t>Outlets</w:t></w:p></w:tc><w:tc><w:p><w:t>6</w:t></w:p></w:tc></w:tr></w:tbl>';
    const t = docxXmlToText(xml);
    expect(t).toContain("Riser Location:");
    expect(t).toMatch(/Outlets\s*\n?\s*\|\s*6/);
  });
});
