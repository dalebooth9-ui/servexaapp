/**
 * Printed Customer/Site Details — one rule for every printout.
 *
 * Order is always: customer name, then site name, then site address. A line is
 * skipped when it only says something that is already printed (so an address
 * that merely repeats the site name disappears), and the postcode is printed
 * exactly once. Paper sheets, Word documents and PDF headers all read this so
 * the wording can never drift apart between companies or templates.
 */

export type SiteDetailInput = {
  customer?: string | null;
  siteName?: string | null;
  address?: string | null;
  postcode?: string | null;
};

/** Case/punctuation-insensitive key, so "HOME PARK," and "home park" compare equal. */
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Match a phrase (e.g. a site name) inside a longer string, tolerating any
 * punctuation between its words so "MAYFIELD PARK HAZEL COURT" also matches
 * "MAYFIELD PARK, HAZEL COURT".
 */
function stripPhrase(text: string, phrase: string): string {
  const words = String(phrase || '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return text;
  const body = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Za-z0-9]+');
  try {
    return text.replace(new RegExp(`\\b${body}\\b`, 'gi'), ' ');
  } catch {
    return text;
  }
}

/**
 * Ordered print lines: customer, site name, site address.
 * Anything that repeats an earlier line is dropped; the address line is left
 * out completely when it only repeated the site name; the postcode is appended
 * only when it is not already printed.
 */
export function siteDetailLines({ customer, siteName, address, postcode }: SiteDetailInput): string[] {
  const lines: string[] = [];
  const printed: string[] = [];
  const KEY_MIN = 4; // don't judge short fragments like "1" or "A" as repeats

  const remember = (text: string) => {
    const k = norm(text);
    if (!k) return;
    printed.push(k);
    lines.push(text);
  };

  const cust = (customer || '').trim();
  const site = (siteName || '').trim();
  if (cust) remember(cust);

  /** True when `value` is the same as, or only a slight variation of, something printed. */
  const isRepeatOf = (value: string) => {
    const k = norm(value);
    if (!k) return true;
    return printed.some((p) => p === k || (Math.min(p.length, k.length) >= KEY_MIN && (p.includes(k) || k.includes(p))));
  };
  /** True when `value` is already inside something printed (used for address fragments). */
  const isCoveredBy = (value: string) => {
    const k = norm(value);
    if (!k) return true;
    return printed.some((p) => p.includes(k) && Math.min(p.length, k.length) >= KEY_MIN);
  };

  if (site && !isRepeatOf(site)) remember(site);

  let addr = (address || '').trim();
  if (addr) {
    // Remove what is already on the page before splitting into fragments.
    if (norm(cust).length >= 8) addr = stripPhrase(addr, cust);
    if (norm(site).length >= KEY_MIN) addr = stripPhrase(addr, site);

    const parts: string[] = [];
    const addPart = (part: string) => {
      const k = norm(part);
      if (!k) return;
      // A fragment swallowed by one already kept is a repeat...
      if (parts.some((x) => norm(x).includes(k) && Math.min(norm(x).length, k.length) >= KEY_MIN)) return;
      // ...and a fragment that swallows an earlier one makes the earlier one redundant.
      for (let i = parts.length - 1; i >= 0; i--) {
        if (k.includes(norm(parts[i])) && Math.min(k.length, norm(parts[i]).length) >= KEY_MIN) parts.splice(i, 1);
      }
      parts.push(part);
    };

    for (const raw of addr.split(/[,\n]/)) {
      const part = raw.replace(/^[\s;:,-]+|[\s;:,-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
      if (!part || isCoveredBy(part)) continue;
      addPart(part);
    }

    const pc = (postcode || '').trim();
    if (pc && !isCoveredBy(pc) && !parts.some((x) => norm(x).includes(norm(pc)) && Math.min(norm(x).length, norm(pc).length) >= KEY_MIN)) {
      parts.push(pc);
    }
    if (parts.length) lines.push(parts.join(', '));
  }

  return lines;
}

/**
 * Site name and address only (for outputs with a separate "Customer:" row),
 * in the same order and with the same no-repeats rule.
 */
export function siteDetailsText(input: SiteDetailInput, separator = ', '): string {
  return siteDetailLines({ ...input, customer: null }).join(separator);
}
