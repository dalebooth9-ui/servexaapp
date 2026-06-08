/**
 * syncQueue — Durable IndexedDB queue for Supabase mutations that fail because
 * the device is offline. Designed for engineer-side UPDATE/DELETE on rows that
 * already exist on the server.
 *
 * What this does NOT do (by design — see the offline architecture memory):
 * - Does not queue INSERTs. New rows must succeed online so the rest of the
 *   app gets a real server ID; queued INSERTs cause FK errors and ID-remap pain.
 * - Does not queue edge function / storage / payment calls (non-idempotent).
 * - Does not retry RLS / 4xx errors. Those mean the request is wrong, not
 *   that the network is down; silently retrying would hide the bug forever.
 *
 * Items are processed in FIFO order on `online` events and on app start.
 * Each item retries up to 3 times with exponential backoff (2s, 4s, 8s).
 * After 3 failures, the item is moved to a dead-letter list for manual review.
 */
import { get, set, del, keys, createStore } from "idb-keyval";

const store = createStore("servexa-sync-queue", "items");
const dlqStore = createStore("servexa-sync-queue-dlq", "items");

export type QueuedOp =
  | { kind: "update"; table: string; match: Record<string, unknown>; values: Record<string, unknown>; baseUpdatedAt?: string; conflictKey?: string; force?: boolean }
  | { kind: "delete"; table: string; match: Record<string, unknown> };

export type QueueItem = {
  id: string;
  op: QueuedOp;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
  label?: string; // human-friendly description for indicators/toasts
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notify(count: number) {
  for (const fn of listeners) {
    try { fn(count); } catch { /* ignore */ }
  }
}

export function subscribeQueueSize(fn: Listener): () => void {
  listeners.add(fn);
  void getQueueSize().then(fn);
  return () => { listeners.delete(fn); };
}

export async function getQueueSize(): Promise<number> {
  try {
    const ks = await keys(store);
    return ks.length;
  } catch {
    return 0;
  }
}

export async function listQueue(): Promise<QueueItem[]> {
  try {
    const ks = await keys(store);
    const items: QueueItem[] = [];
    for (const k of ks) {
      const v = await get<QueueItem>(k as string, store);
      if (v) items.push(v);
    }
    return items.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  } catch {
    return [];
  }
}

export async function listDeadLetter(): Promise<QueueItem[]> {
  try {
    const ks = await keys(dlqStore);
    const items: QueueItem[] = [];
    for (const k of ks) {
      const v = await get<QueueItem>(k as string, dlqStore);
      if (v) items.push(v);
    }
    return items;
  } catch {
    return [];
  }
}

/** Detect true network/offline errors. Anything else (RLS, 4xx, validation) is NOT queued. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!err) return false;
  const anyErr = err as any;
  // fetch failures
  if (anyErr instanceof TypeError && /fetch|network|load failed/i.test(anyErr.message || "")) return true;
  const msg = String(anyErr?.message || anyErr).toLowerCase();
  if (/failed to fetch|networkerror|load failed|timeout|err_internet|err_network|err_connection|offline/.test(msg)) return true;
  // PostgREST returns HTTP status; absence of one suggests transport failure
  if (anyErr?.code === "PGRST000" || anyErr?.code === "ECONNREFUSED" || anyErr?.code === "ETIMEDOUT") return true;
  return false;
}

export async function enqueue(op: QueuedOp, label?: string): Promise<QueueItem> {
  const item: QueueItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    op,
    enqueuedAt: Date.now(),
    attempts: 0,
    label,
  };
  await set(item.id, item, store);
  notify(await getQueueSize());
  return item;
}

async function remove(id: string) {
  try { await del(id, store); } catch { /* ignore */ }
  notify(await getQueueSize());
}

async function moveToDlq(item: QueueItem) {
  try { await set(item.id, item, dlqStore); } catch { /* ignore */ }
  await remove(item.id);
}

type Executor = (op: QueuedOp) => Promise<{ error: unknown } | null>;

let processing = false;
let executor: Executor | null = null;

/** Register the function that actually runs a queued op against Supabase. */
export function registerExecutor(fn: Executor) {
  executor = fn;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ProcessResult = { processed: number; failed: number; remaining: number };

export async function processQueue(opts?: {
  onProgress?: (done: number, total: number) => void;
}): Promise<ProcessResult> {
  if (processing) return { processed: 0, failed: 0, remaining: await getQueueSize() };
  if (!executor) return { processed: 0, failed: 0, remaining: await getQueueSize() };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { processed: 0, failed: 0, remaining: await getQueueSize() };
  }

  processing = true;
  let processed = 0;
  let failed = 0;
  try {
    const items = await listQueue();
    const total = items.length;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Backoff per item: 2^attempt seconds
      if (item.attempts > 0) await sleep(Math.min(8000, 2000 * 2 ** (item.attempts - 1)));
      let result: { error: unknown } | null = null;
      try {
        result = await executor(item.op);
      } catch (e) {
        result = { error: e };
      }
      if (!result || !result.error) {
        await remove(item.id);
        processed++;
      } else if (isNetworkError(result.error)) {
        // Still offline mid-drain — stop, keep item for next attempt
        break;
      } else {
        // Server-side failure (RLS/validation). Count attempt; DLQ after 3.
        item.attempts += 1;
        item.lastError = String((result.error as any)?.message ?? result.error);
        if (item.attempts >= 3) {
          await moveToDlq(item);
          failed++;
        } else {
          await set(item.id, item, store);
        }
      }
      opts?.onProgress?.(i + 1, total);
    }
  } finally {
    processing = false;
  }
  return { processed, failed, remaining: await getQueueSize() };
}

/** Permanently discard an item (used by Pending Sync UI). */
export async function discardItem(id: string) {
  await remove(id);
}

/** Discard a dead-lettered item. */
export async function discardDeadLetter(id: string) {
  try { await del(id, dlqStore); } catch { /* ignore */ }
}
