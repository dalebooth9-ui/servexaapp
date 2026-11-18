/** Translate known service failures without inventing an unavailable cause. */
export function plainError(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : reason instanceof Error ? reason.message : reason && typeof reason === "object" && "message" in reason ? String(reason.message) : "";
  if (!text || /^(error|unknown error)$/i.test(text)) return "Something went wrong, but no reason was returned. Please try again.";
  if (/row.level security|permission denied|not authori[sz]ed|unauthori[sz]ed|forbidden/i.test(text)) return "You do not have permission to do this in your company. Ask your company administrator.";
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(text)) return "The app could not connect. Check your internet connection and try again.";
  if (/jwt expired|session expired|not authenticated/i.test(text)) return "Your sign-in has expired. Sign in again and retry.";
  if (/duplicate key value|unique constraint/i.test(text)) return "This record already exists. Use the existing record instead.";
  if (/foreign key constraint/i.test(text)) return "This record is linked to other records, or a linked record is missing. Check those links and try again.";
  return text;
}