import { describe, it, expect } from 'vitest';
import { verifyReportCopy, hasPendingSheetReview } from '@/lib/reportPersistence';

describe('complete report confirmation', () => {
  const expected = { id: 'bosden-report', status: 'submitted', responses: { answer: 'GOOD', _site_photo_paths: ['photo1', 'photo2'] } };
  it('accepts the exact answers and both photos read back', () => {
    expect(() => verifyReportCopy({ ...expected, responses: { _site_photo_paths: ['photo1', 'photo2'], answer: 'GOOD' } }, expected)).not.toThrow();
  });
  it('rejects confirmation when the server lost answers', () => {
    expect(() => verifyReportCopy({ ...expected, responses: {} }, expected)).toThrow();
  });
  it('rejects confirmation when a photo is missing', () => {
    expect(() => verifyReportCopy({ ...expected, responses: { answer: 'GOOD', _site_photo_paths: ['photo1'] } }, expected)).toThrow();
  });
  it('rejects a report still saved as draft', () => {
    expect(() => verifyReportCopy({ ...expected, status: 'draft' }, expected)).toThrow();
  });
  it('shows submitted sheets from active Bosden jobs in office review', () => {
    expect(hasPendingSheetReview('active')).toBe(true);
    expect(hasPendingSheetReview('completed')).toBe(false);
    expect(hasPendingSheetReview('cancelled')).toBe(false);
  });
});