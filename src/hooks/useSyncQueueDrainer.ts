/**
 * useSyncQueueDrainer — wires the syncQueue executor to real Supabase calls,
 * then drains the queue on mount and whenever the browser regains connectivity.
 * Call once near the top of the authenticated app tree (e.g. from useOfflineSync).
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

let installed = false;

async function executor(op: QueuedOp) {
  let query: any;
  if (op.kind === "update") {
    query = (supabase as any).from(op.table).update(op.values);
  } else {
    query = (supabase as any).from(op.table).delete();
  }
  for (const [k, v] of Object.entries(op.match)) query = query.eq(k, v);
  const res: any = await query;
  return res?.error ? { error: res.error } : null;
}

async function drain() {
  const total = await getQueueSize();
  if (!total) return;
  toast.message(`Syncing ${total} item${total === 1 ? "" : "s"}…`);
  const result = await processQueue();
  if (result.processed > 0 && result.remaining === 0 && result.failed === 0) {
    toast.success("All data synced");
  } else if (result.failed > 0) {
    toast.error(`${result.failed} item${result.failed === 1 ? "" : "s"} failed to sync — review pending sync`);
  } else if (result.remaining > 0) {
    toast.warning(`${result.remaining} item${result.remaining === 1 ? "" : "s"} still pending`);
  }
}

export function useSyncQueueDrainer() {
  useEffect(() => {
    if (!installed) {
      installed = true;
      registerExecutor(executor);
    }
    // Drain once on mount (covers app start after a previous offline session)
    void drain();
    const onOnline = () => { void drain(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
}
