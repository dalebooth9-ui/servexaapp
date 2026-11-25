import { describe, it, expect } from "vitest";
import { computeVatTotals, lineVatLabel } from "@/lib/vat";
import { normaliseQiSettings, quoteValidityText } from "@/lib/quoteInvoiceSettings";

describe("quote/invoice VAT", () => {
  it("£145.00 ex VAT at 20% = £29.00 VAT = £174.00 total", () => {
    const t = computeVatTotals([{ quantity: 1, unit_price: 145 }], 20);
    expect([t.subtotal, t.vat, t.total]).toEqual([145, 29, 174]);
  });
  it("line rate overrides the default, zero-rated and exempt lines add no VAT", () => {
    const t = computeVatTotals([
      { quantity: 1, unit_price: 100 },
      { quantity: 2, unit_price: 50, vat_rate: 0 },
      { quantity: 1, unit_price: 40, vat_exempt: true },
      { quantity: 1, unit_price: 10, vat_rate: 5 },
    ], 20);
    expect(t.subtotal).toBe(250); expect(t.vat).toBe(20.5); expect(t.total).toBe(270.5); expect(t.mixedRates).toBe(true);
    expect(lineVatLabel({ quantity: 1, unit_price: 1, vat_exempt: true }, 20)).toBe("Exempt");
  });
  it("defaults: 20% VAT and quotes valid for 30 days", () => {
    const s = normaliseQiSettings(undefined);
    expect(s.default_vat_rate).toBe(20); expect(s.quote_valid_days).toBe(30);
    expect(quoteValidityText(30)).toBe("Valid for 30 days from the date of issue.");
  });
});
