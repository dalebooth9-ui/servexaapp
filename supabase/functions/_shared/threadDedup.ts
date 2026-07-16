// Shared helpers for email-thread-aware PO intake deduplication.
//
// The intake functions receive emails one at a time. Reply chains and
// forwards land as SEPARATE inbound events, and previously every event
// spawned a fresh draft in Pending Review. These helpers let the intake
// recognise that "this new email is part of an existing conversation we
// already turned into a draft" — either because its RFC822 In-Reply-To/
// References headers point at a Message-ID we've already filed, OR
// because the (normalised subject + sender domain) pair matches a draft
// we opened in the last 14 days.

export interface EmailThreadHeaders {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  normalizedSubject: string;
  senderEmail: string;
  senderDomain: string;
}

/** Extract angle-bracket message IDs from a raw header value. */
export function parseMessageIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const re = /<([^<>\s]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(`<${m[1].trim()}>`);
  return out;
}

export function normalizeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const t = String(id).trim();
  if (!t) return null;
  if (t.startsWith("<") && t.endsWith(">")) return t;
  return `<${t.replace(/^<|>$/g, "")}>`;
}

/** Strip RE:/FW:/Fwd: prefixes (possibly nested) and collapse whitespace. */
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = String(subject);
  // strip leading list tags [FOO], bracketed prefixes are rare on PO emails
  // remove reply/forward prefixes repeatedly
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/^\s*(re|fw|fwd|aw|tr|antw)\s*(\[\d+\])?\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function extractSenderEmail(from: string | null | undefined): string {
  if (!from) return "";
  const m = String(from).match(/<([^>]+)>/);
  const addr = (m ? m[1] : String(from)).trim().toLowerCase();
  return addr;
}

export function senderDomainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Parse RFC822 headers out of the top of a raw .eml (bytes → string).
 * Returns lowercase-keyed map with unfolded values. Safe on partial input.
 */
export function parseRawEmlHeaders(rawEml: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!rawEml) return out;
  const src = rawEml.slice(0, 64 * 1024); // headers are small; bound the work
  const sep = src.search(/\r?\n\r?\n/);
  const headerBlock = sep >= 0 ? src.slice(0, sep) : src;
  // Unfold: lines starting with whitespace continue the previous line.
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!out[name]) out[name] = value;
  }
  return out;
}

export function buildThreadHeaders(input: {
  fromRaw: string;
  subject: string;
  rawEmlText?: string | null;
  webhookHeaders?: Record<string, string> | null | undefined;
}): EmailThreadHeaders {
  const emlHeaders = parseRawEmlHeaders(input.rawEmlText || null);
  const hdr = (name: string): string | null => {
    const lower = name.toLowerCase();
    return (
      (input.webhookHeaders && (input.webhookHeaders[lower] ?? input.webhookHeaders[name])) ||
      emlHeaders[lower] ||
      null
    );
  };
  const messageId = normalizeMessageId(hdr("Message-ID") || hdr("Message-Id"));
  const inReplyTo = normalizeMessageId(hdr("In-Reply-To"));
  const references = parseMessageIdList(hdr("References"));
  const senderEmail = extractSenderEmail(input.fromRaw);
  return {
    messageId,
    inReplyTo,
    references,
    normalizedSubject: normalizeSubject(input.subject),
    senderEmail,
    senderDomain: senderDomainOf(senderEmail),
  };
}

/**
 * Look for an existing job whose thread this email belongs to.
 * Order: (1) header ancestry match against ANY job's stored message IDs,
 * (2) fallback normalised-subject + sender-domain match against pending
 * drafts from the last 14 days.
 */
export async function findExistingThreadJob(
  admin: any,
  orgId: string,
  th: EmailThreadHeaders,
): Promise<{ id: string; reference_number: string | null; brief: string | null; name: string | null; matchedBy: "headers" | "subject_sender" } | null> {
  const ancestorIds = [th.inReplyTo, ...th.references].filter(Boolean) as string[];
  if (ancestorIds.length) {
    const { data: hit } = await admin
      .from("jobs")
      .select("id, reference_number, brief, name, intake_message_ids")
      .eq("org_id", orgId)
      .overlaps("intake_message_ids", ancestorIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hit) return { ...hit, matchedBy: "headers" };
  }

  if (th.normalizedSubject && th.senderDomain) {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: hit } = await admin
      .from("jobs")
      .select("id, reference_number, brief, name")
      .eq("org_id", orgId)
      .eq("status", "pending_review")
      .eq("intake_normalized_subject", th.normalizedSubject)
      .eq("intake_sender_domain", th.senderDomain)
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hit) return { ...hit, matchedBy: "subject_sender" };
  }

  return null;
}
