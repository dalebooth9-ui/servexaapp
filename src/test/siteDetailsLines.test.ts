import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import templates from './fixtures/riserSheetTemplates.json';

/** Capture every string the renderer draws, in draw order. */
function printedLines(jobInfo: any) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const out: string[] = [];
  const orig = doc.text.bind(doc);
  (doc as any).text = (t: any, x?: any, y?: any, o?: any) => {
    (Array.isArray(t) ? t : [t]).forEach((s: any) => out.push(String(s)));
    return orig(t, x, y, o);
  };
  renderPaperFormPage(doc, {
    template: templates[0] as any,
    jobInfo,
    logo: null,
    accreditationLogos: [],
    handfill: true,
  });
  return out;
}

const sites = [
  { name: 'MARSH MILLS RETAIL PARK', address: 'MARSH MILLS RETAIL PARK, PHASE 1 LONGBRIDGE, PLYMOUTH, PL6 8LX', postcode: 'PL6 8LX' },
  { name: '201 DEANSGATE, MANCHESTER, M3 3WB', address: '201 DEANSGATE, MANCHESTER, M3 3WB', postcode: 'M3 3WB' },
  { name: 'JOHN LEWIS READING', address: 'JOHN LEWIS READING', postcode: null },
  { name: 'MANSTON COURT', address: '1, 2, 11-14, 35-38, 59-64, 74-77 MANSTON COURT 2 THORNBURY WAY, WALTHAM FOREST LONDON E17 5FT', postcode: 'E17 5FT' },
  { name: 'HOME PARK', address: 'HOME PARK, MILL LINK ROAD, KINGS LANGLEY, WD4 8FW', postcode: 'WD4 8FW' },
  { name: 'MAYFIELD PARK HAZEL COURT', address: 'MAYFIELD PARK, HAZEL COURT, CARSHALTON, SM5 4BF', postcode: 'SM5 4BF' },
  { name: 'Grand Central Shopping Centre, Birmingham', address: 'Grand Central Shopping Centre, Birmingham', postcode: null },
  { name: 'TFC Test Tower', address: '1 Test Street, Leeds', postcode: 'LS1 1AA' },
];

describe('diagnostic: printed Customer/Site Details lines', () => {
  for (const s of sites) {
    it(`shows ${s.name}`, () => {
      const lines = printedLines({
        customer: 'Acme Facilities Ltd',
        reference_number: 'VFP-00001',
        customer_po: 'PO-1',
        site: { name: s.name, address: s.address, postcode: s.postcode, contact_name: null, contact_phone: null, contact_email: null, riser_location: 'North stair' },
        riserVisit: { asset_tag: 'ABC234', riser_name: 'North stair', job_reference: 'VFP-00001' },
      });
      const i = lines.indexOf('Customer/Site Details:');
      console.log(JSON.stringify({ site: s.name, printed: lines.slice(i + 1, i + 6) }));
      expect(true).toBe(true);
    });
  }
});
