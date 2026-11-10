export type RateItem = { id: string; description: string; unit: string; unit_price: number; rate_list: string | null; customer_id: string | null; pricing_kind: string; price_needed: boolean; is_active?: boolean; org_id?: string };
export const isExtinguisherRate = (p: RateItem) => p.is_active !== false && (p.pricing_kind === "servicing" || /extinguisher removal/i.test(p.description));
export function groupRates(items: RateItem[]) {
  const map = new Map<string, { name: string; unassigned: boolean; servicing: RateItem[]; removal: RateItem[] }>();
  for (const it of items) {
    const name = it.rate_list || "General";
    const g = map.get(name) || { name, unassigned: !!it.rate_list && !it.customer_id, servicing: [], removal: [] };
    (it.pricing_kind === "servicing" ? g.servicing : g.removal).push(it);
    map.set(name, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
