/**
 * useOfflineMutation — Run a Supabase mutation with graceful offline fallback.
 *
 * Try the network call. If it succeeds, return its result. If it fails because
 * the device is offline (NOT because of RLS / 4xx / validation), persist the
 * intent into the sync queue and return { queued: true } so the caller can
 * show "Saved locally — will sync when back online".
 *
 * Scope intentionally narrow: UPDATE and DELETE only. Inserts must run online.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enqueue, isNetworkError, type QueuedOp } from "@/lib/syncQueue";

export type OfflineMutationResult<T = unknown> =
  | { ok: true; queued: false; data: T | null }
  | { ok: true; queued: true; data: null }
  | { ok: false; queued: false; error: unknown };

async function runOp(op: QueuedOp) {
  if (op.kind === "update") {
    let query: any = (supabase as any).from(op.table).update(op.values);
    for (const [k, v] of Object.entries(op.match)) query = query.eq(k, v);
    return await query;
  }
  // delete
  let query: any = (supabase as any).from(op.table).delete();
  for (const [k, v] of Object.entries(op.match)) query = query.eq(k, v);
  return await query;
}

export function useOfflineMutation() {
  const run = useCallback(async <T = unknown>(
    op: QueuedOp,
    label?: string,
  ): Promise<OfflineMutationResult<T>> => {
    // If clearly offline, skip the network attempt entirely and queue
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await enqueue(op, label);
      toast.info("Saved locally — will sync when back online");
      return { ok: true, queued: true, data: null };
    }
    try {
      const res: any = await runOp(op);
      if (res?.error) {
        if (isNetworkError(res.error)) {
          await enqueue(op, label);
          toast.info("Saved locally — will sync when back online");
          return { ok: true, queued: true, data: null };
        }
        return { ok: false, queued: false, error: res.error };
      }
      return { ok: true, queued: false, data: (res?.data ?? null) as T | null };
    } catch (e) {
      if (isNetworkError(e)) {
        await enqueue(op, label);
        toast.info("Saved locally — will sync when back online");
        return { ok: true, queued: true, data: null };
      }
      return { ok: false, queued: false, error: e };
    }
  }, []);

  return { run };
}
