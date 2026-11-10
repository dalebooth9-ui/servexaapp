import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import templates from './fixtures/riserSheetTemplates.json';

describe('outstanding defect riser print', () => {
  for (const template of templates as any[]) {
    it(`${template.name} keeps ten outlets plus works/materials on one A4`, () => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      renderPaperFormPage(doc, { template, logo: null, accreditationLogos: [], handfill: true, jobInfo: {
        customer: 'Bristol Fire', reference_number: 'VFP-00283', site: { name: 'Wade Court', address: 'Wade Street', postcode: 'BS2 9AF' },
        riserVisit: { asset_tag: 'ABC234', outlets_count: 10, remedials: [{ id: 'wade', title: 'Inlet sign required', works_required: 'Fit inlet sign', materials_required: 'Inlet sign' }] },
      } as any });
      expect(doc.getNumberOfPages()).toBe(1);
      const stream = doc.output();
      expect(stream).toContain('Fit inlet sign');
      expect(stream).toContain('Materials: Inlet sign');
      expect(stream).toContain('REMEDIAL WORKS OUTSTANDING FROM PREVIOUS VISIT');
    });
  }
});