// Shared helpers for matching a free-text "site" string (as returned by the
// OCR paper-form pipeline) against a customer's existing site records.
// Used by both the "Scan paper job sheet" and "Archive scan" review dialogs
// so the prefill behaviour stays consistent.

export type SiteRecord = {
  id: string;
  name: string;
  address?: string | null;
  postcode?: string | null;
};

const UK_POSTCODE_RE = /[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i;

export function extractPostcode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(UK_POSTCODE_RE);
  return m ? m[0].toUpperCase().replace(/\s+/g, " ").trim() : null;
}

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normPostcode(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

export type SiteMatchResult<T extends SiteRecord> = {
  /** 'exact' – one confident match; 'ambiguous' – multiple plausible; 'none' – nothing plausible. */
  confidence: "exact" | "ambiguous" | "none";
  /** Best pick (only trust when confidence === 'exact'). */
  best: T | null;
  /** Ranked candidates (best first). Empty on 'none'. */
  candidates: T[];
};

/**
 * Match extracted site text against a list of customer site records.
 * Order of signals: postcode (strongest) → site name substring → address substring.
 */
export function matchSiteFromHeader<T extends SiteRecord>(
  sites: T[],
  headerSite: string | null | undefined,
): SiteMatchResult<T> {
  const text = (headerSite || "").trim();
  if (!text || sites.length === 0) {
    return { confidence: "none", best: null, candidates: [] };
  }

  const hay = norm(text);
  const pc = normPostcode(extractPostcode(text));

  const scored = sites
    .map((s) => {
      const sName = norm(s.name);
      const sAddr = norm(s.address);
      const sPc = normPostcode(s.postcode);
      let score = 0;
      if (pc && sPc && sPc === pc) score += 10;
      if (sName && (hay.includes(sName) || sName.includes(hay.slice(0, 20)))) score += 4;
      if (sAddr && (hay.includes(sAddr.slice(0, 12)) || sAddr.includes(hay.slice(0, 20)))) score += 2;
      return { site: s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { confidence: "none", best: null, candidates: [] };

  const top = scored[0];
  const second = scored[1];
  const isExact =
    top.score >= 10 || // postcode hit
    (top.score >= 4 && (!second || second.score < top.score));

  if (isExact && (!second || top.score - second.score >= 4)) {
    return {
      confidence: "exact",
      best: top.site,
      candidates: scored.map((x) => x.site),
    };
  }
  return {
    confidence: "ambiguous",
    best: null,
    candidates: scored.map((x) => x.site),
  };
}

/** Split raw OCR site text into name / address / postcode for the "create new site" form. */
export function splitSiteHeaderForCreate(text: string | null | undefined): {
  name: string;
  address: string;
  postcode: string;
} {
  const raw = (text || "").trim();
  if (!raw) return { name: "", address: "", postcode: "" };
  const postcode = extractPostcode(raw) || "";
  // Split on newlines OR commas — first chunk becomes the name.
  const parts = raw.split(/\n|,/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || raw;
  const addressParts = parts.slice(1).filter((p) => !postcode || p.toUpperCase() !== postcode);
  const address = addressParts.join(", ");
  return { name, address, postcode };
}
