// Tracks on-screen signature saves that are still uploading, so live report
// PDFs are never generated while a signature is mid-save.
const pending = new Map<string, number>();
const waiters = new Set<() => void>();

export function beginSignatureSave(jobId: string) {
  pending.set(jobId, (pending.get(jobId) || 0) + 1);
}

export function endSignatureSave(jobId: string) {
  const n = (pending.get(jobId) || 1) - 1;
  if (n <= 0) pending.delete(jobId); else pending.set(jobId, n);
  waiters.forEach((w) => w());
}

/** Resolves once no signature save is in flight for this job (or timeout). */
export function waitForSignatureSaves(jobId: string, timeoutMs = 20000): Promise<void> {
  if (!pending.get(jobId)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); waiters.delete(check); resolve(); };
    const check = () => { if (!pending.get(jobId)) done(); };
    const t = setTimeout(done, timeoutMs);
    waiters.add(check);
  });
}
