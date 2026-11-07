import { describe, it, expect } from 'vitest';
import { cleanMapText, copyableAddress, mapAddressUrl } from './mapAddress';

describe('safe location links', () => {
  it('blank addresses and dashes are not destinations', () => {
    expect(['', ' ', '—', '-', '–'].map(cleanMapText)).toEqual(['', '', '', '', '']);
  });
  it('copies only address and postcode without repeating postcode', () => {
    expect(copyableAddress('1 Court Road N8 7FA', 'N8 7FA')).toBe('1 Court Road N8 7FA');
    expect(copyableAddress('1 Court Road', 'N8 7FA')).toBe('1 Court Road, N8 7FA');
  });
  it('uses saved coordinates instead of the street address', () => {
    expect(mapAddressUrl({address:'Court Road',lat:51.5,lng:-0.1},false,false)).toBe('https://www.google.com/maps/search/?api=1&query=51.5%2C-0.1');
  });
  it('leaves directions origin unset for the current user location', () => {
    expect(mapAddressUrl({address:'Court Road',postcode:'N8 7FA'},true,false)).toBe('https://www.google.com/maps/dir/?api=1&destination=Court%20Road%2C%20N8%207FA');
  });
  it('uses native Apple directions links on Apple mobile devices', () => {
    expect(mapAddressUrl({lat:51.5,lng:-0.1},true,true)).toBe('https://maps.apple.com/?daddr=51.5%2C-0.1&dirflg=d');
  });
  it('never includes access fields or private notes', () => {
    const row = {address:'Court Road',postcode:'N8 7FA',access_code:'12345',notes:'private notes'};
    expect(mapAddressUrl(row,false,false)).toBe('https://www.google.com/maps/search/?api=1&query=Court%20Road%2C%20N8%207FA');
  });
});