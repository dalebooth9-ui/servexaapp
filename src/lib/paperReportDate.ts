/** Paper review dates are calendar dates, not the time the office filed them. */
export function paperCompletionIso(raw: string | null | undefined, now = new Date()): string {
  if (!raw?.trim()) return now.toISOString();
  const value = raw.trim();
  const uk = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const day = uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Enter a valid completion date (dd/mm/yyyy).");
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error("Enter a valid completion date (dd/mm/yyyy).");
  return date.toISOString();
}

export function paperDateText(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function isPaperReport(answers: Record<string, any>, historicBackfill = false): boolean {
  return historicBackfill || Boolean(answers._paper_completion_at || answers._scan_source);
}