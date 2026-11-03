import { addDays, addMonths, format, isValid, parseISO, startOfDay } from 'date-fns';
export type VisitType = 'visual' | 'pressure';
export const VISIT_LABELS: Record<VisitType, string> = { visual: 'Visual inspection (6-monthly)', pressure: 'Annual pressure test (12 bar)' };
export interface Inspection { inspection_date?: string | null; inspection_type?: string | null; template_name?: string | null }
export function inspectionType(value?: string | null): VisitType | null {
  const n = (value || '').toLowerCase();
  if (/remedial|repair|commission|install/.test(n)) return null;
  if (/pressure|annual.*test/.test(n)) return 'pressure';
  if (/visual/.test(n)) return 'visual';
  return null;
}
function date(value?: string | null) { if (!value) return null; const d = parseISO(value); return isValid(d) ? startOfDay(d) : null; }
export function visitCycle(asset: any, history: Inspection[] = []) {
  const rows = [...history, { inspection_date: asset.last_inspection_at, inspection_type: asset.last_inspection_type, template_name: null }]
    .map(h => ({ date: date(h.inspection_date), type: inspectionType(h.inspection_type || h.template_name) }))
    .filter((h): h is { date: Date; type: VisitType } => Boolean(h.date && h.type)).sort((a,b) => b.date.getTime()-a.date.getTime());
  const last = rows[0]; const pressure = rows.find(h => h.type === 'pressure');
  if (!last) return { due: null, type: null, last: null, key: 'unknown', pressure: null };
  const next = addMonths(last.date, 6); const pressureDue = pressure ? addMonths(pressure.date, 12) : null;
  const type: VisitType = last.type === 'visual' || (pressureDue && pressureDue <= next) ? 'pressure' : 'visual';
  const due = pressureDue && pressureDue < next ? pressureDue : next;
  return { due: format(due, 'yyyy-MM-dd'), type, last: format(last.date,'yyyy-MM-dd'), key: `${format(last.date,'yyyy-MM-dd')}:${last.type}`, pressure: pressure ? format(pressure.date,'yyyy-MM-dd') : null };
}
export function suggestVisitType(asset: any, history: Inspection[], today = new Date()): VisitType | null {
  const cycle = visitCycle(asset, history); const p = date(cycle.pressure);
  if (p && today < addMonths(p,6)) return 'visual';
  if (p && today > addMonths(p,11)) return 'pressure';
  return cycle.type;
}
export function reminderVisible(asset: any, site: any, cycle: ReturnType<typeof visitCycle>, today = new Date()) {
  if (asset.no_longer_serviced || site?.no_longer_serviced) return false;
  const state = asset.due_visit_state || {};
  if (state.cycle !== cycle.key) return true;
  if (state.status === 'lost') return false;
  if (state.status === 'snoozed' && state.until && state.until > format(today,'yyyy-MM-dd')) return false;
  return true;
}
export function snoozeUntil(days: 30 | 60 | 90, today = new Date()) { return format(addDays(today,days),'yyyy-MM-dd'); }
export function withinLeadTime(due: string | null, weeks = 6, today = new Date()) { return Boolean(due && due <= format(addDays(today,weeks*7),'yyyy-MM-dd')); }
export function visitPrefill(fields: any[], context: any) {
  const answers: Record<string, any> = { riser_asset_id: context.asset_id, riser_location: context.riser_location, _riser_visit: context, _system_label: context.riser_location };
  for (const f of fields) {
    if (f.id === 'riser_location') answers[f.id] = context.riser_location;
    else if (/outlet/i.test(f.label) && f.type === 'number' && context.outlets_count != null) answers[f.id] = String(context.outlets_count);
    else if (f.id === 'customer_details') answers[f.id] = context.customer;
    else if (f.id === 'site_details') answers[f.id] = [context.site_name,context.address].filter(Boolean).join('\n');
    else if (f.id === 'date') answers[f.id] = context.planned_date;
    else if (f.id === 'po_number') answers[f.id] = context.job_reference;
  }
  return answers;
}
