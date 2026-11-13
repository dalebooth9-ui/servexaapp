/**
 * Clears everything Servexa keeps on the device so one user's data is never
 * shown to the next person who signs in on the same phone.
 */
import { keys, createStore, clear } from "idb-keyval";
import { isOldAppCache } from "@/pwa/registerSW";

/** Local stores that hold work not yet on the server. */
export const UNSENT_IDB_STORES: Array<[string, string]> = [
  ["servexa-sync-queue", "items"],
  ["servexa-report-queue", "items"],
  ["servexa-photo-queue", "items"],
  ["servexa-report-photos", "pending"],
  ["servexa-form-drafts", "drafts"],
];
const UNSENT_LS_PREFIXES = ["autosave_", "open_form_"];
export const DEVICE_USER_KEY = "servexa_device_user";

export function isUnsentLocalKey(key: string, value: string | null): boolean {
  if (key.startsWith("autosave_ts_")) return false;
  if (!UNSENT_LS_PREFIXES.some((p) => key.startsWith(p))) return false;
  const v = (value ?? "").trim();
  return v !== "" && v !== "null" && v !== "{}" && v !== "[]";
}

export async function countUnsentWork(): Promise<number> {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (isUnsentLocalKey(k, localStorage.getItem(k))) n++;
    }
  } catch { /* ignore */ }
  for (const [db, st] of UNSENT_IDB_STORES) {
    try { n += (await keys(createStore(db, st))).length; } catch { /* ignore */ }
  }
  return n;
}

/** Wipe stored data. keepAuth leaves the current sign-in token in place. */
export async function wipeDeviceData(opts: { keepAuth?: boolean } = {}): Promise<void> {
  try {
    const keep: Array<[string, string]> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (opts.keepAuth && /^sb-.*-auth-token/.test(k)) keep.push([k, localStorage.getItem(k) ?? ""]);
    }
    localStorage.clear();
    keep.forEach(([k, v]) => localStorage.setItem(k, v));
  } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  // Clear every IndexedDB database the app uses.
  try {
    const dbs = (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
    await Promise.allSettled((dbs as Array<{ name?: string }>).filter((d) => d.name).map((d) => new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase(d.name!); r.onsuccess = r.onerror = r.onblocked = () => res();
    })));
  } catch { /* ignore */ }
  for (const [db, st] of UNSENT_IDB_STORES) { try { await clear(createStore(db, st)); } catch { /* ignore */ } }
  // Cached server data (jobs, photos, documents). Keep only the current app files.
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.allSettled(names.filter((n) => !/-precache-v\d+-/.test(n) || isOldAppCache(n)).map((n) => caches.delete(n)));
    }
  } catch { /* ignore */ }
}
