/** Shared compact-print rules: no empty sections, fewest pages. */
import type { OutletChecks } from "./outletChecks";

/** Only outlets that were checked (scanned or manually confirmed) print; "Not checked" ones are left out. */
export function checkedOutletNumbers(numbers: number[], checks: OutletChecks): number[] {
  const s = (n: number) => checks[String(n)]?.status;
  return numbers.filter((n) => s(n) === "scanned" || s(n) === "manual");
}

export const PHOTO_GRID = { gapMm: 3, captionMm: 7, targetCellMm: 45 };

/** 3–4 photos per row, each ~45mm wide, with a short caption underneath. */
export function photoGridLayout(count: number, maxWidth: number) {
  const { gapMm, captionMm, targetCellMm } = PHOTO_GRID;
  const cols = Math.max(3, Math.min(4, Math.round((maxWidth + gapMm) / (targetCellMm + gapMm))));
  const cellW = (maxWidth - gapMm * (cols - 1)) / cols;
  const photoH = cellW * 0.7;
  const cellH = photoH + captionMm;
  const rows = count > 0 ? Math.ceil(count / cols) : 0;
  return { cols, cellW, photoH, cellH, rows, gridH: rows ? rows * cellH + (rows - 1) * gapMm : 0 };
}
