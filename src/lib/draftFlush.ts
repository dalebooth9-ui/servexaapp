/**
 * Draft flush registry. Open forms register a saver here so app-wide actions
 * that reload the page (e.g. "Update now") can save every half-finished
 * report before the page goes away, and wait for the save to finish.
 */
type Saver = () => void | Promise<unknown>;

const savers = new Set<Saver>();

export function registerDraftSaver(fn: Saver): () => void {
  savers.add(fn);
  return () => {
    savers.delete(fn);
  };
}

/** Run every registered saver; resolves when all finish or the timeout passes. */
export async function flushAllDrafts(timeoutMs = 3000): Promise<void> {
  const runs = Array.from(savers).map(async (fn) => {
    try {
      await fn();
    } catch {
      // a failed saver must not block the others; local copies already exist
    }
  });
  await Promise.race([
    Promise.allSettled(runs),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
