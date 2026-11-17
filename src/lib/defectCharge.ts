/** Rules for "No charge (our work)" defects. Office-only cost data never leaves staff screens. */

export const NO_CHARGE_CUSTOMER_LABEL = "Rectified at no charge";
export const NO_CHARGE_REASONS = ["Our install", "Engineer error", "Warranty", "Goodwill"];

export type ChargeableDefect = { id: string; chargeable?: boolean | null; quote_id: string | null; status: string };
export type NoChargeDetails = {
  defect_id: string; reason: string | null; materials_cost: number | string | null;
  labour_hours: number | string | null; labour_cost: number | string | null;
  engineer_id?: string | null; notes?: string | null; updated_at?: string | null;
};

export const isNoCharge = (d: { chargeable?: boolean | null }) => d.chargeable === false;

/** Defects that "Quote all unquoted" / batch quoting may include. Chargeable behaviour unchanged. */
export function quotableDefects<T extends ChargeableDefect>(list: T[]): T[] {
  return list.filter(d => !isNoCharge(d) && !d.quote_id && ["open", "in_progress"].includes(d.status));
}

/** Outstanding no-charge defects still waiting to be fixed. */
export function noChargeOutstanding<T extends ChargeableDefect>(list: T[]): T[] {
  return list.filter(d => isNoCharge(d) && !["resolved", "declined"].includes(d.status));
}

export function costOf(det?: Pick<NoChargeDetails, "materials_cost" | "labour_cost"> | null): number {
  if (!det) return 0;
  return (Number(det.materials_cost) || 0) + (Number(det.labour_cost) || 0);
}

/** Total internal cost of no-charge defects fixed (or raised, if not yet fixed) in the month of `now`. */
export function noChargeCostThisMonth(
  defects: { id: string; chargeable?: boolean | null; created_at: string; resolved_at?: string | null }[],
  details: Record<string, NoChargeDetails>,
  now = new Date(),
): { count: number; total: number } {
  let count = 0, total = 0;
  for (const d of defects) {
    if (!isNoCharge(d)) continue;
    const when = new Date(d.resolved_at || d.created_at);
    if (when.getFullYear() !== now.getFullYear() || when.getMonth() !== now.getMonth()) continue;
    count++; total += costOf(details[d.id]);
  }
  return { count, total: Math.round(total * 100) / 100 };
}

/** Sum internal cost of no-charge defects grouped by a key (job, customer, engineer). */
export function groupNoChargeCost<T extends { id: string; chargeable?: boolean | null }>(
  defects: T[], details: Record<string, NoChargeDetails>, keyOf: (d: T, det?: NoChargeDetails) => string | null | undefined,
): { key: string; count: number; total: number }[] {
  const m = new Map<string, { count: number; total: number }>();
  for (const d of defects) {
    if (!isNoCharge(d)) continue;
    const k = keyOf(d, details[d.id]) || "Not set";
    const cur = m.get(k) || { count: 0, total: 0 };
    cur.count++; cur.total += costOf(details[d.id]);
    m.set(k, cur);
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
}

export const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Bulk changes above this many defects need a confirmation first. */
export const BULK_CONFIRM_THRESHOLD = 5;
export const needsBulkConfirm = (n: number) => n > BULK_CONFIRM_THRESHOLD;

/** Split ticked defects for "Quote selected": only chargeable, unquoted, open ones go on a quote. */
export function splitForQuote<T extends ChargeableDefect>(list: T[]) {
  const quotable = quotableDefects(list);
  const noCharge = list.filter(isNoCharge);
  const other = list.filter(d => !isNoCharge(d) && !quotable.includes(d));
  return { quotable, noCharge, other };
}

/** Defects whose charge setting would actually change; quoted ones can't become No charge. */
export function bulkChargeTargets<T extends ChargeableDefect>(list: T[], chargeable: boolean) {
  const change = list.filter(d => (chargeable ? isNoCharge(d) : !isNoCharge(d) && !d.quote_id));
  const blocked = chargeable ? [] : list.filter(d => !isNoCharge(d) && !!d.quote_id);
  return { change, blocked };
}
