// Van QR clocking: shared helpers, offline scan queue and timesheet maths.
// All writes go through the clock_* RPCs; the engineer is always the logged-in user.
import { supabase } from "@/integrations/supabase/client";

export type ClockAction = { id: string; kind: "start" | "finish" | "break_start" | "break_end"; at: string; vanId?: string | null; lat?: number | null; lng?: number | null; source: string };
const KEY = "pending_clock_scans";

export const VAN_QR_BASE = "https://servexaapp.com/v/";
export const vanQrUrl = (token: string) => `${VAN_QR_BASE}${token}`;

export const FLAG_LABELS: Record<string, string> = {
  far_from_usual_start: "Far from usual start",
  very_short_day: "Start and finish very close",
  no_location: "No location",
};

export function readQueue(): ClockAction[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function writeQueue(q: ClockAction[]) { localStorage.setItem(KEY, JSON.stringify(q)); }
export function enqueue(a: ClockAction) { writeQueue([...readQueue().filter(x => x.id !== a.id), a]); }

export function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

/** Errors the server raised on purpose (not network) — the scan must not be retried. */
const isServerRejection = (e: any) => !!e && (e.code === "P0001" || /^[A-Z0-9]{5}$/.test(e.code || "")) && !/fetch|network/i.test(e.message || "");

export async function sendAction(a: ClockAction): Promise<any> {
  const lat = a.lat ?? null, lng = a.lng ?? null;
  const res = a.kind === "start"
    ? await supabase.rpc("clock_start_day", { _van_id: a.vanId ?? null, _at: a.at, _lat: lat, _lng: lng, _client_id: a.id, _source: a.source } as any)
    : a.kind === "finish"
      ? await supabase.rpc("clock_finish_day", { _at: a.at, _lat: lat, _lng: lng, _client_id: a.id, _source: a.source } as any)
      : await supabase.rpc("clock_break", { _action: a.kind === "break_start" ? "start" : "end", _at: a.at } as any);
  if (res.error) throw res.error;
  return res.data;
}

/** Send now; if there is no signal, keep it on the phone with its true time. */
export async function submitOrQueue(a: ClockAction): Promise<{ queued: boolean; data?: any }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) { enqueue(a); return { queued: true }; }
  try { return { queued: false, data: await sendAction(a) }; }
  catch (e: any) {
    if (isServerRejection(e)) throw e;
    enqueue(a); return { queued: true };
  }
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing) return 0; flushing = true; let sent = 0;
  try {
    for (const a of readQueue().sort((x, y) => x.at.localeCompare(y.at))) {
      try { await sendAction(a); sent++; writeQueue(readQueue().filter(x => x.id !== a.id)); }
      catch (e: any) {
        if (isServerRejection(e)) { writeQueue(readQueue().filter(x => x.id !== a.id)); console.warn("clock scan rejected", e?.message); }
        else break;
      }
    }
  } finally { flushing = false; }
  return sent;
}

export const newActionId = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ---------- timesheet maths ----------
export type DayEntry = { clock_in_at: string; clock_out_at: string | null; break_minutes: number; total_minutes: number | null };

/** Worked minutes for a day: finish − start − break (recorded break, else the company's standard break). Null when no finish. */
export function workedMinutes(e: DayEntry, standardBreak = 0): number | null {
  if (!e.clock_out_at) return null;
  const gross = Math.max(0, Math.round((new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 60000));
  const brk = e.break_minutes > 0 ? e.break_minutes : (standardBreak > 0 && gross > standardBreak ? standardBreak : 0);
  return Math.max(0, gross - brk);
}
export const breakUsed = (e: DayEntry, standardBreak = 0) => {
  if (e.break_minutes > 0) return e.break_minutes;
  const w = workedMinutes(e, 0);
  return w != null && standardBreak > 0 && w > standardBreak ? standardBreak : 0;
};
export const fmtHM = (m: number | null | undefined) => m == null ? "—" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
export const hoursDecimal = (m: number) => (Math.round((m / 60) * 100) / 100).toFixed(2);

const londonTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const londonDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
export { londonTime };

const csvCell = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
/** Wages CSV: one row per day, plus the employee's week total on each row. Hours only — never pay. */
export function timesheetCsv(rows: { employee: string; entry: DayEntry }[], standardBreak = 0): string {
  const weekTotals = new Map<string, number>();
  for (const r of rows) weekTotals.set(r.employee, (weekTotals.get(r.employee) || 0) + (workedMinutes(r.entry, standardBreak) || 0));
  const out = ["Employee,Date,Start,Finish,Break (mins),Total hours,Week total hours"];
  for (const r of rows) {
    const d = londonDate(r.entry.clock_in_at).split("-").reverse().join("/");
    const w = workedMinutes(r.entry, standardBreak);
    out.push([csvCell(r.employee), d, londonTime(r.entry.clock_in_at), r.entry.clock_out_at ? londonTime(r.entry.clock_out_at) : "", String(breakUsed(r.entry, standardBreak)), w == null ? "" : hoursDecimal(w), hoursDecimal(weekTotals.get(r.employee) || 0)].join(","));
  }
  return out.join("\n");
}
