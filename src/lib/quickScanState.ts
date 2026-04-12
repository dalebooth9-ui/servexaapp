export function mergeQuickScanState<T extends Record<string, any>>(
  committed: T | null | undefined,
  draft: T | null | undefined,
): T {
  if (!draft || Object.keys(draft).length === 0) {
    return { ...(committed ?? {}) } as T;
  }

  return {
    ...(committed ?? {}),
    ...draft,
  } as T;
}