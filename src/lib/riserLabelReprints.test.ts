import { describe, it, expect } from 'vitest';
import { existingRiserLabels, labelSelection } from './riserLabelReprints';
const riser = { id: 'r1', asset_tag: '48W4EU', outlets_count: 8, riser_location: 'Stairwell', site_id: 's1' };
describe('existing QR label reprinting', () => {
  it('reuses inlet and eight outlet codes without inventing replacements', () => {
    const outlets = Array.from({ length: 8 }, (_, i) => ({ asset_id: 'r1', outlet_number: i + 1, outlet_tag: `SAVED${i}` }));
    const labels = existingRiserLabels([riser], outlets);
    expect(labels.map(l => l.tag)).toEqual(['48W4EU', ...outlets.map(o => o.outlet_tag)]);
    expect(labels).toHaveLength(9);
  });
  it('never creates missing codes or uses another riser outlet', () => {
    expect(existingRiserLabels([riser], [{ asset_id: 'other', outlet_number: 1, outlet_tag: 'OTHER' }]).map(l => l.tag)).toEqual(['48W4EU']);
  });
  it('selects all by default, inlet only or all outlets', () => {
    const labels = existingRiserLabels([riser], [{ asset_id: 'r1', outlet_number: 1, outlet_tag: 'OUTLET' }]);
    expect([...labelSelection(labels, 'all')]).toEqual(['48W4EU', 'OUTLET']);
    expect([...labelSelection(labels, 'inlet')]).toEqual(['48W4EU']);
    expect([...labelSelection(labels, 'outlets')]).toEqual(['OUTLET']);
  });
  it('shows only fitted outlets when the count falls from ten to eight, retaining saved identities for later', () => {
    const outlets = Array.from({ length: 10 }, (_, i) => ({ asset_id: 'r1', outlet_number: i + 1, outlet_tag: `SAVED${i}`, is_fitted: i < 8 }));
    expect(existingRiserLabels([riser], outlets).map(l => l.tag)).toEqual(['48W4EU', ...outlets.slice(0, 8).map(o => o.outlet_tag)]);
    expect(existingRiserLabels([{ ...riser, outlets_count: 10 }], outlets.map(o => ({ ...o, is_fitted: true })))).toHaveLength(11);
  });
});