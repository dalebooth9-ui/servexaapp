import { describe, it, expect } from 'vitest';
import { stickerLogoChoice, missingStickerLogoNote } from '@/lib/stickerBranding';

describe('sticker logo choice', () => {
  it('uses the customer print logo when their own branding is on', () => {
    expect(stickerLogoChoice({ name: 'Besseges', use_print_branding: true, print_logo_url: 'p.png', logo_url: 'l.png' })).toEqual({ kind: 'customer', logoRef: 'p.png', customerName: 'Besseges' });
  });
  it('keeps the company (Viva) logo when customer branding is off, even with a logo', () => {
    expect(stickerLogoChoice({ name: 'X', use_print_branding: false, logo_url: 'l.png' }).kind).toBe('company');
    expect(stickerLogoChoice(null).kind).toBe('company');
  });
  it('prints no logo and warns when branding is on but no logo is uploaded', () => {
    expect(stickerLogoChoice({ id: 'c1', name: 'Acme', use_print_branding: true })).toEqual({ kind: 'missing', customerId: 'c1', customerName: 'Acme' });
    expect(missingStickerLogoNote('Acme')).toBe('No logo uploaded for Acme. Stickers will print without a logo.');
  });
});
