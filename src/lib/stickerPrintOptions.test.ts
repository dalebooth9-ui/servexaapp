import { describe, expect, it } from 'vitest';
import { outletCountUnknown, printLogo, unprintedStickerKeys } from './stickerPrintOptions';

describe('sticker print choices', () => {
  it('leaves logos off only when ticked for this print', () => {
    expect(printLogo(true, 'customer-logo')).toBeNull();
    expect(printLogo(false, 'customer-logo')).toBe('customer-logo');
  });
  it('defaults to new outlets without repeating a printed inlet', () => {
    expect([...unprintedStickerKeys([{ key: 'CODE', printedAt: '2026-11-19' }, { key: 'CODE-1' }, { key: 'CODE-2', printedAt: '2026-11-19' }])]).toEqual(['CODE-1']);
  });
  it('keeps the inlet printable before outlets are known', () => {
    expect(outletCountUnknown(null)).toBe(true);
    expect([...unprintedStickerKeys([{ key: 'CODE' }])]).toEqual(['CODE']);
  });
  it('does not treat a recorded zero as an unknown count', () => {
    expect(outletCountUnknown(0)).toBe(false);
    expect(outletCountUnknown(2)).toBe(false);
  });
});