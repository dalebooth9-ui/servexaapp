// AI report summaries — a short, plain-English paragraph placed near the top
// of the customer-facing report PDF.
//
// Storage: the summary lives inside the report's own answer payload under the
// reserved key `_ai_summary` (the same convention as `_additional_notes`), so
// live job sheets (`job_sheet_responses.responses`) and archive conversions
// (`archived_documents.extracted`) both carry it with no schema change, and the
// shared PDF generator renders it for both.
//
// Off by default per organisation — Settings → "AI report summaries".
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useState } from "react";

export const AI_SUMMARY_KEY = "_ai_summary";
const SETTINGS_KEY = "ai_report_summaries";

export interface AiSummarySettings {
  enabled: boolean;
}

export const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = { enabled: false };

let cachedPromise: Promise<AiSummarySettings> | null = null;
let cachedValue: AiSummarySettings = DEFAULT_AI_SUMMARY_SETTINGS;
const subscribers = new Set<(s: AiSummarySettings) => void>();

/** Fetch (and cache) the org's AI-summary toggle. Always resolves. */
export async function loadAiSummarySettings(): Promise<AiSummarySettings> {
  if (!cachedPromise) {
    cachedPromise = (async () => {
      try {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", SETTINGS_KEY)
          .maybeSingle();
        const value = { enabled: !!(data?.value as any)?.enabled };
        cachedValue = value;
        return value;
      } catch {
        return DEFAULT_AI_SUMMARY_SETTINGS;
      }
    })();
  }
  return cachedPromise;
}

export function useAiSummarySettings(): {
  settings: AiSummarySettings;
  loaded: boolean;
  save: (next: AiSummarySettings) => Promise<{ error: string | null }>;
} {
  const [settings, setSettings] = useState<AiSummarySettings>(cachedValue);
  const [loaded, setLoaded] = useState<boolean>(cachedPromise !== null);

  useEffect(() => {
    let alive = true;
    loadAiSummarySettings().then((v) => {
      if (!alive) return;
      setSettings(v);
      setLoaded(true);
    });
    const sub = (v: AiSummarySettings) => setSettings(v);
    subscribers.add(sub);
    return () => {
      alive = false;
      subscribers.delete(sub);
    };
  }, []);

  const save = useCallback(async (next: AiSummarySettings) => {
    const value = { enabled: !!next.enabled };
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value: value as any }, { onConflict: "org_id,key" });
    if (error) return { error: error.message };
    cachedValue = value;
    cachedPromise = Promise.resolve(value);
    subscribers.forEach((fn) => fn(value));
    return { error: null };
  }, []);

  return { settings, loaded, save };
}

// ---------------------------------------------------------------------------
// Fact building — the ONLY material the summary may be composed from.
// ---------------------------------------------------------------------------

export type SummaryAnswer = { label: string; value: string };
export type SummaryDefect = { title: string; location?: string; notes?: string };

function stringifyAnswer(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "object" && v ? Object.values(v).filter(Boolean).join(" ") : String(v ?? "")))
      .map((s) => s.trim())
      .filter(Boolean)
      .join("; ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

/** Flatten a template + its answers into label/value pairs the AI can read.
 *  Photos, signatures and internal underscore keys are excluded. */
export function buildSummaryAnswers(
  fields: Array<{ id: string; label: string; type?: string }> | null | undefined,
  responses: Record<string, any> | null | undefined,
): SummaryAnswer[] {
  const out: SummaryAnswer[] = [];
  const resp = responses || {};
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f?.id || !f?.label) continue;
    const t = String(f.type || "");
    if (t === "signature" || t === "photo" || t === "photo_gallery") continue;
    const raw = stringifyAnswer(resp[f.id]);
    if (!raw) continue;
    if (raw.startsWith("data:image")) continue;
    out.push({ label: String(f.label).trim(), value: raw.slice(0, 600) });
  }
  const extraNotes = stringifyAnswer(resp._additional_notes);
  if (extraNotes) out.push({ label: "Additional notes", value: extraNotes.slice(0, 600) });
  return out;
}

/** Load the defect records attached to a job or an archived document (RLS-scoped). */
export async function loadSummaryDefects(opts: {
  jobId?: string | null;
  archivedDocumentId?: string | null;
}): Promise<SummaryDefect[]> {
  try {
    let q = supabase
      .from("defects")
      .select("title, description, location_on_site, status, job_id, source_archived_document_id")
      .limit(50);
    if (opts.jobId) q = q.eq("job_id", opts.jobId);
    else if (opts.archivedDocumentId) q = q.eq("source_archived_document_id", opts.archivedDocumentId);
    else return [];
    const { data } = await q;
    return (data || []).map((d: any) => ({
      title: d.title,
      location: d.location_on_site || undefined,
      notes: d.description || undefined,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateReportSummary(input: {
  templateName: string;
  answers: SummaryAnswer[];
  defects?: SummaryDefect[];
  context?: { customer?: string | null; site?: string | null; date?: string | null };
}): Promise<{ summary: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("ai-report-summary", {
    body: {
      template_name: input.templateName,
      answers: input.answers,
      defects: input.defects || [],
      context: input.context || {},
    },
  });
  if (error) return { summary: null, error: (data as any)?.error || error.message };
  if ((data as any)?.error) return { summary: null, error: (data as any).error };
  const summary = String((data as any)?.summary || "").trim();
  if (!summary) return { summary: null, error: "No summary was returned." };
  return { summary, error: null };
}

/** Convenience: build facts + generate in one call, for a report we already hold. */
export async function generateSummaryForReport(input: {
  templateName: string;
  fields: Array<{ id: string; label: string; type?: string }>;
  responses: Record<string, any>;
  jobId?: string | null;
  archivedDocumentId?: string | null;
  context?: { customer?: string | null; site?: string | null; date?: string | null };
}): Promise<{ summary: string | null; error: string | null }> {
  const answers = buildSummaryAnswers(input.fields, input.responses);
  if (answers.length === 0) {
    return { summary: null, error: "This report has no completed answers to summarise yet." };
  }
  const defects = await loadSummaryDefects({
    jobId: input.jobId,
    archivedDocumentId: input.archivedDocumentId,
  });
  return generateReportSummary({
    templateName: input.templateName,
    answers,
    defects,
    context: input.context,
  });
}
