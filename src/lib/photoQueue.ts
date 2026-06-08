/**
 * photoQueue — IndexedDB queue for engineer photos taken offline.
 * Stores raw Blobs and uploads them to Supabase Storage when back online.
 */
import { get, set, del, keys, createStore } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkError } from "@/lib/syncQueue";

const store = createStore("servexa-photo-queue", "items");
const dlqStore = createStore("servexa-photo-queue-dlq", "items");

export type PhotoQueueItem = {
  id: string;
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  label?: string;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
  progress?: number; // 0..1
  status: "pending" | "uploading" | "failed";
};

type Listener = (items: PhotoQueueItem[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<PhotoQueueItem[]> {
  try {
    const ks = await keys(store);
    const items: PhotoQueueItem[] = [];
    for (const k of ks) {
      const v = await get<PhotoQueueItem>(k as string, store);
      if (v) items.push(v);
    }
    return items.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  } catch {
    return [];
  }
}

async function notify() {
  const items = await readAll();
  for (const fn of listeners) {
    try { fn(items); } catch { /* ignore */ }
  }
}

export function subscribePhotoQueue(fn: Listener): () => void {
  listeners.add(fn);
  void readAll().then(fn);
  return () => { listeners.delete(fn); };
}

export async function listPhotoQueue(): Promise<PhotoQueueItem[]> {
  return readAll();
}

export async function listPhotoDlq(): Promise<PhotoQueueItem[]> {
  try {
    const ks = await keys(dlqStore);
    const out: PhotoQueueItem[] = [];
    for (const k of ks) {
      const v = await get<PhotoQueueItem>(k as string, dlqStore);
      if (v) out.push(v);
    }
    return out;
  } catch { return []; }
}

export async function getPhoto(id: string): Promise<PhotoQueueItem | undefined> {
  try { return await get<PhotoQueueItem>(id, store); } catch { return undefined; }
}

export async function enqueuePhoto(input: {
  bucket: string;
  path: string;
  blob: Blob;
  contentType?: string;
  label?: string;
}): Promise<PhotoQueueItem> {
  const item: PhotoQueueItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    bucket: input.bucket,
    path: input.path,
    blob: input.blob,
    contentType: input.contentType || input.blob.type || "image/jpeg",
    label: input.label,
    enqueuedAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  await set(item.id, item, store);
  void notify();
  // Ask the SW to fire background sync if supported
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg: any = await navigator.serviceWorker.ready;
      if (reg && "sync" in reg) await reg.sync.register("servexa-sync-queue");
    }
  } catch { /* ignore */ }
  return item;
}

export async function discardPhoto(id: string) {
  try { await del(id, store); } catch { /* ignore */ }
  void notify();
}

async function moveToDlq(item: PhotoQueueItem) {
  try { await set(item.id, item, dlqStore); } catch { /* ignore */ }
  try { await del(item.id, store); } catch { /* ignore */ }
  void notify();
}

let processing = false;

export type PhotoProcessResult = { uploaded: number; failed: number; remaining: number };

export async function processPhotoQueue(): Promise<PhotoProcessResult> {
  if (processing) return { uploaded: 0, failed: 0, remaining: (await readAll()).length };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { uploaded: 0, failed: 0, remaining: (await readAll()).length };
  }
  processing = true;
  let uploaded = 0;
  let failed = 0;
  try {
    const items = await readAll();
    for (const item of items) {
      item.status = "uploading";
      item.progress = 0;
      await set(item.id, item, store);
      void notify();
      try {
        const res = await supabase.storage.from(item.bucket).upload(item.path, item.blob, {
          contentType: item.contentType,
          upsert: true,
        });
        if (res.error) {
          if (isNetworkError(res.error)) {
            item.status = "pending";
            await set(item.id, item, store);
            break;
          }
          item.attempts += 1;
          item.lastError = res.error.message;
          item.status = "failed";
          if (item.attempts >= 3) {
            await moveToDlq(item);
            failed++;
          } else {
            await set(item.id, item, store);
          }
        } else {
          await del(item.id, store);
          uploaded++;
        }
      } catch (e: any) {
        if (isNetworkError(e)) {
          item.status = "pending";
          await set(item.id, item, store);
          break;
        }
        item.attempts += 1;
        item.lastError = String(e?.message || e);
        item.status = "failed";
        if (item.attempts >= 3) {
          await moveToDlq(item);
          failed++;
        } else {
          await set(item.id, item, store);
        }
      }
      void notify();
    }
  } finally {
    processing = false;
  }
  return { uploaded, failed, remaining: (await readAll()).length };
}
