import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_JOB_TYPE, SITE_JOB_TYPES, siteJobQuantities, duplicateCustomerNames, dueVisitRiserSelection } from '@/lib/siteJobForm';
describe('site job creation rules', () => {
  it('defaults to visual, never installation', () => {expect(DEFAULT_SITE_JOB_TYPE).toBe('visual');});
  it('offers exactly visual, pressure or other', () => {expect(SITE_JOB_TYPES.map(t=>t.value)).toEqual(['visual','pressure','other']);});
  it('counts seven selected assets for visual only', () => {expect(siteJobQuantities('visual',['1','2','3','4','5','6','7'])).toEqual({visual_qty:7,pressure_test_qty:0});});
  it('pressure counts only ticked risers and never visual', () => {expect(siteJobQuantities('pressure',['a','b'])).toEqual({visual_qty:0,pressure_test_qty:2});});
  it('other never adds visual or pressure quantities', () => {expect(siteJobQuantities('other',['a'])).toEqual({visual_qty:0,pressure_test_qty:0});});
  it('warns on same names despite spacing, punctuation or Limited', () => {expect(duplicateCustomerNames('a',[{id:'a',name:'Viva Fire Ltd'},{id:'b',name:' Viva Fire Limited '},{id:'c',name:'Other Fire Ltd'}]).map(c=>c.id)).toEqual(['b']);});
  it('site creation has no Due Visits filter and can tick every site riser', () => {
    const rows = [{id:'a',due:null,booked:false},{id:'b',due:'2027-01-01',booked:true}];
    expect(rows.map(row => row.id)).toEqual(['a','b']);
  });
  it('single-riser Due Visits creation ticks only that overdue unbooked riser', () => {
    const rows = [{id:'a',due:'2026-11-01',booked:false},{id:'b',due:'2026-11-01',booked:false}];
    expect(dueVisitRiserSelection(rows,'2026-11-08','a').selectedIds).toEqual(['a']);
  });
  it('site Due Visits creation ticks three overdue risers and excludes four not-due risers', () => {
    const rows = [
      ...['a','b','c'].map(id => ({id,due:'2026-11-01',booked:false})),
      ...['d','e','f','g'].map(id => ({id,due:'2026-12-01',booked:false})),
    ];
    const result = dueVisitRiserSelection(rows,'2026-11-08');
    expect(result.selectedIds).toEqual(['a','b','c']);
    expect(result.note).toBe('3 overdue risers ticked. 4 others are not due.');
  });
  it('Due Visits never pre-ticks booked, future, today or unknown-date risers', () => {
    const rows = [
      {id:'booked',due:'2026-11-01',booked:true},
      {id:'future',due:'2026-12-01',booked:false},
      {id:'today',due:'2026-11-08',booked:false},
      {id:'unknown',due:null,booked:false},
      {id:'overdue',due:'2026-11-07',booked:false},
    ];
    expect(dueVisitRiserSelection(rows,'2026-11-08').selectedIds).toEqual(['overdue']);
  });
  it('a booked or not-due single riser starts unticked with the reason', () => {
    expect(dueVisitRiserSelection([{id:'a',due:'2026-11-01',booked:true}],'2026-11-08','a')).toEqual({selectedIds:[],note:'This riser is already booked on another open job, so it is not ticked.'});
    expect(dueVisitRiserSelection([{id:'b',due:'2026-12-01',booked:false}],'2026-11-08','b')).toEqual({selectedIds:[],note:'This riser is not overdue, so it is not ticked.'});
  });
});