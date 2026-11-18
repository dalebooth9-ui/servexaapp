/** Loose name matching for "This looks like X" warnings. Never merges anything. */
const SUFFIXES = /\b(ltd|limited|plc|llp|llc|inc|co|company|group|uk|the)\b/g;

export function normaliseName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** True when two names are probably the same business/place. */
export function namesLookAlike(a: string, b: string): boolean {
  const x = normaliseName(a), y = normaliseName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.replace(/ /g, "") === y.replace(/ /g, "")) return true;
  if ((x.match(/\d+/g) || []).join(",") !== (y.match(/\d+/g) || []).join(",")) return false;
  const len = Math.min(x.length, y.length);
  return len >= 6 && distance(x, y) <= 1;
}

export function findLookAlike<T extends { name: string }>(name: string, rows: T[]): T | null {
  return rows.find((r) => namesLookAlike(name, r.name)) || null;
}
