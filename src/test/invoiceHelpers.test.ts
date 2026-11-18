import { describe, it, expect } from "vitest";
import { jobPoValue, defaultInvoiceDueDate, DEFAULT_INVOICE_VAT } from "@/lib/invoiceHelpers";

describe("invoice defaults", () => {
  it("uses the job's PO value as the price", () => { expect(jobPoValue({ po_value: 245.5 })).toBe(245.5); });
  it("leaves the price blank when the job has no PO value", () => { expect(jobPoValue({ po_value: null })).toBeNull(); expect(jobPoValue({})).toBeNull(); });
  it("defaults VAT to 20%", () => { expect(DEFAULT_INVOICE_VAT).toBe(20); });
  it("defaults the due date to 30 days", () => { expect(defaultInvoiceDueDate(new Date(2026, 10, 18))).toBe("2026-12-18"); });
});
