import { describe, expect, it } from 'vitest';
import { companyDetailsComplete, companyDetailsErrors, companyLogoFallback, setupStepUrl, visibleCompanyDetailsErrors } from '../lib/companyDetails';
describe('company details rules', () => {
  const details = { name: 'Example Fire', logo_url: 'storage://customer-logos/org/print-logos/logo.png', primary_color: '#1F4E79' };
  it('requires a company name', () => { expect(companyDetailsErrors({ ...details, name: ' ' }).name).toBeTruthy(); });
  it('never shows missing-field errors before Save or Next', () => {
    const empty = { name: '', logo_url: null, primary_color: null };
    expect(visibleCompanyDetailsErrors(empty, false)).toEqual({ name: '', logo_url: '', primary_color: '' });
    expect(Object.values(visibleCompanyDetailsErrors(empty, true)).every(Boolean)).toBe(true);
  });
  it('saved values are valid without touching them, including after Save', () => {
    expect(visibleCompanyDetailsErrors(details, true)).toEqual({ name: '', logo_url: '', primary_color: '' });
    expect(companyDetailsComplete(details)).toBe(true);
  });
  it('recognises Viva’s existing default logo for completion and validation', () => {
    const viva = { ...details, logo_url: null };
    expect(companyDetailsComplete(viva, true)).toBe(true);
    expect(visibleCompanyDetailsErrors(viva, true, true).logo_url).toBe('');
    expect(companyDetailsComplete(viva, false)).toBe(false);
  });
  it('only completes Step 1 with all three saved fields', () => {
    expect(companyDetailsComplete(details)).toBe(true);
    expect(companyDetailsComplete({ ...details, logo_url: null })).toBe(false);
    expect(companyDetailsComplete({ ...details, primary_color: null })).toBe(false);
  });
  it('uses the uploaded logo even for Viva', () => { expect(companyLogoFallback({ isViva: true, logoUrl: details.logo_url })).toBe(details.logo_url); });
  it('preserves Viva defaults but never shares them', () => {
    expect(companyLogoFallback({ isViva: true, logoUrl: null })).toBe('/images/vivafire-logo-new.png');
    expect(companyLogoFallback({ isViva: false, logoUrl: null })).toBe('');
  });
  it('preserves the exact tab and section when adding the setup step', () => { expect(setupStepUrl({ href: '/settings?tab=documents&section=company-details', index: 1 })).toBe('/settings?tab=documents&section=company-details&setup=1'); });
});