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
export type DueVisitTypeChoice = { id: string; type: 'visual' | 'pressure' | null };

export function siteRiserInitialIds(rows: { id: string }[]) {
  return rows.map(row => row.id);
}

/** Initial ticks only: office users can still adjust the list before saving. */
export function dueVisitRiserSelection(rows: DueRiserChoice[], today: string, onlyId?: string) {
  const isOverdue = (row: DueRiserChoice) => Boolean(row.due && row.due < today);
  if (onlyId) {
    const chosen = rows.find(row => row.id === onlyId);
    return {
      selectedIds: chosen ? [chosen.id] : [],
      note: chosen
        ? '1 riser ticked because you chose Create visit for this riser. Other risers stay unticked.'
        : 'The chosen riser is not available at this site.',
    };
  }
  const eligible = rows.filter(row => isOverdue(row) && !row.booked);
  const selectedIds = eligible.map(row => row.id);
  const notDue = rows.filter(row => !row.booked && !isOverdue(row)).length;
  const booked = rows.filter(row => row.booked).length;
  const reasons = [
    notDue ? `${notDue} ${notDue === 1 ? 'other is' : 'others are'} not due` : '',
    booked ? `${booked} ${booked === 1 ? 'is' : 'are'} already booked on another open job` : '',
  ].filter(Boolean).join('; ');
  return {
    selectedIds,
    note: `${selectedIds.length} overdue ${selectedIds.length === 1 ? 'riser' : 'risers'} ticked.${reasons ? ` ${reasons}.` : ' All visible risers at this site are included.'}`,
  };
}

export function dueVisitJobType(rows: DueVisitTypeChoice[], selectedIds: string[], onlyId?: string): SiteJobType {
  const relevant = onlyId ? rows.filter(row => row.id === onlyId) : rows.filter(row => selectedIds.includes(row.id));
  const types = [...new Set(relevant.map(row => row.type).filter((type): type is 'visual' | 'pressure' => Boolean(type)))];
  return types.length === 1 ? types[0] : DEFAULT_SITE_JOB_TYPE;
}