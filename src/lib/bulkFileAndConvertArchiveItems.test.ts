import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), enqueue: vi.fn(), log: vi.fn() }));
vi.mock("./archiveScanConfirm", () => ({ archiveScanConfirm: mocks.confirm }));
vi.mock("./archiveConversionQueue", () => ({ archiveConversionQueue: { enqueue: mocks.enqueue } }));
vi.mock("./errorLogger", () => ({ logError: mocks.log }));
import { bulkFileAndConvertArchiveItems } from "./bulkFileAndConvertArchiveItems";
beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue({ archivedId: "archive-1" }); });
it("ignores guessed site and riser and keeps the scan needing review", async () => {
  await bulkFileAndConvertArchiveItems({ userId: "user", orgId: "org", items: [{ id: "scan", batch_id: "batch", detected_template_id: null, extracted: { riser_asset_id: "guessed-riser" }, header_data: {}, guess_customer_id: "customer", guess_site_id: "guessed-site", guess_date: "2021-03-14", image_paths: [] }] });
  expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ siteId: null, assetId: null, status: "unmatched", needsReview: true }));
  expect(mocks.enqueue).toHaveBeenCalledWith(["archive-1"]);
});