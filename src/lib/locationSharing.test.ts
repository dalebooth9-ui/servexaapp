import { describe, it, expect } from 'vitest';
import { parseLocationSharing, shouldShareLocation, locationChipStatus, DEFAULT_LOCATION_SHARING, LOCATION_UPDATE_MS } from './locationSharing';

describe('location sharing rules', () => {
  it('is on for engineers by default', () => {
    expect(shouldShareLocation(parseLocationSharing(null), 'engineer', false)).toBe(true);
  });
  it('does not ask admins by default', () => {
    expect(shouldShareLocation(DEFAULT_LOCATION_SHARING, 'admin', false)).toBe(false);
  });
  it('admin who switches it on for themselves shares', () => {
    expect(shouldShareLocation(DEFAULT_LOCATION_SHARING, 'admin', true)).toBe(true);
  });
  it('company switch off stops everyone', () => {
    const s = parseLocationSharing({ enabled: false, roles: ['engineer', 'admin'] });
    expect(shouldShareLocation(s, 'engineer', false)).toBe(false);
    expect(shouldShareLocation(s, 'admin', true)).toBe(false);
  });
  it('admin can remove engineers from the roles', () => {
    expect(shouldShareLocation(parseLocationSharing({ enabled: true, roles: ['admin'] }), 'engineer', false)).toBe(false);
  });
  it('customer users never share', () => {
    expect(shouldShareLocation(DEFAULT_LOCATION_SHARING, 'customer_user', true)).toBe(false);
  });
  it('updates about every minute', () => {
    expect(LOCATION_UPDATE_MS).toBe(60_000);
  });
  it('off chip tells the office what to do and shows last seen', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');
    const t = locationChipStatus(new Date(now - 164 * 3600_000).toISOString(), 'Dale Booth', now);
    expect(t.status).toBe('offline');
    expect(t.tooltip).toContain('Ask Dale to open Servexa on their phone and allow location');
    expect(t.tooltip).toContain('last seen 6 days ago');
  });
  it('recent update is live', () => {
    const now = Date.now();
    expect(locationChipStatus(new Date(now - 60_000).toISOString(), 'A B', now).status).toBe('live');
  });
});
