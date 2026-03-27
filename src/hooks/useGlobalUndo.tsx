import { create } from "zustand";

interface UndoEntry {
  id: string;
  label: string;
  onUndo: () => Promise<void> | void;
  expiresAt: number;
}

interface GlobalUndoState {
  entry: UndoEntry | null;
  push: (entry: Omit<UndoEntry, "id" | "expiresAt">, durationMs?: number) => void;
  clear: () => void;
  undo: () => void;
}

export const useGlobalUndo = create<GlobalUndoState>((set, get) => ({
  entry: null,
  push: (e, durationMs = 8000) => {
    const id = crypto.randomUUID();
    set({ entry: { ...e, id, expiresAt: Date.now() + durationMs } });
    setTimeout(() => {
      if (get().entry?.id === id) set({ entry: null });
    }, durationMs);
  },
  clear: () => set({ entry: null }),
  undo: () => {
    const { entry } = get();
    if (!entry) return;
    entry.onUndo();
    set({ entry: null });
  },
}));
