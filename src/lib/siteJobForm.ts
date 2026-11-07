export type SiteJobType = 'visual' | 'pressure' | 'other';
export const DEFAULT_SITE_JOB_TYPE: SiteJobType = 'visual';
export const SITE_JOB_TYPES = [
  { value: 'visual', label: 'Dry riser – Visual inspection (6-month)' },
  { value: 'pressure', label: 'Dry riser – Pressure test (12-month)' },
  { value: 'other', label: 'Other' },
] as const;
export function siteJobQuantities(type: SiteJobType, selectedIds: string[]) {
  const count = new Set(selectedIds).size;
  return { visual_qty: type === 'visual' ? count : 0, pressure_test_qty: type === 'pressure' ? count : 0 };
}
export function duplicateCustomerNames(customerId: string, customers: {id:string;name:string}[]) {
  const normalise = (name: string) => name.toLowerCase().replace(/\blimited\b/g, 'ltd').replace(/[^a-z0-9]/g, '');
  const current = customers.find(c => c.id === customerId);
  return current ? customers.filter(c => c.id !== customerId && normalise(c.name) === normalise(current.name)) : [];
}