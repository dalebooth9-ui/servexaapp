/**
 * useAutoSave — Persists form state for offline resilience.
 *
 * Writes synchronously to localStorage (fast first-render restore) and
 * mirrors to IndexedDB via offlineFormStorage (durable, larger quota).
 * Engineers can lose signal mid-form and reload without losing data.
 *
 * Usage:
 *   const [form, setForm, clearDraft] = useAutoSave<MyForm>("customer-edit-123", defaults);
 *   // after successful save:
 *   clearDraft();
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveFormDraft,
  loadFormDraftSync,
  loadFormDraft,
  clearFormDraft,
  clearAllFormDrafts,
} from "@/lib/offlineFormStorage";

export function useAutoSave<T>(
  key: string,
  defaultValue: T,
  debounceMs = 500
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  // Initialise synchronously from localStorage mirror (instant restore)
  const [value, setValue] = useState<T>(() => {
    const draft = loadFormDraftSync<Partial<T>>(key);
    return draft ? { ...defaultValue, ...draft } : defaultValue;
  });

  // Also check IndexedDB on mount in case the mirror was cleared but IDB has data
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      const sync = loadFormDraftSync<Partial<T>>(key);
      if (sync) return; // sync mirror already used
      const fromIdb = await loadFormDraft<Partial<T>>(key);
      if (fromIdb) {
        setValue((curr) => ({ ...defaultValue, ...curr, ...fromIdb }));
      }
    })();
    // intentionally only on mount per key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced persist
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveFormDraft(key, value);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, key, debounceMs]);

  const clear = useCallback(() => {
    void clearFormDraft(key);
  }, [key]);

  return [value, setValue, clear];
}

/** Clear all drafts (e.g. on logout). */
export function clearAllAutoSaves() {
  void clearAllFormDrafts();
}

/** Sync check for an existing draft (uses the localStorage mirror). */
export function hasAutoSaveDraft(key: string): boolean {
  return loadFormDraftSync(key) !== null;
}
