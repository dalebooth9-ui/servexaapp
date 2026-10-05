import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPen, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type SourceReport = {
  id: string;
  templateName: string;
  detail: string | null;
};

type SiteVisitReport = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
};

function responseDetail(response: Record<string, any>, fields: Array<{ id?: string; label?: string }>): string | null {
  const systemLabel = String(response.system_label || response.responses?._system_label || "").trim();
  if (systemLabel) return systemLabel;
  const riserField = fields.find((field) => /riser\s*(location|loc)|system\s*(location|label)/i.test(field.label || ""));
  const riserLocation = riserField?.id ? String(response.responses?.[riserField.id] || "").trim() : "";
  return riserLocation || null;
}

export default function SiteVisitReportExtra({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const [sourceReports, setSourceReports] = useState<SourceReport[]>([]);
  const [siteVisitReports, setSiteVisitReports] = useState<SiteVisitReport[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: responses }, { data: existing }] = await Promise.all([
        supabase
          .from("job_sheet_responses")
          .select("id, template_id, system_label, responses, submitted_at")
          .eq("job_id", jobId)
          .eq("status", "submitted")
          .is("archived_at", null)
          .order("submitted_at", { ascending: false }),
        supabase
          .from("site_visit_reports")
          .select("id, title, status, updated_at")
          .eq("job_id", jobId)
          .order("updated_at", { ascending: false }),
      ]);
      if (cancelled) return;
      const rows = (responses as any[]) || [];
      const templateIds = Array.from(new Set(rows.map((row) => row.template_id).filter(Boolean)));
      let templates = new Map<string, { name: string; fields: Array<{ id?: string; label?: string }> }>();
      if (templateIds.length) {
        const { data } = await supabase.from("job_sheet_templates").select("id, name, fields").in("id", templateIds);
        templates = new Map(((data as any[]) || []).map((template) => [template.id, {
          name: template.name,
          fields: Array.isArray(template.fields) ? template.fields : [],
        }]));
      }
      if (cancelled) return;
      setSourceReports(rows.map((row) => {
        const template = templates.get(row.template_id);
        return {
          id: row.id,
          templateName: template?.name || "Report",
          detail: responseDetail(row, template?.fields || []),
        };
      }));
      setSiteVisitReports(((existing as any[]) || []) as SiteVisitReport[]);
    };
    void load();
    const channel = supabase
      .channel(`site-visit-report-extra-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_visit_reports", filter: `job_id=eq.${jobId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_sheet_responses", filter: `job_id=eq.${jobId}` }, load)
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    sourceReports.forEach((report) => counts.set(report.templateName, (counts.get(report.templateName) || 0) + 1));
    return counts;
  }, [sourceReports]);

  const startReport = () => {
    const params = new URLSearchParams();
    params.set("sheets", Array.from(selected).join(","));
    navigate(`/jobs/${jobId}/site-visit-report/new?${params.toString()}`);
  };

  const begin = () => {
    setSelected(new Set());
    if (sourceReports.length) setPickerOpen(true);
    else startReport();
  };

  return (
    <section className="mt-4 border-t pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra</p>
      <div className="space-y-2 rounded-md border p-3">
        <Button variant="outline" className="gap-2" onClick={begin}>
          <ClipboardPen className="h-4 w-4" /> Write up full report
        </Button>
        <p className="text-xs text-muted-foreground">For call-outs, fault-finding or anything that needs a longer written report.</p>

        {siteVisitReports.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {siteVisitReports.map((report) => (
              <Button
                key={report.id}
                type="button"
                variant="ghost"
                onClick={() => navigate(`/jobs/${jobId}/site-visit-report/${report.id}`)}
                className="h-auto min-h-10 w-full justify-start gap-3 border px-3 py-2 text-left"
              >
                <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{report.title || "Untitled Site Visit Report"}</span>
                <Badge variant={report.status === "approved" ? "default" : "secondary"} className="shrink-0">
                  {STATUS_LABEL[report.status] || report.status}
                </Badge>
              </Button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Bring in the comments from any of these?</DialogTitle>
            <DialogDescription>Choose any reports to copy from, or skip this step.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {sourceReports.map((report) => {
              const checked = selected.has(report.id);
              const showDetail = (duplicateNames.get(report.templateName) || 0) > 1 && report.detail;
              return (
                <Label key={report.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border p-3 font-normal">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => setSelected((current) => {
                      const updated = new Set(current);
                      if (next === true) updated.add(report.id);
                      else updated.delete(report.id);
                      return updated;
                    })}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{report.templateName}</span>
                    {showDetail && <span className="block text-xs text-muted-foreground">{report.detail}</span>}
                  </span>
                </Label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={startReport}>Skip</Button>
            <Button onClick={startReport}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}