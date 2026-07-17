/**
 * Lists compact "Previous report" comparisons for every submitted template
 * response on this job. Used above the customer-report generator so office
 * staff can eyeball history before producing the PDF.
 */
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PreviousReportPanel from "./PreviousReportPanel";

interface Props {
  jobId: string;
}

type Row = {
  id: string;
  template_id: string;
  responses: Record<string, any>;
  templateName: string;
  templateFields: any[];
};

export default function PreviousReportsForJob({ jobId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: resps } = await supabase
        .from("job_sheet_responses")
        .select("id, template_id, responses, status")
        .eq("job_id", jobId)
        .eq("status", "submitted");
      const list = resps || [];
      if (list.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoaded(true);
        }
        return;
      }
      const templateIds = Array.from(new Set(list.map((r: any) => r.template_id)));
      const { data: tpls } = await supabase
        .from("job_sheet_templates")
        .select("id, name, fields")
        .in("id", templateIds);
      const byId = new Map<string, any>((tpls || []).map((t: any) => [t.id, t]));
      const built: Row[] = list.map((r: any) => {
        const t = byId.get(r.template_id);
        const fields = t?.fields
          ? typeof t.fields === "string"
            ? JSON.parse(t.fields)
            : t.fields
          : [];
        return {
          id: r.id,
          template_id: r.template_id,
          responses: (r.responses || {}) as Record<string, any>,
          templateName: t?.name ?? "Report",
          templateFields: fields,
        };
      });
      if (!cancelled) {
        setRows(built);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!loaded) return null;
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        Previous reports for sanity check
      </div>
      {rows.map((r) => (
        <div key={r.id} className="space-y-1">
          <div className="text-[11px] text-muted-foreground">{r.templateName}</div>
          <PreviousReportPanel
            currentJobId={jobId}
            templateId={r.template_id}
            templateFields={r.templateFields}
            currentResponses={r.responses}
            currentResponseId={r.id}
          />
        </div>
      ))}
    </div>
  );
}
