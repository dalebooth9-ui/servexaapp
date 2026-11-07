import { describe, expect, it } from 'vitest';
import { canChangeDigitalTwin, digitalTwinEnabled, digitalTwinEnabledForCompany } from './digitalTwinSettings';

describe('Digital Twin company opt-in', () => {
  it('is off by default, including missing and invalid settings', () => {
    for (const value of [undefined, null, {}, { enabled: false }, { enabled: 'true' }]) {
      expect(digitalTwinEnabled(value)).toBe(false);
    }
  });
  it('can be switched on explicitly and switched back off', () => {
    expect(digitalTwinEnabled({ enabled: true })).toBe(true);
    expect(digitalTwinEnabled({ enabled: false })).toBe(false);
  });
  it('only a company admin may change it', () => {
    expect(canChangeDigitalTwin('admin', 'company-a')).toBe(true);
    expect(canChangeDigitalTwin('engineer', 'company-a')).toBe(false);
    expect(canChangeDigitalTwin(null, 'company-a')).toBe(false);
    expect(canChangeDigitalTwin('admin', null)).toBe(false);
  });
  it('never uses another company setting', () => {
    const row = { org_id: 'company-a', value: { enabled: true } };
    expect(digitalTwinEnabledForCompany('company-a', row)).toBe(true);
    expect(digitalTwinEnabledForCompany('company-b', row)).toBe(false);
    expect(digitalTwinEnabledForCompany(null, row)).toBe(false);
    expect(digitalTwinEnabledForCompany('company-b', null)).toBe(false);
  });
});