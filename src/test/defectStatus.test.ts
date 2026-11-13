import { expect, it } from 'vitest';
import { DEFECT_STATUSES, defectStatusErrorMessage } from '../lib/defectStatus';

it('accepts scheduled as a defect status', () => {
  expect(DEFECT_STATUSES).toContain('scheduled');
});

it('explains a refused status in plain English', () => {
  expect(defectStatusErrorMessage({ message: 'Invalid defect status: scheduled' })).toMatch(/"scheduled" isn't a status/);
  expect(defectStatusErrorMessage({ message: 'new row violates row-level security policy' })).toMatch(/permission/);
});
