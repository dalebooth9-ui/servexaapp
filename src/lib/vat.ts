/**
 * VAT maths for quotes and invoices. Mirrors the database trigger
 * invoice_recalc_totals so the screen, PDF and email always agree:
 * VAT is worked out per rate group on the ex-VAT amount, rounded to 2dp.
 */
export type VatLine = { quantity: number | string; unit_price: number | string; vat_rate?: number | string | null; vat_exempt?: boolean | null };

export function lineVatRate(line: VatLine, defaultRate: number): number {
  if (line.vat_exempt) return 0;
  const r = line.vat_rate;
  if (r === null || r === undefined || r === "") return Number(defaultRate) || 0;
  return Number(r) || 0;
}

export function lineVatLabel(line: VatLine, defaultRate: number): string {
  if (line.vat_exempt) return "Exempt";
  const r = lineVatRate(line, defaultRate);
  return r === 0 ? "0% (zero-rated)" : `${r}%`;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeVatTotals(lines: VatLine[], defaultRate: number) {
  const groups = new Map<string, { rate: number; label: string; net: number }>();
  let subtotal = 0;
  for (const l of lines) {
    const net = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
    subtotal += net;
    const rate = lineVatRate(l, defaultRate);
    const key = l.vat_exempt ? "exempt" : String(rate);
    const g = groups.get(key) || { rate, label: l.vat_exempt ? "Exempt" : `${rate}%`, net: 0 };
    g.net += net; groups.set(key, g);
  }
  const breakdown = [...groups.values()].map((g) => ({ ...g, net: r2(g.net), vat: r2(g.net * g.rate / 100) }));
  const vat = r2(breakdown.reduce((s, g) => s + g.vat, 0));
  subtotal = r2(subtotal);
  return { subtotal, vat, total: r2(subtotal + vat), breakdown, mixedRates: groups.size > 1 };
}

export const gbp = (n: number | string) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
