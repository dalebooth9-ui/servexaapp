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

export type DueRiserChoice = { id: string; due: string | null; booked: boolean };

export function siteRiserInitialIds(rows: { id: string }[]) {
  return rows.map(row => row.id);
}

/** Initial ticks only: office users can still adjust the list before saving. */
export function dueVisitRiserSelection(rows: DueRiserChoice[], today: string, onlyId?: string) {
  const isOverdue = (row: DueRiserChoice) => Boolean(row.due && row.due < today);
  const eligible = rows.filter(row => isOverdue(row) && !row.booked);
  const selectedIds = eligible.filter(row => !onlyId || row.id === onlyId).map(row => row.id);
  if (onlyId) {
    const chosen = rows.find(row => row.id === onlyId);
    const note = selectedIds.length
      ? '1 overdue riser ticked because you chose Create visit for this riser.'
      : chosen?.booked
        ? 'This riser is already booked on another open job, so it is not ticked.'
        : 'This riser is not overdue, so it is not ticked.';
    return { selectedIds, note };
  }
  const notDue = rows.filter(row => !row.booked && !isOverdue(row)).length;
  const booked = rows.filter(row => row.booked).length;
  const reasons = [
    `${notDue} ${notDue === 1 ? 'other is' : 'others are'} not due`,
    booked ? `${booked} ${booked === 1 ? 'is' : 'are'} already booked on another open job` : '',
  ].filter(Boolean).join('; ');
  return {
    selectedIds,
    note: `${selectedIds.length} overdue ${selectedIds.length === 1 ? 'riser' : 'risers'} ticked. ${reasons}.`,
  };
}