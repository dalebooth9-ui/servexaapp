import type { PrintCustomer } from './printBrandingRules';

/** What goes in the sticker logo slot. Same opt-in as report branding (use_print_branding). */
export type StickerLogoChoice =
  | { kind: 'customer'; logoRef: string; customerName: string }
  | { kind: 'missing'; customerId?: string; customerName: string }
  | { kind: 'company' };

export function stickerLogoChoice(customer: PrintCustomer | null | undefined): StickerLogoChoice {
  if (customer?.use_print_branding !== true) return { kind: 'company' };
  const ref = (customer.print_logo_url || customer.logo_url || '').trim();
  const customerName = customer.name || 'this customer';
  return ref ? { kind: 'customer', logoRef: ref, customerName } : { kind: 'missing', customerId: customer.id, customerName };
}

export const missingStickerLogoNote = (name: string) => `No logo uploaded for ${name}. Stickers will print without a logo.`;

/** Resolve the printable logo URL for one job/site; null = plain QR + code. */
export async function resolveStickerBranding(input: { jobId?: string | null; siteId?: string | null }): Promise<{ choice: StickerLogoChoice; logoUrl: string | null }> {
  const [{ resolvePrintCustomer }, { getGeneratingOrgBranding, getGeneratingOrgFallbackLogoUrl }, { resolveToSignedUrl }, { stickerLogoUrl }] = await Promise.all([
    import('./documentBrandingProfile'), import('./generatingOrgBranding'), import('./durableStorageRef'), import('./riserStickers'),
  ]);
  const customer = input.jobId || input.siteId ? await resolvePrintCustomer({ jobId: input.jobId, siteId: input.siteId }) : null;
  const choice = stickerLogoChoice(customer);
  if (choice.kind === 'missing') return { choice, logoUrl: null };
  if (choice.kind === 'customer') return { choice, logoUrl: (await resolveToSignedUrl(choice.logoRef).catch(() => null)) || choice.logoRef };
  const g = await getGeneratingOrgBranding();
  if (!g.isViva && g.logoUrl) return { choice, logoUrl: (await resolveToSignedUrl(g.logoUrl, 'submissions').catch(() => null)) || g.logoUrl };
  const fallback = await getGeneratingOrgFallbackLogoUrl();
  return { choice, logoUrl: fallback ? stickerLogoUrl(fallback) : null };
}
