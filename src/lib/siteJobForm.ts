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
export type NewRiserDraft = { key: string; location: string; outlets: string; inlets: string; floors: string; cabinetKeys: string };
export const blankNewRiser = (): NewRiserDraft => ({ key: crypto.randomUUID(), location: '', outlets: '', inlets: '1', floors: '', cabinetKeys: '' });

/** Outlet code scheme preview: inlet keeps the plain riser code; outlets are CODE-1..CODE-n. */
export function outletCodePreview(code: string, outlets: number) {
  return { inlet: code, outlets: Array.from({ length: Math.max(0, outlets) }, (_, i) => `${code}-${i + 1}`) };
}

/** Validates new-riser rows; blank outlets means "unknown, set on site". */
export function newRiserPayload(rows: NewRiserDraft[]) {
  const errors: Record<string, string> = {};
  const payload = rows.map(r => {
    const outlets = r.outlets.trim() === '' ? null : Number(r.outlets);
    const inlets = r.inlets.trim() === '' ? 1 : Number(r.inlets);
    if (!r.location.trim()) errors[r.key] = 'Enter a riser name or location.';
    else if (outlets !== null && (!Number.isInteger(outlets) || outlets < 0 || outlets > 200)) errors[r.key] = 'Outlets must be a whole number from 0 to 200, or left blank.';
    else if (!Number.isInteger(inlets) || inlets < 1 || inlets > 20) errors[r.key] = 'Inlets must be a whole number from 1 to 20.';
    return { location: r.location.trim(), outlets, inlets, floors: r.floors.trim() || null, cabinet_keys: r.cabinetKeys.trim() || null };
  });
  return { payload, errors };
}
