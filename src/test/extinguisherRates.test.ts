import { describe, it, expect } from "vitest";
import { isExtinguisherRate, groupRates } from "@/lib/extinguisherRates";
const r = (description: string, pricing_kind: string, rate_list: string | null, customer_id: string | null = null) => ({ id: description + rate_list, description, unit: "each", unit_price: 1, rate_list, customer_id, pricing_kind, price_needed: false });
describe("extinguisher rates page", () => {
  it("includes servicing and removal prices, excludes other remedials", () => {
    expect(isExtinguisherRate(r("Foam extinguisher removal", "remedial", "Integrity", "i"))).toBe(true);
    expect(isExtinguisherRate(r("Extinguisher service", "servicing", "Integrity", "i"))).toBe(true);
    expect(isExtinguisherRate(r("6 ltr foam extinguisher", "remedial", "Integrity", "i"))).toBe(false);
  });
  it("marks Wayne's list as unassigned and splits removal from servicing", () => {
    const g = groupRates([r("Extinguisher service", "servicing", "Wayne's rates"), r("Extinguisher removal", "remedial", "Integrity", "i"), r("Extinguisher service", "servicing", "Integrity", "i")]);
    expect(g.find(x => x.name === "Wayne's rates")!.unassigned).toBe(true);
    const i = g.find(x => x.name === "Integrity")!; expect([i.servicing.length, i.removal.length]).toEqual([1, 1]);
  });
});
