/**
 * offlineFormStorage — Durable IndexedDB-backed draft storage for forms.
 *
 * Engineers regularly lose mobile signal while filling forms on site. localStorage
 * works but has a small quota (~5MB) and can be evicted under storage pressure.
 * IndexedDB is the durable layer; we mirror to localStorage as a synchronous
 * read cache so the first render of a form can restore instantly.
 *
 *   await saveFormDraft("site-survey-abc", values);
 *   const draft = await loadFormDraft<MyForm>("site-survey-abc");
 *   await clearFormDraft("site-survey-abc");
 *   const pending = await listPendingDrafts();
 */
import { get, set, del, keys, createStore } from "idb-keyval";

const store = createStore("servexa-form-drafts", "drafts");
const LS_PREFIX = "autosave_";

export type DraftMeta = {
  id: string;
  updatedAt: number;
  size: number;
};

type DraftEnvelope<T = unknown> = {
  updatedAt: number;
  data: T;
};

/** Persist a form draft. Mirrors to localStorage for synchronous reads. */
export async function saveFormDraft<T>(formId: string, data: T): Promise<void> {
  const envelope: DraftEnvelope<T> = { updatedAt: Date.now(), data };
  // Sync mirror (best-effort; ignore quota errors)
  try {
    localStorage.setItem(LS_PREFIX + formId, JSON.stringify(data));
  } catch {
    // localStorage full — IDB still works
  }
  try {
    await set(formId, envelope, store);
  } catch {
    // IDB unavailable (private mode in some browsers); localStorage mirror is enough
  }
}

/** Load a form draft. Prefers IndexedDB, falls back to localStorage. */
export async function loadFormDraft<T>(formId: string): Promise<T | null> {
  try {
    const envelope = await get<DraftEnvelope<T>>(formId, store);
    if (envelope && envelope.data !== undefined) return envelope.data;
  } catch {
    // fall through to localStorage
  }
  return loadFormDraftSync<T>(formId);
}

/** Synchronous draft load from the localStorage mirror — for initial render. */
export function loadFormDraftSync<T>(formId: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + formId);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return null;
}

/** Remove a draft (call after successful submission). */
export async function clearFormDraft(formId: string): Promise<void> {
  try {
    localStorage.removeItem(LS_PREFIX + formId);
  } catch {
    // ignore
  }
  try {
    await del(formId, store);
  } catch {
    // ignore
  }
}

/** List all pending drafts (id + when last saved). */
export async function listPendingDrafts(): Promise<DraftMeta[]> {
  try {
    const ks = await keys(store);
    const metas: DraftMeta[] = [];
    for (const k of ks) {
      const id = String(k);
      const env = await get<DraftEnvelope>(id, store);
      if (env) {
        metas.push({
          id,
          updatedAt: env.updatedAt,
          size: JSON.stringify(env.data).length,
        });
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Clear every draft (e.g. on logout). */
export async function clearAllFormDrafts(): Promise<void> {
  try {
    const ks = await keys(store);
    await Promise.all(ks.map((k) => del(k, store)));
  } catch {
    // ignore
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
