/** Time and access flags stored on each job, worded the same everywhere they print. */
export interface JobFlags {
  time_window?: string | null;
  call_ahead_minutes?: number | null;
  access_contact_name?: string | null;
  access_contact_phone?: string | null;
  access_notes?: string | null;
  customer_po?: string | null;
}

export function callAheadLabel(min?: number | null): string {
  if (!min || min <= 0) return "";
  if (min % 60 === 0) { const h = min / 60; return `Call ${h} hour${h > 1 ? "s" : ""} before`; }
  return `Call ${min} min before`;
}

/** Short lines in importance order: time, call ahead, contact, access notes, PO. */
export function jobFlagLines(f: JobFlags, opts: { po?: boolean } = {}): string[] {
  const out: string[] = [];
  if (f.time_window?.trim()) out.push(`Time: ${f.time_window.trim()}`);
  const ca = callAheadLabel(f.call_ahead_minutes); if (ca) out.push(ca);
  const c = [f.access_contact_name, f.access_contact_phone].map((x) => x?.trim()).filter(Boolean).join(" ");
  if (c) out.push(`Contact: ${c}`);
  if (f.access_notes?.trim()) out.push(`Access: ${f.access_notes.trim()}`);
  if (opts.po !== false && f.customer_po?.trim()) out.push(`PO ${f.customer_po.trim()}`);
  return out;
}

export const hasJobFlags = (f: JobFlags) => jobFlagLines(f, { po: false }).length > 0;
