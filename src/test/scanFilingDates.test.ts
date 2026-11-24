import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcCalls: any[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  for (const k of ["select", "eq", "order", "limit", "update", "insert", "neq"]) chain[k] = () => chain;
  chain.single = async () => ({ data: { id: "resp" }, error: null });
  chain.maybeSingle = chain.single;
  return {
    supabase: {
      rpc: vi.fn(async (name: string, args: any) => { rpcCalls.push({ name, args }); return { data: [{ job_id: "job", reference_number: "VFP-1" }], error: null }; }),
      from: () => chain,
      storage: { from: () => ({ copy: async () => ({ error: null }), upload: async () => ({ error: null }) }) },
    },
  };
});

import { confirmScanQueueAsJob } from "@/lib/confirmScanQueueAsJob";

const file = (completionDate: string) => confirmScanQueueAsJob({
  userId: "u", itemId: "i", batchId: "b", templateId: "t", category: null, customerId: "c", siteId: "s",
  overrideJobName: null, existingJobId: null, completionDate, dateKnown: true, responses: {}, header: {},
  imagePaths: [], customerSignatureBlob: null, engineerSignatureBlob: null,
} as any);

describe("filing a scanned sheet sends ISO dates only", () => {
  beforeEach(() => { rpcCalls.length = 0; });
  it.each([
    ["19/11/2026", "2026-11-19"],
    ["19/4/26", "2026-04-19"],
    ["05/11/2026", "2026-11-05"], // 5 Nov, never 11 May
  ])("%s saves as %s", async (typed, iso) => {
    await file(typed).catch(() => undefined);
    const call = rpcCalls.find((c) => c.name === "confirm_paper_scan_job");
    expect(call.args._completed_at).toBe(`${iso}T12:00:00.000Z`);
    expect(call.args._responses._paper_completion_at).toBe(`${iso}T12:00:00.000Z`);
  });
});
