import { describe, it, expect, vi } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import templates from './fixtures/riserSheetTemplates.json';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const longText = 'Very long riser location name at the rear stairwell beside the plant room '.repeat(3);
const access = { lines: ['Cabinet key: FB11, held at Reception', 'Notes: ' + 'long access note about permits and induction '.repeat(40)], cabinetKeys: 'FB11' };
const job = (long: boolean) => ({
  customer: 'Craven House Management Ltd', reference_number: 'VFP-00001', customer_po: 'PO-1',
  engineerAccess: long ? access : null,
  site: { name: 'Craven House', address: 'Craven House, 1 High Street, Leeds, LS1 1AA', postcode: 'LS1 1AA', contact_name: null, contact_phone: null, contact_email: null, riser_location: long ? longText : 'North stair' },
  riserVisit: { asset_tag: 'ABC234', riser_name: long ? longText : 'North stair', outlets_count: null, job_reference: 'VFP-00001', remedial_notes: long ? longText : null },
});

describe('riser inspection sheets print on one A4 page', () => {
  for (const t of templates as any[]) for (const outlets of [8, 10]) {
    it(`${t.name} with ${outlets} outlets, full logo and footer remains one A4`, () => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const logo = { dataUrl: `data:image/png;base64,${readFileSync('src/assets/vivafire-logo.png').toString('base64')}`, width: 1536, height: 1024, format: 'PNG' as const, visibleTop: 173 / 1024, visibleBottom: 649 / 1024 };
      const info = job(false);
      const accreditationLogos = ['bafe-logo.jpeg', 'constructionline-logo.png', 'iso-9001-logo.jpg', 'smas-logo.png'].map(file => {
        const jpeg = /jpe?g$/.test(file);
        return { dataUrl: `data:image/${jpeg ? 'jpeg' : 'png'};base64,${readFileSync(`src/assets/accreditation/${file}`).toString('base64')}`, width: 100, height: 100, format: jpeg ? 'JPEG' as const : 'PNG' as const };
      });
      renderPaperFormPage(doc, { template: t, jobInfo: { ...info, riserVisit: { ...info.riserVisit, outlets_count: outlets } }, logo, accreditationLogos, handfill: true });
      expect(doc.getNumberOfPages()).toBe(1);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
      expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
      if (process.env.RISER_PDF_CHECK_DIR) {
        mkdirSync(process.env.RISER_PDF_CHECK_DIR, { recursive: true });
        writeFileSync(`${process.env.RISER_PDF_CHECK_DIR}/${/pressure/i.test(t.name) ? 'pressure' : 'visual'}-${outlets}.pdf`, Buffer.from(doc.output('arraybuffer')));
      }
    });
  }
  for (const t of templates as any[]) for (const long of [false, true]) {
    it(`${t.name}${long ? ' with long names/access notes' : ''}`, () => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      renderPaperFormPage(doc, { template: t, jobInfo: job(long) as any, logo: null, accreditationLogos: [], handfill: true });
      expect(doc.getNumberOfPages()).toBe(1);
    });
  }
  it('places visible riser logo ink at 5mm with a 3.5mm title gap and aligned QR', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const logo = { dataUrl: `data:image/png;base64,${readFileSync('src/assets/vivafire-logo.png').toString('base64')}`, width: 1536, height: 1024, format: 'PNG' as const, visibleTop: 173 / 1024, visibleBottom: 649 / 1024 };
    const addImage = vi.spyOn(doc as any, 'addImage') as any;
    const text = vi.spyOn(doc as any, 'text') as any;
    const rect = vi.spyOn(doc as any, 'rect') as any;
    renderPaperFormPage(doc, { template: templates[0] as any, jobInfo: job(false) as any, logo, accreditationLogos: [], handfill: true });
    const logoCall = addImage.mock.calls.find(call => call[0] === logo.dataUrl)!;
    const imageTop = Number(logoCall[3]);
    const imageHeight = Number(logoCall[5]);
    expect(imageTop + imageHeight * logo.visibleTop).toBeCloseTo(5, 5);
    const visibleBottom = imageTop + imageHeight * logo.visibleBottom;
    const scopeCall = text.mock.calls.find(call => String(call[0]).startsWith('SCOPE OF WORK:'))!;
    const titleTop = Number(scopeCall[2]) - 12 * 0.352777778 * 0.72;
    expect(titleTop - visibleBottom).toBeCloseTo(3.5, 5);
    const qrCall = rect.mock.calls.find((call: any[]) => Number(call[2]) === 20 && Number(call[3]) === 20 && call[4] === 'F')!;
    expect(Number(qrCall[1])).toBeCloseTo(5, 5);
    const riserIdCall = text.mock.calls.find(call => String(call[0]).startsWith('Riser ID '))!;
    expect(Number(riserIdCall[2])).toBeCloseTo(29, 5);
  });
  it('pressure sheet declares the 12 bar / 15 minute BS 9990:2015 test', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const text = vi.spyOn(doc as any, 'text') as any;
    const t = (templates as any[]).find(t => /pressure/i.test(t.name))!;
    renderPaperFormPage(doc, { template: t, jobInfo: job(false) as any, logo: null, accreditationLogos: [], handfill: true });
    const printed = text.mock.calls.map((c: any[]) => String(c[0])).join('\n');
    expect(printed).toContain('We have, today, carried out a dry riser pressure test to the requirements of BS 9990:2015 at 12 bar for 15 minutes.');
  });
  it('visual sheet declares a visual inspection and never mentions pressure, bar or minutes', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const text = vi.spyOn(doc as any, 'text') as any;
    const t = (templates as any[]).find(t => /visual/i.test(t.name))!;
    renderPaperFormPage(doc, { template: t, jobInfo: job(false) as any, logo: null, accreditationLogos: [], handfill: true });
    const printed = text.mock.calls.map((c: any[]) => String(c[0])).join('\n');
    expect(printed).toContain('We have, today, carried out a dry riser visual inspection to the requirements of BS 9990:2015.');
    expect(printed).not.toMatch(/pressure|\bbar\b|minutes/i);
  });
  it('prints outlet valve choices, GOOD/FAIR/POOR outlet cabinets with CABINET KEYS, and no visit history', () => {
    for (const t of templates as any[]) {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const text = vi.spyOn(doc as any, 'text') as any;
      const info = job(false) as any;
      info.riserVisit = { ...info.riserVisit, last_inspection_at: '2026-01-01', last_inspection_type: 'visual', last_inspection_result: 'pass' };
      renderPaperFormPage(doc, { template: t, jobInfo: info, logo: null, accreditationLogos: [], handfill: true });
      const printed = text.mock.calls.map((c: any[]) => String(c[0])).join('\n');
      for (const c of ['PN16 FLANGE', 'TABLE D FLANGE', 'MALE THREAD', 'FEMALE THREAD', 'GOOD / FAIR / POOR', 'CABINET KEYS:']) expect(printed).toContain(c);
      expect(printed).not.toMatch(/^Valve type:/m);
      expect(printed).not.toMatch(/Last inspection|Result:/);
    }
  });
  it('removes the GENERAL section and its Materials required row from both sheets', () => {
    for (const t of templates as any[]) {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const text = vi.spyOn(doc as any, 'text') as any;
      renderPaperFormPage(doc, { template: t, jobInfo: job(false) as any, logo: null, accreditationLogos: [], handfill: true });
      const printed = text.mock.calls.map((c: any[]) => String(c[0])).join('\n');
      expect(printed).not.toMatch(/GENERAL/);
      expect(printed).not.toMatch(/Materials required/i);
    }
  });
  it('a very long template still fits on one page', () => {
    const t = templates[0] as any;
    const fields = Array.from({ length: 4 }, () => t.fields).flat();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    renderPaperFormPage(doc, { template: { name: t.name, fields }, jobInfo: job(true) as any, logo: null, accreditationLogos: [], handfill: true });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
