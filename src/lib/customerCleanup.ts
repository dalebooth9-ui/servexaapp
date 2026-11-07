export type CleanupCustomer = { id: string; name: string; created_at: string; counts: Record<string, number> };
export type CleanupRow = { key: string; name: string; customer?: CleanupCustomer; status: string; targetId?: string; groupIds?: string[] };
export const normaliseCustomerName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
export const protectedCustomer = (name: string) => normaliseCustomerName(name) === 'c watkins plumbing ltd';
export function removePreview(names: string[], customers: CleanupCustomer[]): CleanupRow[] {
  return [...new Set(names.map(normaliseCustomerName))].flatMap((name) => {
    const matches = customers.filter(c => normaliseCustomerName(c.name) === name);
    return matches.length ? matches.map(c => ({ key: c.id, name: c.name, customer: c, status: protectedCustomer(c.name) ? 'Protected — will be skipped' : Object.values(c.counts).some(n => n > 0) ? 'Has data, will be skipped' : 'Safe to remove' })) : [{ key: `missing:${name}`, name, status: 'Not found' }];
  });
}
export function groupWinner(customers: CleanupCustomer[]) {
  return [...customers].sort((a,b) => (b.counts.customer_sites || 0) - (a.counts.customer_sites || 0) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
}
export function mergePreview(entries: { name: string; into: string }[], customers: CleanupCustomer[]): CleanupRow[] {
  const groups = new Map<string, CleanupCustomer[]>();
  for (const e of entries) if (/^group\s*:/i.test(e.into)) {
    const key = normaliseCustomerName(e.into.replace(/^group\s*:/i,''));
    groups.set(key, [...new Map([...(groups.get(key) || []), ...customers.filter(c => normaliseCustomerName(c.name) === normaliseCustomerName(e.name))].map(c => [c.id,c])).values()]);
  }
  const rows: CleanupRow[] = [];
  for (const e of entries) {
    const matches = customers.filter(c => normaliseCustomerName(c.name) === normaliseCustomerName(e.name));
    if (!matches.length) { rows.push({ key: `missing:${e.name}`, name: e.name, status: 'Not found' }); continue; }
    const grouped = /^group\s*:/i.test(e.into);
    const members = grouped ? groups.get(normaliseCustomerName(e.into.replace(/^group\s*:/i,''))) || [] : customers.filter(c => normaliseCustomerName(c.name) === normaliseCustomerName(e.into));
    const winner = grouped ? groupWinner(members) : members.length === 1 ? members[0] : undefined;
    for (const c of matches) rows.push({ key: c.id, name: c.name, customer: c, targetId: winner?.id, groupIds: grouped ? members.map(m => m.id) : undefined, status: protectedCustomer(c.name) ? 'Protected — will be skipped' : winner?.id === c.id ? 'Keep' : winner ? 'Ready to merge' : 'Choose existing winner' });
  }
  return [...new Map(rows.map(r => [r.key,r])).values()];
}
const labels: Record<string,string> = { customer_sites:'sites', jobs:'jobs', unlinked_jobs:'unlinked jobs', invoices_and_quotes:'invoices / quotes', contact_details:'contacts', customer_cleanup_archive:'saved merged contacts' };
export const describeCounts = (counts: Record<string,number> = {}) => Object.entries(counts).filter(([,n]) => n>0).map(([key,n]) => `${n} ${labels[key] || key.replace(/_/g,' ')}`).join(', ') || 'No attached data';