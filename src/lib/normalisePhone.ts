/**
 * Normalise a UK mobile number to E.164 (+44...).
 * - Strips spaces, hyphens, brackets.
 * - Converts leading "0" (e.g. 07772544203) to "+44" (e.g. +447772544203).
 * - Converts leading "44" (no plus) to "+44".
 * - Leaves already-E.164 values (starting with "+") untouched aside from whitespace stripping.
 * - Returns "" for empty input so callers can store NULL.
 */
export function normaliseWhatsAppNumber(input: string | null | undefined): string {
  if (!input) return "";
  const cleaned = String(input).replace(/[\s\-()]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  if (cleaned.startsWith("07") && cleaned.length === 11) return "+44" + cleaned.slice(1);
  if (cleaned.startsWith("44")) return "+" + cleaned;
  if (cleaned.startsWith("7") && cleaned.length === 10) return "+44" + cleaned;
  return cleaned;
}

export const WHATSAPP_NUMBER_HINT =
  "Use international format, e.g. +447772544203. UK 07… numbers are converted automatically.";
