import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_JOB_TYPE, SITE_JOB_TYPES, siteJobQuantities, duplicateCustomerNames } from '@/lib/siteJobForm';
describe('site job creation rules', () => {
  it('defaults to visual, never installation', () => {expect(DEFAULT_SITE_JOB_TYPE).toBe('visual');});
  it('offers exactly visual, pressure or other', () => {expect(SITE_JOB_TYPES.map(t=>t.value)).toEqual(['visual','pressure','other']);});
  it('counts seven selected assets for visual only', () => {expect(siteJobQuantities('visual',['1','2','3','4','5','6','7'])).toEqual({visual_qty:7,pressure_test_qty:0});});
  it('pressure counts only ticked risers and never visual', () => {expect(siteJobQuantities('pressure',['a','b'])).toEqual({visual_qty:0,pressure_test_qty:2});});
  it('other never adds visual or pressure quantities', () => {expect(siteJobQuantities('other',['a'])).toEqual({visual_qty:0,pressure_test_qty:0});});
  it('warns on same names despite spacing, punctuation or Limited', () => {expect(duplicateCustomerNames('a',[{id:'a',name:'Viva Fire Ltd'},{id:'b',name:' Viva Fire Limited '},{id:'c',name:'Other Fire Ltd'}]).map(c=>c.id)).toEqual(['b']);});
});