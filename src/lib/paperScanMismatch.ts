// Compare the text the AI extracted from a paper form (customer / site
// name / address) against the record the reviewer picked in the dialog,
// so we can warn when they clearly don't refer to the same place.
// Only surfaces a warning when there's real text on both sides AND the
// overlap is low — a blank extraction never warns.

const normalise = (v: string): string =>
  (v || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOPWORDS = new Set([
  "the","and","of","ltd","limited","co","company","plc","llp",
  "st","street","rd","road","ave","avenue","lane","ln","close","cl",
  "the","a","an","house","building","unit","suite","floor","gb","uk",
]);

function tokens(v: string): string[] {
  return normalise(v)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function overlapRatio(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 1; // can't judge → no warning
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

export type PaperMismatch = {
  kind: "customer" | "site";
  extracted: string;
  selected: string;
};

export function detectPaperMismatches(input: {
  extractedCustomer?: string | null;
  selectedCustomer?: string | null;
  extractedSite?: string | null;
  selectedSiteText?: string | null; // "name, address, postcode"
}): PaperMismatch[] {
  const out: PaperMismatch[] = [];

  const ec = (input.extractedCustomer || "").trim();
  const sc = (input.selectedCustomer || "").trim();
  if (ec && sc && overlapRatio(ec, sc) < 0.34) {
    out.push({ kind: "customer", extracted: ec, selected: sc });
  }

  const es = (input.extractedSite || "").trim();
  const ss = (input.selectedSiteText || "").trim();
  if (es && ss && overlapRatio(es, ss) < 0.34) {
    out.push({ kind: "site", extracted: es, selected: ss });
  }

  return out;
}
