import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import templates from './fixtures/riserSheetTemplates.json';

const longText = 'Very long riser location name at the rear stairwell beside the plant room '.repeat(3);
const access = { lines: ['Key: FB11, held at Reception', 'Notes: ' + 'long access note about permits and induction '.repeat(40)], cabinetKeys: 'FB11' };
const job = (long: boolean) => ({
  customer: 'Craven House Management Ltd', reference_number: 'VFP-00001', customer_po: 'PO-1',
  engineerAccess: long ? access : null,
  site: { name: 'Craven House', address: 'Craven House, 1 High Street, Leeds, LS1 1AA', postcode: 'LS1 1AA', contact_name: null, contact_phone: null, contact_email: null, riser_location: long ? longText : 'North stair' },
  riserVisit: { asset_tag: 'ABC234', riser_name: long ? longText : 'North stair', outlets_count: null, job_reference: 'VFP-00001', remedial_notes: long ? longText : null },
});

describe('riser inspection sheets print on one A4 page', () => {
  for (const t of templates as any[]) for (const long of [false, true]) {
    it(`${t.name}${long ? ' with long names/access notes' : ''}`, () => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      renderPaperFormPage(doc, { template: t, jobInfo: job(long) as any, logo: null, accreditationLogos: [], handfill: true });
      expect(doc.getNumberOfPages()).toBe(1);
    });
  }
  it('a very long template still fits on one page', () => {
    const t = templates[0] as any;
    const fields = Array.from({ length: 4 }, () => t.fields).flat();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    renderPaperFormPage(doc, { template: { name: t.name, fields }, jobInfo: job(true) as any, logo: null, accreditationLogos: [], handfill: true });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
