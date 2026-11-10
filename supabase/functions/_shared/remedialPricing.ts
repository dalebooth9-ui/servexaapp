export type PriceItem = { id: string; description: string; customer_id?: string | null; rate_list?: string | null; pricing_kind?: string; unit_price: number; price_needed?: boolean; unit?: string };
const normalise = (s: string) => s.toLowerCase().replace(/carbon dioxide/g, 'co2').replace(/litres?|liters?|ltr/g, 'l').replace(/padlocks?/g, 'padlock').replace(/straps?/g, 'strap').replace(/coverplates?/g, 'coverplate').replace(/\bnew\b|supply|fit|replace|required|needs|change|retest|extinguisher/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
export function customerCatalogue(items: PriceItem[], customerId: string | null) {
  const scoped = items.filter(p => p.pricing_kind !== 'servicing' && (!p.customer_id || p.customer_id === customerId) && !(p.rate_list && !p.customer_id));
  return scoped.filter(p => p.customer_id || !scoped.some(x => x.customer_id === customerId && x.customer_id && normalise(x.description) === normalise(p.description)));
}
export function priceSuggestions(text: string, items: PriceItem[]): PriceItem[] {
  const n = normalise(text);
  if (/inlet.*(box|housing).*(secur|shut|lock)|secur.*inlet.*(box|housing)/i.test(text)) return items.filter(p => ['Bracket', 'Padlocks & straps'].includes(p.description)).slice(0, 2);
  const words = new Set(n.split(' ').filter(Boolean));
  const scored = items.map(p => {
    const label = normalise(p.description); const tokens = label.split(' ').filter(Boolean);
    // Never confuse inlet/outlet, capacities, materials, removals or additional work.
    const exclusive = ['inlet','outlet','hydrant','foam','water','powder','co2','removal','additional','6','9','2kg','5kg'];
    if (exclusive.some(w => tokens.includes(w) && !words.has(w))) return { p, score: 0 };
    const matches = tokens.filter(w => words.has(w)).length;
    return { p, score: label === n ? 2 : tokens.length ? matches / tokens.length : 0 };
  }).filter(x => x.score >= 0.65).sort((a,b) => b.score-a.score);
  if (!scored[0]) return [];
  return scored.filter(x => x.score >= scored[0].score - 0.15).slice(0, 2).map(x => x.p);
}
export function attendanceFee(subtotal: number, locality: 'local'|'distant'|'unknown', customer: string, settings={threshold:95,local_fee:40,distant_fee:60}) {
  if (['Safely Comply','Integrity Security Group Ltd'].includes(customer)) return 40;
  return subtotal < settings.threshold ? locality === 'local' ? settings.local_fee : locality === 'distant' ? settings.distant_fee : null : 0;
}