import React, { useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Hook for undo-able actions. Shows a toast with an Undo button.
 * For deletes: optimistically removes from UI, delays DB delete, undo restores.
 * For edits: applies change immediately, undo reverts to previous values.
 */
export function useUndoAction() {
  const { toast, dismiss } = useToast();
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Perform a deletable action with undo support.
   * @param key - Unique key to identify this pending action (e.g. item id)
   * @param label - Description shown in toast (e.g. "Part deleted")
   * @param onConfirm - Actually performs the delete in DB (called after delay)
   * @param onUndo - Restores the item to UI state
   * @param delay - How long to wait before confirming (ms), default 5000
   */
  const deleteWithUndo = useCallback(
    ({
      key,
      label,
      onConfirm,
      onUndo,
      delay = 5000,
    }: {
      key: string;
      label: string;
      onConfirm: () => Promise<void> | void;
      onUndo: () => void;
      delay?: number;
    }) => {
      // Cancel any existing timer for this key
      const existing = pendingTimers.current.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        pendingTimers.current.delete(key);
        await onConfirm();
      }, delay);
      pendingTimers.current.set(key, timer);

      toast({
        title: label,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              const t = pendingTimers.current.get(key);
              if (t) {
                clearTimeout(t);
                pendingTimers.current.delete(key);
              }
              onUndo();
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    },
    [toast],
  );

  /**
   * Perform an edit action with undo support.
   * @param label - Description shown in toast
   * @param onConfirm - Already applied; no delayed action needed
   * @param onUndo - Reverts to previous state in DB + UI
   */
  const editWithUndo = useCallback(
    ({
      label,
      onUndo,
    }: {
      label: string;
      onUndo: () => Promise<void> | void;
    }) => {
      toast({
        title: label,
        action: (
          <ToastAction altText="Undo" onClick={() => onUndo()}>
            Undo
          </ToastAction>
        ),
      });
    },
    [toast],
  );

  return { deleteWithUndo, editWithUndo };
}
