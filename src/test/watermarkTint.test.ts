import { describe, it, expect } from 'vitest';
import { watermarkTint, NEUTRAL_WATERMARK_GREY, PRINT_WATERMARK_OPACITY } from '@/lib/watermarkTint';
describe('watermarkTint', () => {
  it('turns Viva navy into a clear blue', () => {
    const [r, g, b] = watermarkTint([0x1f, 0x4e, 0x79]);
    expect(b - r).toBeGreaterThan(150);
  });
  it('no brand colour gives neutral grey', () => { expect(watermarkTint(null)).toEqual(NEUTRAL_WATERMARK_GREY); });
  it('prints at 12% opacity', () => { expect(PRINT_WATERMARK_OPACITY).toBe(0.12); });
});
