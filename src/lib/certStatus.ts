// Shared catalogue & helpers for engineer skills / certifications.

export type CertStatus = "valid" | "expiring_soon" | "expired" | "no_expiry";

export const CERTIFICATION_TYPES: { value: string; label: string }[] = [
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "emergency_lighting", label: "Emergency Lighting" },
  { value: "extinguisher", label: "Fire Extinguisher" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "dry_riser", label: "Dry Riser" },
  { value: "wet_riser", label: "Wet Riser" },
  { value: "suppression", label: "Suppression" },
  { value: "access_control", label: "Access Control" },
  { value: "cctv", label: "CCTV" },
  { value: "gas", label: "Gas" },
  { value: "electrical", label: "Electrical" },
  { value: "health_safety", label: "Health & Safety" },
  { value: "other", label: "Other" },
];

export const ISSUING_BODIES = [
  "FIA",
  "ECS",
  "BAFE",
  "IPAF",
  "NICEIC",
  "CSCS",
  "Gas Safe",
  "City & Guilds",
  "Other",
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function getCertStatus(expiry: string | null | undefined, withinDays = 30): CertStatus {
  if (!expiry) return "no_expiry";
  const exp = new Date(expiry).getTime();
  const now = Date.now();
  if (exp < now) return "expired";
  if (exp < now + withinDays * DAY_MS) return "expiring_soon";
  return "valid";
}

export function statusLabel(s: CertStatus) {
  return s === "valid" ? "Valid"
    : s === "expiring_soon" ? "Expiring soon"
    : s === "expired" ? "Expired"
    : "No expiry";
}

export function certTypeLabel(value: string | null | undefined) {
  if (!value) return "Uncategorised";
  return CERTIFICATION_TYPES.find((t) => t.value === value)?.label || value;
}

// Map a job category slug/name to the most relevant certification_type.
// Used for advisory matching during job assignment.
export function jobCategoryToCertType(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.toLowerCase();
  if (v.includes("dry") && v.includes("riser")) return "dry_riser";
  if (v.includes("wet") && v.includes("riser")) return "wet_riser";
  if (v.includes("sprinkler")) return "sprinkler";
  if (v.includes("extinguisher")) return "extinguisher";
  if (v.includes("alarm")) return "fire_alarm";
  if (v.includes("emergency") && v.includes("light")) return "emergency_lighting";
  if (v.includes("suppress")) return "suppression";
  if (v.includes("access") && v.includes("control")) return "access_control";
  if (v.includes("cctv")) return "cctv";
  if (v.includes("gas")) return "gas";
  if (v.includes("electric")) return "electrical";
  return null;
}

// Pick the best (latest expiring, valid > expiring_soon > expired) cert of a given type.
export function bestCertOfType<T extends { certification_type?: string | null; expiry_date?: string | null }>(
  docs: T[],
  type: string,
): T | null {
  const matches = docs.filter((d) => d.certification_type === type);
  if (!matches.length) return null;
  const order: Record<CertStatus, number> = { valid: 0, no_expiry: 1, expiring_soon: 2, expired: 3 };
  return [...matches].sort((a, b) => {
    const sa = getCertStatus(a.expiry_date);
    const sb = getCertStatus(b.expiry_date);
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    return new Date(b.expiry_date || 0).getTime() - new Date(a.expiry_date || 0).getTime();
  })[0];
}
