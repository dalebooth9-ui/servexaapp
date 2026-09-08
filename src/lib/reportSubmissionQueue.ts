/**
 * reportSubmissionQueue — durable, idempotent queue for signed job-sheet
 * submissions that could not reach the server (basements, plant rooms, lifts).
 *
 * Why this exists: the generic sync queue deliberately handles UPDATE/DELETE
 * only, because blind INSERT retries duplicate rows. A report submission is
 * safe to retry because the row id is generated on the device and replayed as
 * an UPSERT — the same report can be sent ten times and still produce one row.
 *
 * Only transport failures are queued; validation/permission errors surface to
 * the engineer immediately instead of silently sitting in a queue.
 */
import { get, set, del, keys, createStore } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkError } from "@/lib/syncQueue";

const store = createStore("servexa-report-queue", "items");
const MAX_ATTEMPTS = 5;

export type ReportSubmissionItem = {
  /** client-generated job_sheet_responses.id — makes replay idempotent */
  id: string;
  jobId: string;
  templateId: string;
  templateName: string;
  jobRef?: string | null;
  responses: Record<string, unknown>;
  submittedBy?: string | null;
  status: string;
  submittedAt: string | null;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
};

type Listener = (items: ReportSubmissionItem[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<ReportSubmissionItem[]> {
  try {
    const ks = await keys(store);
    const items: ReportSubmissionItem[] = [];
    for (const k of ks) {
      const v = await get<ReportSubmissionItem>(k as string, store);
      if (v) items.push(v);
    }
    return items.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  } catch {
    return [];
  }
}

async function notify() {
  const items = await readAll();
  listeners.forEach((l) => l(items));
}

export function subscribeReportQueue(l: Listener): () => void {
  listeners.add(l);
  void readAll().then((i) => l(i));
  return () => { listeners.delete(l); };
}

export const listReportQueue = readAll;

export function newReportId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueReportSubmission(
  item: Omit<ReportSubmissionItem, "enqueuedAt" | "attempts">,
): Promise<void> {
  await set(item.id, { ...item, enqueuedAt: Date.now(), attempts: 0 }, store);
  await notify();
}

export async function discardReportSubmission(id: string): Promise<void> {
  await del(id, store);
  await notify();
}

/** Sends one report. Returns whether it landed and whether a retry is worthwhile. */
async function sendOne(item: ReportSubmissionItem): Promise<{ ok: boolean; retry: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("job_sheet_responses").upsert(
      {
        id: item.id,
        job_id: item.jobId,
        template_id: item.templateId,
        responses: item.responses as any,
        submitted_by: item.submittedBy ?? null,
        status: item.status,
        submitted_at: item.submittedAt,
      } as any,
      { onConflict: "id" },
    );
    if (error) return { ok: false, retry: isNetworkError(error), error: error.message };
    return { ok: true, retry: false };
  } catch (e: any) {
    return { ok: false, retry: isNetworkError(e), error: String(e?.message ?? e) };
  }
}

/** Drains the queue. Returns how many reports were sent successfully. */
export async function processReportQueue(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const items = await readAll();
  let sent = 0;
  for (const item of items) {
    const res = await sendOne(item);
    if (res.ok) {
      await del(item.id, store);
      sent++;
    } else {
      const attempts = item.attempts + 1;
      // Keep it either way — an engineer's signed report is never thrown away.
      // Non-retryable failures stay visible on the Sync status screen with the
      // reason, so the office can act on them.
      await set(item.id, { ...item, attempts, lastError: res.error }, store);
      if (!res.retry || attempts >= MAX_ATTEMPTS) continue;
    }
  }
  await notify();
  return sent;
}
