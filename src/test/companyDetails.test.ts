import { describe, expect, it } from 'vitest';
import { companyDetailsComplete, companyDetailsErrors, companyLogoFallback, setupStepUrl } from '../lib/companyDetails';
describe('company details rules', () => {
  const details = { name: 'Example Fire', logo_url: 'storage://customer-logos/org/print-logos/logo.png', primary_color: '#1F4E79' };
  it('requires a company name', () => { expect(companyDetailsErrors({ ...details, name: ' ' }).name).toBeTruthy(); });
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