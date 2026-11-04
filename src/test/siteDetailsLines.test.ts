import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import { siteDetailLines, siteDetailsText } from '@/lib/siteDetailsPrint';
import templates from './fixtures/riserSheetTemplates.json';

const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Capture every string the renderer draws, in draw order. */
function printedLines(jobInfo: any) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const out: string[] = [];
  const orig = doc.text.bind(doc);
  (doc as any).text = (t: any, x?: any, y?: any, o?: any) => {
    (Array.isArray(t) ? t : [t]).forEach((s: any) => out.push(String(s)));
    return orig(t, x, y, o);
  };
  renderPaperFormPage(doc, { template: templates[0] as any, jobInfo, logo: null, accreditationLogos: [], handfill: true });
  const i = out.indexOf('Customer/Site Details:');
  // The details block ends where the right-hand DATE/PO row starts.
  return out.slice(i + 1, i + 1 + out.slice(i + 1).findIndex((l) => l === 'DATE:'));
}

const site = (name: string, address: string | null, postcode: string | null) => ({
  customer: 'Acme Facilities Ltd',
  reference_number: 'VFP-00001',
  customer_po: 'PO-1',
  site: { name, address, postcode, contact_name: null, contact_phone: null, contact_email: null, riser_location: 'North stair' },
  riserVisit: { asset_tag: 'ABC234', riser_name: 'North stair', job_reference: 'VFP-00001' },
});

describe('printed Customer/Site Details order and repeats', () => {
  it('prints customer, then site name, then site address on separate lines', () => {
    expect(siteDetailLines({ customer: 'Acme Facilities Ltd', siteName: 'TFC Test Tower', address: '1 Test Street, Leeds', postcode: 'LS1 1AA' })).toEqual([
      'Acme Facilities Ltd',
      'TFC Test Tower',
      '1 Test Street, Leeds, LS1 1AA',
    ]);
  });

  it('skips the address line when the address only repeats the site name', () => {
    expect(siteDetailLines({ customer: 'Acme Facilities Ltd', siteName: 'John Lewis Reading', address: 'JOHN LEWIS READING', postcode: null })).toEqual([
      'Acme Facilities Ltd',
      'John Lewis Reading',
    ]);
    expect(siteDetailLines({ customer: 'Acme', siteName: '201 Deansgate, Manchester, M3 3WB', address: '201 DEANSGATE, MANCHESTER, M3 3WB', postcode: 'M3 3WB' })).toEqual([
      'Acme',
      '201 Deansgate, Manchester, M3 3WB',
    ]);
  });

  it('drops the site name from inside the address but keeps the rest', () => {
    expect(
      siteDetailLines({ customer: 'Acme', siteName: 'Marsh Mills Retail Park', address: 'MARSH MILLS RETAIL PARK, PHASE 1 LONGBRIDGE, PLYMOUTH, PL6 8LX', postcode: 'PL6 8LX' }),
    ).toEqual(['Acme', 'Marsh Mills Retail Park', 'PHASE 1 LONGBRIDGE, PLYMOUTH, PL6 8LX']);
    expect(
      siteDetailLines({ customer: 'Acme', siteName: 'Manston Court', address: '74-77 MANSTON COURT 2 THORNBURY WAY, WALTHAM FOREST LONDON E17 5FT', postcode: 'E17 5FT' })[2],
    ).toBe('74-77 2 THORNBURY WAY, WALTHAM FOREST LONDON E17 5FT');
  });

  it('skips the site name line when it repeats the customer', () => {
    expect(siteDetailLines({ customer: 'Acme Facilities Ltd', siteName: 'Acme Facilities', address: '1 High St', postcode: 'AB1 2CD' })).toEqual([
      'Acme Facilities Ltd',
      '1 High St, AB1 2CD',
    ]);
  });

  it('prints the postcode exactly once', () => {
    expect(siteDetailLines({ customer: 'Acme', siteName: 'X House', address: 'X House, High St, Leeds LS1 1AA', postcode: 'LS1 1AA' })).toEqual(['Acme', 'X House', 'High St, Leeds LS1 1AA']);
    expect(siteDetailLines({ customer: 'Acme', siteName: 'X House', address: 'High St, Leeds', postcode: 'LS1 1AA' })).toEqual(['Acme', 'X House', 'High St, Leeds, LS1 1AA']);
    expect(siteDetailsText({ siteName: 'X House', address: 'High St, Leeds LS1 1AA', postcode: 'LS1 1AA' })).toBe('X House, High St, Leeds LS1 1AA');
  });

  it('keeps numbered street fragments that are not repeats', () => {
    expect(siteDetailLines({ customer: 'Acme', siteName: 'Delmerend House', address: 'FLAT 1-10, DELMEREND HOUSE, SW3 3SB', postcode: 'SW3 3SB' })).toEqual([
      'Acme',
      'Delmerend House',
      'FLAT 1-10, SW3 3SB',
    ]);
  });
});

describe('paper riser sheet Customer/Site Details block', () => {
  it('shows customer, site name and address in order with no repeats', () => {
    const lines = printedLines(site('Marsh Mills Retail Park', 'MARSH MILLS RETAIL PARK, PHASE 1 LONGBRIDGE, PLYMOUTH, PL6 8LX', 'PL6 8LX'));
    expect(lines).toEqual(['Acme Facilities Ltd', 'Marsh Mills Retail Park', 'Phase 1 Longbridge, Plymouth, PL6 8LX']);
  });

  it('leaves out the address line when it repeats the site name', () => {
    const lines = printedLines(site('John Lewis Reading', 'JOHN LEWIS READING', null));
    expect(lines).toEqual(['Acme Facilities Ltd', 'John Lewis Reading']);
  });

  it('never prints the postcode twice or repeats the site name in the address', () => {
    for (const [name, address, postcode] of [
      ['Marsh Mills Retail Park', 'MARSH MILLS RETAIL PARK, PHASE 1 LONGBRIDGE, PLYMOUTH, PL6 8LX', 'PL6 8LX'],
      ['Manston Court', '74-77 MANSTON COURT 2 THORNBURY WAY, WALTHAM FOREST LONDON E17 5FT', 'E17 5FT'],
      ['Home Park', 'HOME PARK, MILL LINK ROAD, KINGS LANGLEY, WD4 8FW', 'WD4 8FW'],
      ['TFC Test Tower', '1 Test Street, Leeds', 'LS1 1AA'],
    ] as const) {
      const lines = printedLines(site(name, address, postcode));
      const joined = norm(lines.join(' '));
      expect(joined.includes(norm(postcode)), `${name}: ${lines.join(' | ')}`).toBe(true);
      expect(joined.split(norm(postcode)).length - 1, `postcode twice for ${name}`).toBe(1);
      expect(norm(lines[lines.length - 1]).includes(norm(name)), `address repeats site name for ${name}`).toBe(false);
    }
  });
});
