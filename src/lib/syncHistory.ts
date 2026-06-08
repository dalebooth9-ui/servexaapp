/**
 * syncHistory — small ring buffer of recently synced items, persisted to
 * localStorage so the Sync Status page can show "recently synced".
 */
const KEY = "servexa-sync-history";
const MAX = 30;

export type SyncHistoryEntry = {
  id: string;
  label: string;
  kind: "update" | "delete" | "photo";
  syncedAt: number;
};

type Listener = (entries: SyncHistoryEntry[]) => void;
const listeners = new Set<Listener>();

export function listHistory(): SyncHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SyncHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function lastSuccessfulSync(): number | null {
  const h = listHistory();
  return h.length ? h[0].syncedAt : null;
}

export function recordSync(entry: Omit<SyncHistoryEntry, "syncedAt">) {
  const list = listHistory();
  list.unshift({ ...entry, syncedAt: Date.now() });
  while (list.length > MAX) list.pop();
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  for (const fn of listeners) {
    try { fn(list); } catch { /* ignore */ }
  }
}

export function subscribeHistory(fn: Listener): () => void {
  listeners.add(fn);
  fn(listHistory());
  return () => { listeners.delete(fn); };
}
