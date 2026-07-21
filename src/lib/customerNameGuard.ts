// Shared guard: reject "customer" strings that are actually a URL, a domain, an
// email, or a match against the generating org's own identity. Used across the
// paper-scan matcher, the archive PDF builder, and the job-sheet PDF header
// fallback chain so a company's own website printed in a sheet footer can never
// be surfaced as the customer name.

const DOMAIN_RE = /(https?:\/\/|www\.|@)|\.[a-z]{2,}(\.[a-z]{2,})?(\/|$)/i;

export function looksLikeDomainOrUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = String(raw).trim();
  if (!s) return false;
  if (DOMAIN_RE.test(s)) return true;
  // "vivafire.co.uk", "foo.com" — anything with a dot + short tail.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s)) return true;
  return false;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/^www\./, "")
    .replace(/\.(co\.uk|com|net|org|io|uk|ltd)$/g, "")
    .replace(/\s+(ltd|limited|plc|llp|inc)\.?$/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * True when the candidate string collapses to the same identity as any of the
 * generating-org identifiers (org name, intake email local-part, etc.).
 */
export function matchesOrgIdentity(
  candidate: string | null | undefined,
  orgIdentifiers: Array<string | null | undefined>,
): boolean {
  if (!candidate) return false;
  const c = normalise(String(candidate));
  if (!c) return false;
  for (const id of orgIdentifiers) {
    if (!id) continue;
    const n = normalise(String(id));
    if (!n) continue;
    if (c === n || c.includes(n) || n.includes(c)) return true;
  }
  return false;
}

export function isSafeCustomerName(
  candidate: string | null | undefined,
  orgIdentifiers: Array<string | null | undefined> = [],
): boolean {
  if (!candidate) return false;
  if (looksLikeDomainOrUrl(candidate)) return false;
  if (matchesOrgIdentity(candidate, orgIdentifiers)) return false;
  return true;
}
