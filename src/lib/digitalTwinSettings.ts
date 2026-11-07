export const DIGITAL_TWIN_SETTINGS_KEY = 'digital_twin';

export function digitalTwinEnabled(value: unknown): boolean {
  return typeof value === 'object' && value !== null &&
    'enabled' in value && value.enabled === true;
}

export function canChangeDigitalTwin(role: string | null, orgId: string | null): boolean {
  return role === 'admin' && Boolean(orgId);
}

export function digitalTwinEnabledForCompany(
  orgId: string | null,
  row: { org_id: string; value: unknown } | null | undefined,
): boolean {
  return Boolean(orgId && row?.org_id === orgId && digitalTwinEnabled(row.value));
}