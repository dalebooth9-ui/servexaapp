/**
 * useOfflineMutation — Run a Supabase mutation with graceful offline fallback.
 *
 * Try the network call. If it succeeds, return its result. If it fails because
 * the device is offline (NOT because of RLS / 4xx / validation), persist the
 * intent into the sync queue and return { queued: true } so the caller can
 * show "Saved locally — will sync when back online".
 *
 * Optimistic-locking: callers may pass `baseUpdatedAt` so the drainer can
 * detect conflicts when it later replays the update.
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
  let query: any = (supabase as any).from(op.table).delete();
  for (const [k, v] of Object.entries(op.match)) query = query.eq(k, v);
  return await query;
}

export function useOfflineMutation() {
  const run = useCallback(async <T = unknown>(
    op: QueuedOp,
    label?: string,
  ): Promise<OfflineMutationResult<T>> => {
    // Try to snapshot updated_at for conflict detection on UPDATEs
    let opToQueue = op;
    if (op.kind === "update" && !op.baseUpdatedAt && !op.force) {
      try {
        const conflictKey = op.conflictKey || "updated_at";
        let probe: any = (supabase as any).from(op.table).select(conflictKey).limit(1);
        for (const [k, v] of Object.entries(op.match)) probe = probe.eq(k, v);
        const { data } = await probe.maybeSingle();
        const ts = data?.[conflictKey];
        if (typeof ts === "string") opToQueue = { ...op, baseUpdatedAt: ts };
      } catch { /* skip — table may have no updated_at */ }
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await enqueue(opToQueue, label);
      toast.info("Saved locally — will sync when back online");
      return { ok: true, queued: true, data: null };
    }
    try {
      const res: any = await runOp(op);
      if (res?.error) {
        if (isNetworkError(res.error)) {
          await enqueue(opToQueue, label);
          toast.info("Saved locally — will sync when back online");
          return { ok: true, queued: true, data: null };
        }
        return { ok: false, queued: false, error: res.error };
      }
      return { ok: true, queued: false, data: (res?.data ?? null) as T | null };
    } catch (e) {
      if (isNetworkError(e)) {
        await enqueue(opToQueue, label);
        toast.info("Saved locally — will sync when back online");
        return { ok: true, queued: true, data: null };
      }
      return { ok: false, queued: false, error: e };
    }
  }, []);

  return { run };
}
