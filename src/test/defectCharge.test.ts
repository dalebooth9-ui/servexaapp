import { describe, it, expect } from "vitest";
import { quotableDefects, noChargeCostThisMonth, groupNoChargeCost, noChargeOutstanding } from "@/lib/defectCharge";

const d = (id: string, o: any = {}) => ({ id, chargeable: true, quote_id: null, status: "open", created_at: "2026-11-10T10:00:00Z", ...o });

describe("no-charge defects", () => {
  it("leaves no-charge defects out of Quote all unquoted", () => {
    const list = [d("bracket", { chargeable: false }), d("plug")];
    expect(quotableDefects(list).map(x => x.id)).toEqual(["plug"]);
  });
  it("keeps chargeable quoting unchanged (quoted and resolved still excluded)", () => {
    const list = [d("a"), d("b", { quote_id: "q" }), d("c", { status: "resolved" }), d("e", { status: "in_progress" })];
    expect(quotableDefects(list).map(x => x.id)).toEqual(["a", "e"]);
  });
  it("counts outstanding no-charge defects until resolved", () => {
    expect(noChargeOutstanding([d("x", { chargeable: false }), d("y", { chargeable: false, status: "resolved" })]).length).toBe(1);
  });
  it("totals materials + labour cost for this month only", () => {
    const det = { x: { defect_id: "x", reason: null, materials_cost: 12.5, labour_hours: 1, labour_cost: 40 },
                  y: { defect_id: "y", reason: null, materials_cost: 100, labour_hours: 0, labour_cost: 0 } };
    const r = noChargeCostThisMonth([d("x", { chargeable: false }), d("y", { chargeable: false, created_at: "2026-10-01T00:00:00Z" }), d("z")], det, new Date("2026-11-17T12:00:00Z"));
    expect(r).toEqual({ count: 1, total: 52.5 });
  });
  it("groups cost per key", () => {
    const det = { x: { defect_id: "x", reason: null, materials_cost: 10, labour_hours: 0, labour_cost: 5, engineer_id: "e1" } };
    expect(groupNoChargeCost([d("x", { chargeable: false }), d("y")], det, (_, t) => t?.engineer_id)).toEqual([{ key: "e1", count: 1, total: 15 }]);
  });
});

import { carriedReportFields } from "@/lib/defectCarryForward";
describe("customer-facing wording", () => {
  it("prints only 'Rectified at no charge' for no-charge carried remedials", () => {
    const { answers } = carriedReportFields([{ id: "b", title: "Bracket", asset_id: null, riser: "Stair 1", works_required: null, materials_required: null, visit_date: null, carry_outcome: null, carry_comment: null, chargeable: false }]);
    expect(answers.carried_b).toContain("Rectified at no charge");
    expect(answers.carried_b).not.toMatch(/engineer error|our install|£/i);
  });
});
