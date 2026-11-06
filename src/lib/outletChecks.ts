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
  const m = s.match(/^https?:\/\/(?:www\.)?servexaapp\.com\/r\/([A-Za-z0-9]{4,12})\/?$/i);
  if (m) return m[1].toUpperCase();
  return null;
}

/** Outlets that are proven on this visit (scanned or manually confirmed). */
export function countChecked(total: number, checks: OutletChecks) {
  let n = 0;
  for (let i = 1; i <= total; i++) {
    const c = checks[String(i)];
    if (c && (c.status === "scanned" || c.status === "manual")) n++;
  }
  return n;
}

/** Outlet numbers with no scan/manual confirmation and no saved missing reason. */
export function unresolvedOutlets(total: number, checks: OutletChecks): number[] {
  const out: number[] = [];
  for (let i = 1; i <= total; i++) if (!checks[String(i)]) out.push(i);
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

export function outletSummaryLine(total: number, checks: OutletChecks) {
  const scanned = Object.entries(checks).filter(([k, c]) => Number(k) <= total && c.status === "scanned").length;
  const manual = Object.entries(checks).filter(([k, c]) => Number(k) <= total && c.status === "manual").length;
  return `${scanned} of ${total} outlets scanned${manual ? `, ${manual} manually confirmed` : ""}`;
}
