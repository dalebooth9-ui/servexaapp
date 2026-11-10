import { describe, it, expect, vi } from 'vitest';
import jsPDF from 'jspdf';
import { renderPaperFormPage } from '@/workers/paperFormRenderer';
import { pdfTextWidthUnits } from '@/lib/pdfTextMetrics';
import templates from './fixtures/riserSheetTemplates.json';

const jobInfo = {
  customer: 'Craven House Management Ltd',
  reference_number: 'VFP-00001',
  customer_po: 'PO-1',
  site: { name: 'Craven House', address: 'Craven House, 1 High Street, Leeds, LS1 1AA', postcode: 'LS1 1AA' },
  riserVisit: { asset_tag: 'ABC234', riser_name: 'North stair', outlets_count: 8, job_reference: 'VFP-00001' },
};

/** The heading is drawn in 12pt Helvetica-Bold, so measure it the same way. */
function paintedWidth(doc: any, text: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  return pdfTextWidthUnits(doc, text);
}

describe('scope of work underline covers the whole heading', () => {
  for (const t of templates as any[]) {
    it(`${t.name}: underline reaches the end of the painted heading`, () => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const text = vi.spyOn(doc as any, 'text') as any;
      const line = vi.spyOn(doc as any, 'line') as any;
      renderPaperFormPage(doc, { template: t, jobInfo: jobInfo as any, logo: null, accreditationLogos: [], handfill: true });

      const scopeCall = text.mock.calls.find((c: any[]) => String(c[0]).startsWith('SCOPE OF WORK:'))!;
      const heading = String(scopeCall[0]);
      const x = Number(scopeCall[1]);
      const y = Number(scopeCall[2]);
      const underline = line.mock.calls.find(
        (c: any[]) => Math.abs(Number(c[0]) - x) < 0.01 && Number(c[1]) > y && Number(c[1]) < y + 3,
      )!;

      const width = Number(underline[2]) - Number(underline[0]);
      const painted = paintedWidth(doc, heading);
      expect(width).toBeCloseTo(painted, 2);
      // The old measurement (jsPDF's narrow table) left the last letter bare.
      expect(width).toBeGreaterThan(doc.getTextWidth(heading));
      expect(width - doc.getTextWidth(heading)).toBeGreaterThan(1);
    });
  }

  it('measures the visual heading at the real Helvetica-Bold width', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const heading = 'SCOPE OF WORK: 6 MONTHLY VISUAL INSPECTION';
    expect(pdfTextWidthUnits(doc, heading)).toBeCloseTo(107.256, 2);
    expect(doc.getTextWidth(heading)).toBeCloseTo(105.749, 2);
  });

  it('falls back to the library measurement for fonts it does not know', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    expect(pdfTextWidthUnits(doc, 'Riser')).toBeCloseTo(doc.getTextWidth('Riser'), 3);
  });
});
