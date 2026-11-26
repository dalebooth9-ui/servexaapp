/** Month-only (provisional) bookings and the Planner look-ahead buckets. */
export type LookAheadKind = "provisional" | "booked" | "due";
export interface LookAheadItem {
  id: string;
  kind: LookAheadKind;
  month: string; // yyyy-MM
  title: string;
  customerId: string | null;
  customerName: string;
  jobType: string;
  jobId?: string;
  date?: string;
  link?: string;
}

export function monthKey(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "Provisional - March 2027" */
export function provisionalLabel(targetMonth: string): string {
  const [y, m] = targetMonth.split("-").map(Number);
  const name = ["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1];
  return `Provisional - ${name} ${y}`;
}

/** First day of a yyyy-MM month, as stored in jobs.target_month. */
export function targetMonthValue(ym: string): string { return `${ym.slice(0, 7)}-01`; }

export function lookAheadMonths(start: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(monthKey(new Date(start.getFullYear(), start.getMonth() + i, 1)));
  return out;
}

/** A job is provisional only while it has a target month and no planner day. */
export function isProvisional(job: { target_month?: string | null }, hasDay: boolean): boolean {
  return !!job.target_month && !hasDay;
}

export function bucketLookAhead(items: LookAheadItem[], months: string[], filter: { customerId?: string; jobType?: string } = {}) {
  const buckets = new Map<string, LookAheadItem[]>(months.map((m) => [m, []]));
  for (const it of items) {
    if (filter.customerId && filter.customerId !== "all" && it.customerId !== filter.customerId) continue;
    if (filter.jobType && filter.jobType !== "all" && it.jobType !== filter.jobType) continue;
    buckets.get(it.month)?.push(it);
  }
  return months.map((m) => ({ month: m, items: buckets.get(m)!, count: buckets.get(m)!.length }));
}
