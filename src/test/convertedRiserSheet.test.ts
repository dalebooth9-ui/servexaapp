import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import { pickOption, pickValveChoices } from '@/lib/paperFormFill';
import { usesRiserPaperForm } from '@/lib/archivePdfBuilder';
import templates from './fixtures/riserSheetTemplates.json';

describe('converted dry riser reports use the QR-flow sheet', () => {
  it('uses the sheet for dry riser pressure test, visual and commissioning only', () => {
    expect(usesRiserPaperForm('Dry Riser - Pressure Test')).toBe(true);
    expect(usesRiserPaperForm('Dry Riser - Visual Inspection')).toBe(true);
    expect(usesRiserPaperForm('Dry Riser Commissioning')).toBe(true);
    expect(usesRiserPaperForm('Fire Hydrant Annual Inspection')).toBe(false);
  });
  it('ticks the answer written on the sheet', () => {
    expect(pickOption(['YES', 'NO', 'N/A'], true)).toBe('YES');
    expect(pickOption(['PASS', 'FAIL', 'N/A'], 'fail')).toBe('FAIL');
    expect(pickOption(['YES', 'NO', 'N/A'], 'n/a')).toBe('N/A');
    expect(pickValveChoices('Female thread')).toEqual(['FEMALE THREAD']);
    expect(pickValveChoices('PN16 flange')).toEqual(['PN16 FLANGE']);
  });
  it('prints answers, the 7.4.6 answer and leftover sheet notes on one page', () => {
    const t = (templates as any[]).find(x => /pressure/i.test(x.name));
    const answers: Record<string, any> = {};
    for (const f of t.fields) if (f.type === 'yes_no' || f.type === 'pass_fail') answers[f.id] = f.type === 'yes_no' ? 'yes' : 'pass';
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    renderPaperFormPage(doc, {
      template: t, logo: null, accreditationLogos: [], handfill: false,
      jobInfo: { customer: "Watkin's", customer_po: 'PO-9', due_date: '2026-11-17', site: { name: 'Riverside Studios', address: 'Riverside Studios, Derby', postcode: null, contact_name: null, contact_phone: null, contact_email: null, riser_location: 'Block B 21 - 47' },
        riserVisit: { asset_tag: 'RA6FXR', riser_name: 'Dry Riser - Block B 21 - 47', outlets_count: 8, job_reference: 'VFP-00277' },
        filled: { answers, also: ['Have all inspection and test records been filled in? (BS9990:2015 7.4.6): Yes', 'Scope: Hydraulic Pressure Test'], techName: 'C Whittaker', techDate: '17/11/2026' } } as any,
    });
    expect(doc.getNumberOfPages()).toBe(1);
    const out = doc.output();
    expect(out).toContain('Riser ID RA6FXR');
    expect(out).toContain('C Whittaker');
    expect(out).toContain('Hydraulic Pressure Test');
    expect(out).not.toMatch(/Also on the paper sheet:[^)]*7\.4\.6/);
  });
});
