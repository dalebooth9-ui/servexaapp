/**
 * useSyncQueueDrainer — Drains the IndexedDB sync queue + photo queue when
 * the browser regains connectivity. Detects optimistic-locking conflicts on
 * UPDATEs (server `updated_at` advanced past our snapshot) and parks them in
 * the conflict bus for the engineer to resolve.
 */
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  registerExecutor,
  processQueue,
  getQueueSize,
  type QueuedOp,
} from "@/lib/syncQueue";
import { processPhotoQueue, listPhotoQueue } from "@/lib/photoQueue";
import { pushConflict } from "@/lib/conflictBus";
import { recordSync } from "@/lib/syncHistory";

let installed = false;

async function executor(op: QueuedOp) {
  if (op.kind === "update") {
    const conflictKey = op.conflictKey || "updated_at";
    // Optimistic-locking check
    if (op.baseUpdatedAt && !op.force) {
      try {
        let probe: any = (supabase as any).from(op.table).select(`${conflictKey}, *`);
        for (const [k, v] of Object.entries(op.match)) probe = probe.eq(k, v);
        const { data: serverRow, error: probeErr } = await probe.maybeSingle();
        if (!probeErr && serverRow) {
          const serverTs = serverRow[conflictKey];
          if (serverTs && typeof serverTs === "string" && serverTs > op.baseUpdatedAt) {
            // Conflict — park for engineer to resolve
            await pushConflict({
              item: {
                id: `${Date.now()}-${Math.random()}`,
                op,
                enqueuedAt: Date.now(),
                attempts: 0,
              } as any,
              serverRow,
            });
            // Treat as a "non-fatal" success so the queue removes it
            recordSync({ id: `conflict-${Date.now()}`, label: `Conflict on ${op.table}`, kind: "update" });
            return null;
          }
        }
      } catch {
        // probe failed — fall through and try the write
      }
    }
    let query: any = (supabase as any).from(op.table).update(op.values);
    for (const [k, v] of Object.entries(op.match)) query = query.eq(k, v);
    const res: any = await query;
    if (!res?.error) recordSync({ id: `${op.table}-${Date.now()}`, label: `Updated ${op.table}`, kind: "update" });
    return res?.error ? { error: res.error } : null;
  }
  let query: any = (supabase as any).from(op.table).delete();
  for (const [k, v] of Object.entries(op.match)) query = query.eq(k, v);
  const res: any = await query;
  if (!res?.error) recordSync({ id: `${op.table}-${Date.now()}`, label: `Deleted from ${op.table}`, kind: "delete" });
  return res?.error ? { error: res.error } : null;
}

async function drain() {
  const queueTotal = await getQueueSize();
  const photos = await listPhotoQueue();
  const total = queueTotal + photos.length;
  if (!total) return;

  if (total > 0) toast.message(`Syncing ${total} item${total === 1 ? "" : "s"}…`);

  const photoResult = await processPhotoQueue();
  for (let i = 0; i < photoResult.uploaded; i++) {
    recordSync({ id: `photo-${Date.now()}-${i}`, label: "Photo uploaded", kind: "photo" });
  }
  const queueResult = await processQueue();

  const totalProcessed = queueResult.processed + photoResult.uploaded;
  const totalFailed = queueResult.failed + photoResult.failed;
  const totalRemaining = queueResult.remaining + photoResult.remaining;

  if (totalProcessed > 0 && totalRemaining === 0 && totalFailed === 0) {
    toast.success("All data synced");
  } else if (totalFailed > 0) {
    toast.error(`${totalFailed} item${totalFailed === 1 ? "" : "s"} failed to sync — open Sync Status`);
  } else if (totalRemaining > 0) {
    toast.warning(`${totalRemaining} item${totalRemaining === 1 ? "" : "s"} still pending`);
  }
}

export async function drainNow() {
  await drain();
}

export function useSyncQueueDrainer() {
  useEffect(() => {
    if (!installed) {
      installed = true;
      registerExecutor(executor);
    }
    void drain();

    const onOnline = () => { void drain(); };
    window.addEventListener("online", onOnline);

    const onMessage = (e: MessageEvent) => {
      if ((e.data as any)?.type === "servexa-bg-sync") void drain();
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }

    // Register background sync if supported
    (async () => {
      try {
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          const reg: any = await navigator.serviceWorker.ready;
          if (reg && "sync" in reg) await reg.sync.register("servexa-sync-queue");
        }
      } catch { /* ignore */ }
    })();

    return () => {
      window.removeEventListener("online", onOnline);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
    };
  }, []);
}
