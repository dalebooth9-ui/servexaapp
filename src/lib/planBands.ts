// Central plan band ladder. Update this file to change pricing tiers or add
// new bands — the pricing page, checkout function, and in-app upgrade banner
// all read from this single source of truth.
//
// Prices are in whole pounds GBP (monthly). Customer portal users are ALWAYS
// unlimited and free and are excluded from user-count banding (they are
// counted separately, via `customer_portal_users`, not `profiles`).

export type PlanBand = {
  code: string;
  label: string;
  /** Inclusive minimum staff/engineer/admin users. */
  minUsers: number;
  /** Inclusive maximum. null = unlimited (custom / contact us). */
  maxUsers: number | null;
  /** Monthly price in whole GBP. null = "Contact us". */
  monthlyPriceGbp: number | null;
  /** Whether this band is purchasable via self-serve Stripe Checkout right now. */
  selfServe: boolean;
  /** Short one-liner shown under the price on the pricing page. */
  tagline: string;
};

export const PLAN_BANDS: PlanBand[] = [
  { code: "band_1_10",   label: "Up to 10 users",   minUsers: 1,  maxUsers: 10,   monthlyPriceGbp: 199, selfServe: true,  tagline: "Perfect for a growing service team" },
  { code: "band_11_25",  label: "11–25 users",      minUsers: 11, maxUsers: 25,   monthlyPriceGbp: 349, selfServe: false, tagline: "Multi-branch or larger crews" },
  { code: "band_26_50",  label: "26–50 users",      minUsers: 26, maxUsers: 50,   monthlyPriceGbp: 599, selfServe: false, tagline: "Established regional operators" },
  { code: "band_50_plus", label: "50+ users",       minUsers: 51, maxUsers: null, monthlyPriceGbp: null, selfServe: false, tagline: "Enterprise · white-label available" },
];

export const LAUNCH_BAND = PLAN_BANDS[0];

export function bandForStaffCount(count: number): PlanBand {
  // Zero / negative / non-finite counts always map to the entry band — a
  // missing or failed count must NEVER be interpreted as "needs enterprise".
  if (!Number.isFinite(count) || count <= 0) return PLAN_BANDS[0];
  for (const b of PLAN_BANDS) {
    if (count >= b.minUsers && (b.maxUsers === null || count <= b.maxUsers)) return b;
  }
  // Above every explicit ceiling → top (unlimited) band.
  return PLAN_BANDS[PLAN_BANDS.length - 1];
}

export function nextBandAfter(current: PlanBand): PlanBand | null {
  const idx = PLAN_BANDS.findIndex((b) => b.code === current.code);
  return idx >= 0 && idx < PLAN_BANDS.length - 1 ? PLAN_BANDS[idx + 1] : null;
}

/** Formats a whole-pound GBP monthly price with £ symbol. */
export function formatMonthly(gbp: number | null): string {
  return gbp === null ? "Contact us" : `£${gbp}/mo`;
}

/** Formats a pence promo price to whole-pound display, e.g. 9900 → "£99". */
export function penceToPoundsDisplay(pence: number): string {
  const pounds = pence / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}
