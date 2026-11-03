import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { fetchAllRows } from "@/lib/fetchAllRows";

function fakeClient(total: number) {
  const ranges: Array<[number, number]> = [];
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (a: number, b: number) => {
            ranges.push([a, b]);
            const n = Math.max(0, Math.min(b, total - 1) - a + 1);
            return { data: Array.from({ length: n }, (_, i) => ({ id: a + i })), error: null };
          },
        }),
      }),
    }),
  };
  return { client, ranges };
}

describe("fetchAllRows", () => {
  it("keeps fetching 1000-row pages until a short page (1800 sites)", async () => {
    const { client, ranges } = fakeClient(1800);
    const rows = await fetchAllRows("sites", "id", "id", client);
    expect(rows).toHaveLength(1800);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it("fetches one extra empty page when total is an exact multiple of 1000", async () => {
    const { client, ranges } = fakeClient(2000);
    const rows = await fetchAllRows("sites", "id", "id", client);
    expect(rows).toHaveLength(2000);
    expect(ranges).toHaveLength(3);
  });
});
