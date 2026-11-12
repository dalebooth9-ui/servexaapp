import { getGeneratingOrgBranding, getGeneratingOrgFallbackLogoUrl } from './generatingOrgBranding';
import { resolveToSignedUrl } from './durableStorageRef';
const KEY = 'servexa-login-company';
export function readLoginCompanyBranding(): { name: string; logo: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (typeof value?.name !== 'string') return null;
    return { name: value.name, logo: typeof value.logo === 'string' && /^(data:image\/png;base64,|\/images\/)/.test(value.logo) ? value.logo : '' };
  } catch { return null; }
}
/** Display-only device branding; never used for identity, permissions or org selection. */
export async function rememberLoginCompanyBranding() {
  const org = await getGeneratingOrgBranding();
  if (!org.orgId || !org.name) return;
  const raw = await getGeneratingOrgFallbackLogoUrl();
  const url = raw.startsWith('/') ? raw : await resolveToSignedUrl(raw);
  let logo = '';
  if (url) {
    try {
      const image = new Image(); image.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
      const scale = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.drawImage(image, 0, 0, canvas.width, canvas.height); logo = canvas.toDataURL('image/png'); }
    } catch { /* Keep the company name when the logo cannot be loaded. */ }
  }
  localStorage.setItem(KEY, JSON.stringify({ name: org.name, logo }));
}