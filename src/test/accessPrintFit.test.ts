import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { fitAccessLines, SEE_SITE_RECORD, ACCESS_MIN_PT } from '@/lib/siteAccessPdf';
import { accessPriorityLines } from '@/lib/siteAccessRules';

describe('access info on printed sheets', () => {
  it('orders lines: key type, key held, keysafe+code, contact, then notes', () => {
    const l = accessPriorityLines({ notes: 'N', contact_name: 'Bob', contact_phone: '0700', key_location: 'Keysafe A', access_codes: '1234', cabinet_key_held: 'Reception', cabinet_key_type: 'FB11' });
    expect(l).toEqual(['Key: FB11, held at Reception', 'Keysafe/key: Keysafe A · Code: 1234', 'Contact: Bob 0700', 'Notes: N']);
  });
  it('uses the riser key instead of site-wide key details', () => {
    expect(accessPriorityLines({ cabinet_key_type: 'FB11' }, true, 'Riser 2 key')[0]).toBe('Riser key: Riser 2 key');
  });
  it('never fails on very long notes: shrinks to 7pt, trims and ends with see site record', () => {
    const doc = new jsPDF();
    const fit = fitAccessLines(doc, ['Key type: FB11', 'Notes: ' + 'very long note '.repeat(200)], 60, 15);
    expect(fit.pt).toBe(ACCESS_MIN_PT);
    expect(fit.truncated).toBe(true);
    expect(fit.lines[0]).toBe('Key type: FB11');
    expect(fit.lines[fit.lines.length - 1]).toBe(SEE_SITE_RECORD);
    expect(fit.lines.length * fit.lineH).toBeLessThanOrEqual(15);
  });
  it('does not repeat entry method already covered by the key location', () => {
    const l = accessPriorityLines({ entry_methods: ['Reception'], key_location: 'Pick keys up at reception', cabinet_key_type: 'FB11' });
    expect(l).toEqual(['Key: FB11', 'Keysafe/key: Pick keys up at reception']);
  });
  it('keeps full size when short', () => {
    expect(fitAccessLines(new jsPDF(), ['Key type: FB11'], 60, 15).pt).toBe(9);
  });
});
