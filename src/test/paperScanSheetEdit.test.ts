import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { previousSheet, orderInBatch } from "@/lib/paperScanSheetEdit";
const a = { id: "a", batch_id: "b", status: "ready", image_paths: ["x/page-001.jpg"] };
const c = { id: "c", batch_id: "b", status: "ready", image_paths: ["x/page-002.jpg"] };
describe("sheet order in a scan", () => {
  it("orders sheets by page", () => expect(orderInBatch([c, a]).map((x) => x.id)).toEqual(["a", "c"]));
  it("page 2's previous sheet is page 1", () => expect(previousSheet(c, [c, a])?.id).toBe("a"));
  it("first page has no previous sheet", () => expect(previousSheet(a, [c, a])).toBeNull());
  it("cannot merge into an already filed sheet", () => expect(previousSheet(c, [c, { ...a, status: "confirmed" }])).toBeNull());
});
