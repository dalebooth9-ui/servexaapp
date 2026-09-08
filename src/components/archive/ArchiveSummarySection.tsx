import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ReportSummaryEditor from "@/components/reports/ReportSummaryEditor";
import { rerenderArchiveReport } from "@/lib/rerenderArchiveReport";
import { toast } from "sonner";

interface Props {
  archivedId: string;
  templateId: string | null;
  templateName: string | null;
  customerName?: string | null;
  siteName?: string | null;
  documentDate?: string | null;
  canEdit: boolean;
  /** Called after the report PDF has been re-rendered with the new summary. */
  onRerendered?: () => void;
}

/** Customer summary editor for a converted archive document. Saving rewrites
 *  the electronic report PDF from the answers we already hold — no re-OCR. */
export default function ArchiveSummarySection({
  archivedId,
  templateId,
  templateName,
  customerName,
  siteName,
  documentDate,
  canEdit,
  onRerendered,
}: Props) {
  const [extracted, setExtracted] = useState<Record<string, any> | null>(null);
  const [fields, setFields] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setExtracted(null);
      if (!templateId) return;
      const { data } = await (supabase as any)
        .from("archived_documents")
        .select("extracted")
        .eq("id", archivedId)
        .maybeSingle();
      const { data: tpl } = await supabase
        .from("job_sheet_templates")
        .select("fields")
        .eq("id", templateId)
        .maybeSingle();
      if (cancelled) return;
      setExtracted((data?.extracted || {}) as Record<string, any>);
      setFields(Array.isArray((tpl as any)?.fields) ? ((tpl as any).fields as any[]) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [archivedId, templateId]);

  if (!templateId || !extracted) return null;

  return (
    <ReportSummaryEditor
      templateName={templateName || "Report"}
      fields={fields as any}
      responses={extracted}
      archivedDocumentId={archivedId}
      context={{ customer: customerName ?? null, site: siteName ?? null, date: documentDate ?? null }}
      value={String(extracted._ai_summary || "") || null}
      canEdit={canEdit}
      onSave={async (text) => {
        const next = { ...extracted };
        if (text) next._ai_summary = text;
        else delete next._ai_summary;
        const { error } = await (supabase as any)
          .from("archived_documents")
          .update({ extracted: next })
          .eq("id", archivedId);
        if (error) throw error;
        setExtracted(next);
        try {
          await rerenderArchiveReport(archivedId);
          onRerendered?.();
        } catch {
          toast.error("Summary saved, but the report PDF could not be rebuilt.");
        }
      }}
    />
  );
}
