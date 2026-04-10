/**
 * Fuzzy-match an OCR-extracted engineer name against known profiles.
 * Handwriting OCR often misreads individual characters (e.g. "M" → "C"),
 * so we compare by surname similarity + initial plausibility.
 */

interface EngineerProfile {
  user_id: string;
  full_name: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Count how many leading characters match */
function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function fuzzyMatchEngineer(
  ocrName: string,
  engineers: EngineerProfile[]
): string {
  if (!ocrName || engineers.length === 0) return ocrName || "";

  const cleaned = ocrName.trim().toUpperCase();
  
  // Exact match first
  const exact = engineers.find(e => e.full_name.toUpperCase() === cleaned);
  if (exact) return exact.full_name;

  // Split OCR name into parts
  const ocrParts = cleaned.split(/\s+/);
  const ocrSurname = ocrParts[ocrParts.length - 1];
  const ocrInitial = ocrParts.length > 1 ? ocrParts[0][0] : "";

  let bestMatch = ocrName;
  let bestScore = Infinity;

  for (const eng of engineers) {
    const engParts = eng.full_name.toUpperCase().split(/\s+/);
    const engSurname = engParts[engParts.length - 1];
    const engInitial = engParts.length > 1 ? engParts[0][0] : "";

    // Strategy 1: Levenshtein on full surname
    const surnameDist = levenshtein(ocrSurname, engSurname);

    // Strategy 2: Common prefix bonus (OCR often gets start right, mangles the end)
    const prefixLen = commonPrefixLen(ocrSurname, engSurname);

    // Initial match bonus
    const initialMatch = ocrInitial && engInitial && ocrInitial === engInitial;
    const initialPenalty = ocrInitial && engInitial && !initialMatch ? 3 : 0;

    // Score: lower is better
    // Approach A: pure Levenshtein (original approach, but with higher threshold)
    const scoreA = surnameDist * 2 + initialPenalty;

    // Approach B: prefix-based — if ≥3 chars match at start, weight heavily
    // e.g. "WHATMORE" vs "WHATMOUGH" shares "WHATMO" (6 chars)
    // e.g. "WHATMORE" vs "WHITTAKER" shares "WH" (2 chars)
    const scoreB = prefixLen >= 3
      ? Math.max(0, (surnameDist - prefixLen) * 2) + initialPenalty
      : Infinity;

    const score = Math.min(scoreA, scoreB);

    if (score < bestScore) {
      bestScore = score;
      bestMatch = eng.full_name;
    }
  }

  // Accept if score is reasonable
  // With initial match: accept up to 6; without: accept up to 4
  const threshold = 6;
  return bestScore <= threshold ? bestMatch : ocrName;
}
