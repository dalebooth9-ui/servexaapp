// Client-side conversion queue for archive documents.
//
// Why a module-level singleton (not a React hook / Zustand store):
//   * Conversions must keep running when the user navigates away from
//     the archive page and comes back.
//   * The archive card on CustomerDetail also uses the same queue.
//   * React Strict Mode double-invokes effects — a singleton drains once.
//
// Concurrency: we run up to 2 conversions in parallel. Each conversion
// makes two Edge Function calls (classify + OCR) and one client-side
// PDF upload, so 2 balances throughput vs. hammering the Gemini rate
// limits shared with other Edge Functions in the same tab.
//
// Refresh survival: the queued ID list is persisted to localStorage so
// that when the user refreshes mid-batch, the browser resumes any
// items whose DB row still shows no `report_pdf_path`. A conversion
// interrupted mid-flight (tab closed during the PDF upload) simply
// gets re-queued on return — the archived_documents row stays in its
// pre-convert state so a retry is safe and idempotent.
import { convertArchivedDocument } from "@/lib/convertArchivedDocument";
import type { ProposedDefect } from "@/lib/proposeArchiveDefects";

export type QueueState = "queued" | "converting" | "done" | "failed";

export interface QueueEntry {
  id: string;
  state: QueueState;
  /** Populated when state === "failed". */
  reason?: string;
  /** Template name populated after successful convert. */
  templateName?: string;
  /** Defect proposals surfaced for office review after a successful convert. */
  proposedDefects?: ProposedDefect[];
  customerId?: string | null;
  siteId?: string | null;
  documentDate?: string | null;
}

const STORAGE_KEY = "servexa:archiveConversionQueue:v1";
const CONCURRENCY = 2;

type Listener = () => void;

class ArchiveConversionQueue {
  private entries = new Map<string, QueueEntry>();
  private listeners = new Set<Listener>();
  private activeCount = 0;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const ids: string[] = JSON.parse(raw);
          for (const id of ids) {
            this.entries.set(id, { id, state: "queued" });
          }
          // Drain kicks off on next tick so React can mount subscribers first.
          setTimeout(() => this.drain(), 0);
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getEntry(id: string): QueueEntry | undefined {
    return this.entries.get(id);
  }

  /** Snapshot for debugging / bulk banner counts. */
  snapshot(): QueueEntry[] {
    return Array.from(this.entries.values());
  }

  enqueue(ids: string[]): void {
    let mutated = false;
    for (const id of ids) {
      const existing = this.entries.get(id);
      // Skip anything currently in flight or already done. Failed rows
      // may be re-queued (retry).
      if (existing && (existing.state === "converting" || existing.state === "queued")) {
        continue;
      }
      this.entries.set(id, { id, state: "queued" });
      mutated = true;
    }
    if (mutated) {
      this.persist();
      this.emit();
      this.drain();
    }
  }

  /** Remove a "done" entry after the row list has picked up the new state. */
  clear(id: string): void {
    if (this.entries.delete(id)) {
      this.persist();
      this.emit();
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    // Only queued/converting/failed need to survive refresh — done rows
    // are reflected in the DB.
    const ids = Array.from(this.entries.values())
      .filter((e) => e.state !== "done")
      .map((e) => e.id);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* quota — non-fatal */
    }
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        /* isolate listener errors */
      }
    }
  }

  private drain(): void {
    while (this.activeCount < CONCURRENCY) {
      const next = Array.from(this.entries.values()).find(
        (e) => e.state === "queued",
      );
      if (!next) return;
      this.activeCount++;
      next.state = "converting";
      this.emit();
      // fire-and-forget; each worker slot picks the next queued item when done
      this.runOne(next.id).finally(() => {
        this.activeCount--;
        this.persist();
        this.emit();
        // If more work exists, keep draining.
        this.drain();
      });
    }
  }

  private async runOne(id: string): Promise<void> {
    try {
      const res = await convertArchivedDocument(id);
      const entry = this.entries.get(id);
      if (!entry) return;
      if (res.ok) {
        entry.state = "done";
        entry.templateName = res.templateName;
        entry.reason = undefined;
        entry.proposedDefects = res.proposedDefects;
        entry.customerId = res.customerId;
        entry.siteId = res.siteId;
        entry.documentDate = res.documentDate;
      } else {
        entry.state = "failed";
        entry.reason = (res as { ok: false; reason: string }).reason;
      }
    } catch (e: any) {
      const entry = this.entries.get(id);
      if (entry) {
        entry.state = "failed";
        entry.reason = e?.message || "Unknown error";
      }
    }
  }
}

export const archiveConversionQueue = new ArchiveConversionQueue();

/** React hook: re-render on queue updates and return the entry for `id`. */
import { useEffect, useState } from "react";
export function useArchiveConversionEntry(id: string): QueueEntry | undefined {
  const [tick, setTick] = useState(0);
  useEffect(() => archiveConversionQueue.subscribe(() => setTick((t) => t + 1)), []);
  void tick;
  return archiveConversionQueue.getEntry(id);
}

/** Hook returning aggregate counts for banners. */
export function useArchiveConversionSummary(): {
  queued: number;
  converting: number;
  failed: number;
} {
  const [tick, setTick] = useState(0);
  useEffect(() => archiveConversionQueue.subscribe(() => setTick((t) => t + 1)), []);
  void tick;
  const snap = archiveConversionQueue.snapshot();
  return {
    queued: snap.filter((e) => e.state === "queued").length,
    converting: snap.filter((e) => e.state === "converting").length,
    failed: snap.filter((e) => e.state === "failed").length,
  };
}
