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

  let bestMatch = ocrName;
  let bestScore = Infinity;

  for (const eng of engineers) {
    const engParts = eng.full_name.toUpperCase().split(/\s+/);
    const engSurname = engParts[engParts.length - 1];

    // Compare surnames with Levenshtein distance
    const surnameDist = levenshtein(ocrSurname, engSurname);
    
    // If surname is close (within 3 edits for typical OCR errors)
    if (surnameDist <= 3) {
      // Bonus: if first initial/name also somewhat matches
      let firstNameDist = 0;
      if (ocrParts.length > 1 && engParts.length > 1) {
        const ocrFirst = ocrParts[0];
        const engFirst = engParts[0];
        // Single initial vs full name: just compare first char
        if (ocrFirst.length === 1) {
          firstNameDist = levenshtein(ocrFirst, engFirst[0]);
        } else {
          firstNameDist = levenshtein(ocrFirst, engFirst);
        }
      }

      const totalScore = surnameDist * 2 + firstNameDist;
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestMatch = eng.full_name;
      }
    }
  }

  // Only accept if reasonably close (score <= 4)
  return bestScore <= 4 ? bestMatch : ocrName;
}
