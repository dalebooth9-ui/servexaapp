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
    }: {
      key: string;
      label: string;
      onConfirm: () => Promise<void> | void;
      onUndo: () => void;
      delay?: number; // kept for API compat, no longer used
    }) => {
      // Delete immediately so navigating away doesn't resurrect the item
      (async () => {
        await onConfirm();
      })();

      toast({
        title: label,
        duration: 8000,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => onUndo()}
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
        duration: 8000,
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
