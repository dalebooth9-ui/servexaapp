/**
 * Signer roles that count as the engineer's sign-off on a report. Office/admin
 * staff sign as "admin" when they fill a report themselves, so both count;
 * a customer signature never does.
 */
export const ENGINEER_SIGNER_ROLES = ["engineer", "admin"] as const;
export const isEngineerSignature = (role: string | null | undefined) =>
  (ENGINEER_SIGNER_ROLES as readonly string[]).includes(String(role || ""));
