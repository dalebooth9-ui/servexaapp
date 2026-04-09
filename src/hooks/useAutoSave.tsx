/**
 * useAutoSave — Persists form state to localStorage with debouncing.
 * Restores saved state on mount and clears it on explicit save/discard.
 *
 * Usage:
 *   const [form, setForm] = useAutoSave<MyForm>("customer-edit-123", defaultValues);
 *   // When user successfully saves:
 *   clearAutoSave();
 */
import { useState, useEffect, useRef, useCallback } from "react";

const PREFIX = "autosave_";

export function useAutoSave<T>(
  key: string,
  defaultValue: T,
  debounceMs = 800
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = PREFIX + key;

  // Initialise from localStorage if available
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults so new fields aren't undefined
        return { ...defaultValue, ...parsed };
      }
    } catch {
      // ignore
    }
    return defaultValue;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced persist to localStorage
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // storage full — best effort
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, storageKey, debounceMs]);

  // Clear saved draft (call after successful save or cancel)
  const clearAutoSave = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return [value, setValue, clearAutoSave];
}

/** Clear all auto-save entries (e.g. on logout) */
export function clearAllAutoSaves() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** Check if a draft exists for a given key */
export function hasAutoSaveDraft(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) !== null;
  } catch {
    return false;
  }
}
