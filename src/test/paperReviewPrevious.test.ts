import { expect, it } from "vitest";
import { isEarlierMatchingArchive, type PreviousReport } from "@/lib/reportComparison";
const report: PreviousReport = { responseId: "report", jobId: "", jobReference: null, date: "2025-07-12", answers: { riser_location: "Stairwell" } };
const opts = { siteId: "site", riserAssetId: "riser", riserLocation: "Stairwell", before: "2026-11-19" };
it("includes older converted reports with exact location before asset linking existed", () => {
  expect(isEarlierMatchingArchive({ status: "filed", site_id: "site", asset_id: null }, report, opts)).toBe(true);
});
it("rejects the other riser even when location wording matches", () => {
  expect(isEarlierMatchingArchive({ status: "filed", site_id: "site", asset_id: "other" }, report, opts)).toBe(false);
});
it("only selects earlier reports, never the review date itself", () => {
  expect(isEarlierMatchingArchive({ status: "filed", site_id: "site", asset_id: "riser" }, { ...report, date: "2026-11-19" }, opts)).toBe(false);
});