import { describe, it, expect } from 'vitest';
import { newRiserPayload, outletCodePreview, type NewRiserDraft } from '@/lib/siteJobForm';
const row = (p: Partial<NewRiserDraft>): NewRiserDraft => ({ key: 'k', location: 'Riser 1 – Stair 4', outlets: '', inlets: '1', floors: '', cabinetKeys: '', ...p });
describe('new risers on a job', () => {
  it('outlets are code-1..code-n and inlet keeps the plain code', () => {
    expect(outletCodePreview('U59UXB', 3)).toEqual({ inlet: 'U59UXB', outlets: ['U59UXB-1', 'U59UXB-2', 'U59UXB-3'] });
  });
  it('blank outlet count is allowed and saved as unknown', () => {
    const r = newRiserPayload([row({})]);
    expect(r.errors).toEqual({});
    expect(r.payload[0].outlets).toBeNull();
  });
  it('inlets default to 1', () => {
    expect(newRiserPayload([row({ inlets: '' })]).payload[0].inlets).toBe(1);
  });
  it('requires a name or location', () => {
    expect(newRiserPayload([row({ location: ' ' })]).errors.k).toBeTruthy();
  });
  it('rejects negative outlets', () => {
    expect(newRiserPayload([row({ outlets: '-1' })]).errors.k).toBeTruthy();
  });
});
