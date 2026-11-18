import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { archiveInspectionType, archiveResultSummary } from "@/lib/archiveScanConfirm";
import { findArchivePrevious } from "@/lib/reportComparison";

const fake = (rows: any[]) => ({ from: () => { const q: any = { select: () => q, eq: () => q, limit: async () => ({ data: rows, error: null }) }; return q; } });
const doc = (id: string, asset_id: string | null, date: string, loc = "Stair 1") => ({ id, site_id: "s1", asset_id, template_id: "t1", document_date: date, extracted: { riser_location: loc }, header_data: {}, file_paths: [] });

describe("filed archive reports and risers", () => {
  it("labels visit type like in-app reports", () => {
    expect(archiveInspectionType("Dry Riser Pressure Test")).toBe("pressure_test");
    expect(archiveInspectionType("Dry Riser Visual Inspection")).toBe("visual");
  });
  it("reads the result from the same answers", () => {
    expect(archiveResultSummary({ overall_result: "Pass" })).toBe("Pass");
  });
  it("comparison uses the report filed against this riser", async () => {
    const r = await findArchivePrevious(fake([doc("a", "r1", "2021-03-14"), doc("b", "r2", "2022-05-01")]), { siteId: "s1", site: {}, templateId: "t1", riserAssetId: "r1", riserLocation: "Stair 1" });
    expect(r.confident?.responseId).toBe("a");
  });
  it("a report filed against another riser is never used, even with the same location text", async () => {
    const r = await findArchivePrevious(fake([doc("b", "r2", "2022-05-01")]), { siteId: "s1", site: {}, templateId: "t1", riserAssetId: "r1", riserLocation: "Stair 1" });
    expect(r.confident).toBeNull();
  });
});
