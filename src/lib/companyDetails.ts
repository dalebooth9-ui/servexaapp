export type CompanyDetails = { name: string; logo_url: string | null; primary_color: string | null };
export function companyDetailsErrors(d: CompanyDetails) {
  return {
    name: d.name.trim() ? '' : 'Enter your company name.',
    logo_url: d.logo_url ? '' : 'Upload your company logo.',
    primary_color: /^#[0-9a-f]{6}$/i.test(d.primary_color || '') ? '' : 'Pick a brand colour.',
  };
}
export function companyDetailsComplete(d: CompanyDetails) {
  return Object.values(companyDetailsErrors(d)).every(value => !value);
}
export function companyLogoFallback(d: { isViva: boolean; logoUrl: string | null }) {
  return d.logoUrl || (d.isViva ? '/images/vivafire-logo-new.png' : '');
}
export function setupStepUrl(step: { href: string; index: number }) {
  const url = new URL(step.href, 'https://servexaapp.com');
  url.searchParams.set('setup', String(step.index));
  return url.pathname + url.search;
}