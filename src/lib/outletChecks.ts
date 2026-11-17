/** Outlet (landing valve) checks stored in a riser report's answers as `_outlet_checks`.
 *  Saved with the report itself, so it autosaves/syncs with the existing draft flow. */
export type OutletStatus = "scanned" | "manual" | "missing";
export type OutletCheck = {
  status: OutletStatus;
  at: string;          // ISO time recorded
  by?: string | null;  // user id
  by_name?: string | null;
  tag?: string | null; // outlet sticker number when scanned
  reason?: string | null;
};
export type OutletChecks = Record<string, OutletCheck>;

export const OUTLET_REASONS = [
  "Outlet blocked or inaccessible",
  "Sticker missing or damaged",
  "Outlet doesn't exist",
] as const;

export const STATUS_LABEL: Record<OutletStatus, string> = {
  scanned: "Scanned",
  manual: "Manually confirmed",
  missing: "Not checked",
};

export function readOutletChecks(answers: any): OutletChecks {
  const v = answers?._outlet_checks;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as OutletChecks) : {};
}

/** Pull the sticker number out of a scanned QR (servexa /r/<tag> URL or bare tag). */
export function parseStickerTag(text: string): string | null {
  const s = (text || "").trim();
  const m = s.match(/^https?:\/\/(?:www\.)?servexaapp\.com\/r\/([A-Za-z0-9]{4,12}(?:-[1-9][0-9]*)?)\/?$/i);
  if (m) return m[1].toUpperCase();
  return null;
}

/** Outlets that are proven on this visit (scanned or manually confirmed). */
export function outletNumbers(total: number | number[]) {
  return Array.isArray(total) ? [...total].sort((a,b)=>a-b) : Array.from({length:total},(_,i)=>i+1);
}

export function countChecked(total: number | number[], checks: OutletChecks) {
  let n = 0;
  for (const i of outletNumbers(total)) {
    const c = checks[String(i)];
    if (c && (c.status === "scanned" || c.status === "manual")) n++;
  }
  return n;
}

/** Outlet numbers with no scan/manual confirmation and no saved missing reason. */
export function unresolvedOutlets(total: number | number[], checks: OutletChecks): number[] {
  const out: number[] = [];
  for (const i of outletNumbers(total)) if (!checks[String(i)]) out.push(i);
  return out;
}

export type ScanVerdict =
  | { kind: "ok"; outlet: number }
  | { kind: "already"; outlet: number }
  | { kind: "other_riser" }
  | { kind: "not_outlet" };

/** Decide what a scanned code means for this riser. `riserTags` maps tag → outlet number. */
export function judgeScan(text: string, riserTags: Record<string, number>, checks: OutletChecks, orgOutletTags?: Set<string>): ScanVerdict {
  const tag = parseStickerTag(text);
  if (!tag) return { kind: "not_outlet" };
  const outlet = riserTags[tag];
  if (outlet) {
    return checks[String(outlet)]?.status === "scanned" ? { kind: "already", outlet } : { kind: "ok", outlet };
  }
  if (orgOutletTags && !orgOutletTags.has(tag)) return { kind: "not_outlet" };
  return { kind: "other_riser" };
}

export function outletSummaryLine(total: number | number[], checks: OutletChecks) {
  const numbers = outletNumbers(total);
  const scanned = numbers.filter(n => checks[String(n)]?.status === 'scanned').length;
  const manual = numbers.filter(n => checks[String(n)]?.status === 'manual').length;
  return `${scanned} of ${numbers.length} outlets scanned${manual ? `, ${manual} manually confirmed` : ""}`;
}

/** Key stored in `__omitted_sections__` when the Outlet checks table is left out of the report. */
export const OUTLET_CHECKS_SECTION = "Outlet checks";
export const STICKER_MISSING_REASON = "Sticker missing or damaged";

export function isOutletChecksOmitted(data: Record<string, any> | null | undefined): boolean {
  const o = data?.__omitted_sections__;
  return Array.isArray(o) && o.includes(OUTLET_CHECKS_SECTION);
}

/** True when every listed outlet was confirmed by hand because its sticker was missing or damaged. */
export function allConfirmedStickerMissing(numbers: number[], checks: OutletChecks): boolean {
  return numbers.length > 0 && numbers.every((n) => {
    const c = checks[String(n)];
    return c?.status === "manual" && c.reason === STICKER_MISSING_REASON;
  });
}

/** Apply a manual confirmation to several outlets at once, keeping per-outlet time, name and tag. */
export function bulkConfirm(
  checks: OutletChecks, numbers: number[], reason: string,
  who: { by?: string | null; by_name?: string | null }, tagFor: (n: number) => string | undefined, at = new Date().toISOString(),
): OutletChecks {
  const next: OutletChecks = { ...checks };
  for (const n of numbers) {
    if (next[String(n)]?.status === "scanned") continue; // never overwrite a real scan
    next[String(n)] = { status: "manual", at, by: who.by, by_name: who.by_name, tag: tagFor(n), reason };
  }
  return next;
}
