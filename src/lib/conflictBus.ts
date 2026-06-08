/**
 * conflictBus — In-memory + persisted record of sync conflicts.
 * When the drainer detects the server row changed after we queued an update,
 * it pushes a Conflict here so the UI can ask the engineer which version wins.
 */
import { get, set, del, keys, createStore } from "idb-keyval";
import type { QueueItem } from "@/lib/syncQueue";

const store = createStore("servexa-sync-conflicts", "items");

export type Conflict = {
  id: string;
  item: QueueItem;
  serverRow: Record<string, unknown>;
  detectedAt: number;
};

type Listener = (conflicts: Conflict[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<Conflict[]> {
  try {
    const ks = await keys(store);
    const out: Conflict[] = [];
    for (const k of ks) {
      const v = await get<Conflict>(k as string, store);
      if (v) out.push(v);
    }
    return out.sort((a, b) => a.detectedAt - b.detectedAt);
  } catch { return []; }
}

async function notify() {
  const all = await readAll();
  for (const fn of listeners) {
    try { fn(all); } catch { /* ignore */ }
  }
}

export function subscribeConflicts(fn: Listener): () => void {
  listeners.add(fn);
  void readAll().then(fn);
  return () => { listeners.delete(fn); };
}

export async function listConflicts(): Promise<Conflict[]> {
  return readAll();
}

export async function pushConflict(c: Omit<Conflict, "id" | "detectedAt">) {
  const conflict: Conflict = {
    ...c,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    detectedAt: Date.now(),
  };
  await set(conflict.id, conflict, store);
  void notify();
  return conflict;
}

export async function resolveConflict(id: string) {
  try { await del(id, store); } catch { /* ignore */ }
  void notify();
}
