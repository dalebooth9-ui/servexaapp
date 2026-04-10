/**
 * Fuzzy-match an OCR-extracted engineer name against known profiles.
 * Handwriting OCR often misreads individual characters (e.g. "Whittaker" → "Whatmore"),
 * so we use multiple strategies: Levenshtein, common prefix, and initial-based fallback.
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

  const ocrParts = cleaned.split(/\s+/);
  const ocrSurname = ocrParts[ocrParts.length - 1];
  const ocrInitial = ocrParts.length > 1 ? ocrParts[0][0] : "";

  let bestMatch = ocrName;
  let bestScore = Infinity;

  for (const eng of engineers) {
    const engParts = eng.full_name.toUpperCase().split(/\s+/);
    const engSurname = engParts[engParts.length - 1];
    const engInitial = engParts.length > 1 ? engParts[0][0] : "";

    const surnameDist = levenshtein(ocrSurname, engSurname);
    const prefixLen = commonPrefixLen(ocrSurname, engSurname);
    const initialMatch = ocrInitial && engInitial && ocrInitial === engInitial;
    const initialPenalty = ocrInitial && engInitial && !initialMatch ? 3 : 0;

    // Strategy A: pure Levenshtein
    const scoreA = surnameDist * 2 + initialPenalty;

    // Strategy B: common prefix bonus (OCR often gets start right)
    const scoreB = prefixLen >= 3
      ? Math.max(0, (surnameDist - prefixLen) * 2) + initialPenalty
      : Infinity;

    const score = Math.min(scoreA, scoreB);
    if (score < bestScore) {
      bestScore = score;
      bestMatch = eng.full_name;
    }
  }

  if (bestScore <= 6) return bestMatch;

  // Fallback: if no good surname match, try initial-based matching.
  // When OCR completely mangles the surname but gets the initial right,
  // and only one engineer has that initial, use them.
  if (ocrInitial) {
    const initialMatches = engineers.filter(e => {
      const parts = e.full_name.toUpperCase().split(/\s+/);
      return parts.length > 0 && parts[0][0] === ocrInitial;
    });
    if (initialMatches.length === 1) {
      return initialMatches[0].full_name;
    }
  }

  return ocrName;
}
