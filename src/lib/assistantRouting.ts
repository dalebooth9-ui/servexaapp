// Decides whether a question in the Servexa Assistant is a "how do I…" product
// question (answered from the help notes) or a question about the org's own
// records (answered by the read-only data assistant).
//
// This is only a cheap first pass — the data edge function can hand a question
// back with { route: "help" } if it turns out to be a how-to after all.

const HELP_PATTERNS: RegExp[] = [
  /^\s*(how|where|why|what)\s+(do|does|did|can|should|is|are)\s+(i|we|you|it)\b/i,
  /^\s*how\s+(do|to)\b/i,
  /\b(how do i|how can i|where do i|where is the|what does .* mean|is it possible to|walk me through|show me how)\b/i,
  /\b(set ?up|configure|enable|disable|install|connect|integrat)\w*\b.*\b(xero|whatsapp|email|template|portal|account|settings)\b/i,
  /\b(tutorial|instructions|guide|explain how)\b/i,
];

const DATA_PATTERNS: RegExp[] = [
  /\b(how many|how much|list|show me|which|who|when did|when is|any|are there|do we have)\b/i,
  /\b(outstanding|overdue|due|open|completed|pending|scheduled|last week|this week|next month|last month|this year|today|tomorrow)\b/i,
  /\b(jobs?|customers?|sites?|defects?|renewals?|contracts?|assets?|visits?|documents?|engineers?)\b/i,
];

export type AssistantRoute = "data" | "help";

export function classifyAssistantQuestion(text: string): AssistantRoute {
  const q = text.trim();
  if (!q) return "help";
  if (HELP_PATTERNS.some((r) => r.test(q))) return "help";
  if (DATA_PATTERNS.some((r) => r.test(q))) return "data";
  return "help";
}
