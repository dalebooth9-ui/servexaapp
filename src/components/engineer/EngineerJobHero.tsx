/**
 * EngineerJobHero — "Today on this job" hero shown only to assigned engineers.
 *
 * The engineer's two primary objects are:
 *   1. The report(s) they have to fill in (job_sheet_responses × templates)
 *   2. Outstanding remedial works on this job
 *
 * Everything else on the job page is secondary/supporting. Admins keep the
 * existing office-first layout; this component is gated by the caller on
 * `isAssignedEngineer && !isAdmin`.
 *
 * The "Fill in" action reuses the exact same code path as the Documents-tab
 * "Fill In Online" button: it switches to the documents tab so
 * JobSheetTemplates is mounted, then dispatches the `job-sheet:fill-online`
 * event. That path renders the sheet dialog which includes the inline
 * SignatureCapture panels at the end — so signatures captured inline still
 * land in `job_signatures` and appear on the separate Sign-off tab.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Play, Eye, FileText } from "lucide-react";
import JobRemedialChecklist from "@/components/jobs/JobRemedialChecklist";

type Response = {
  id: string;
  template_id: string;
  status: string;
  submitted_at: string | null;
  submitted_by: string | null;
};

type Template = { id: string; name: string; status?: string | null };

type Props = {
  jobId: string;
  jobOrgId?: string | null;
  isRemedial: boolean;
  onNavigateTab?: (tab: string) => void;
};

export default function EngineerJobHero({ jobId, jobOrgId, isRemedial, onNavigateTab }: Props) {
  const [rows, setRows] = useState<Array<{ response: Response; template: Template }>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: resps } = await supabase
      .from("job_sheet_responses")
      .select("id, template_id, status, submitted_at, submitted_by")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    const responses = (resps as Response[]) || [];
    const tplIds = Array.from(new Set(responses.map((r) => r.template_id).filter(Boolean)));
    let templates: Template[] = [];
    if (tplIds.length) {
      const { data: tpls } = await supabase
        .from("job_sheet_templates")
        .select("id, name, status")
        .in("id", tplIds);
      templates = (tpls as Template[]) || [];
    }
    // Deduplicate: one row per template, prefer submitted > draft > other
    const rank = (s: string) => (s === "submitted" ? 2 : s === "draft" ? 1 : 0);
    const byTpl = new Map<string, Response>();
    for (const r of responses) {
      const cur = byTpl.get(r.template_id);
      if (!cur || rank(r.status) > rank(cur.status)) byTpl.set(r.template_id, r);
    }
    const built = Array.from(byTpl.entries())
      .map(([tid, response]) => {
        const template = templates.find((t) => t.id === tid);
        return template ? { response, template } : null;
      })
      .filter(Boolean) as Array<{ response: Response; template: Template }>;
    setRows(built);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`hero-sheets-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_sheet_responses", filter: `job_id=eq.${jobId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const openSheet = (templateId: string, response: Response) => {
    onNavigateTab?.("documents");
    // JobSheetTemplates is mounted on the documents tab; give it a tick to mount
    // its listener before dispatching. Bumped slightly higher than the previous
    // 100ms to survive slow lazy-load on mobile.
    const mode: "view" | "continue" | "fill" =
      response.status === "submitted" ? "view" : response.status === "draft" ? "continue" : "fill";
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("job-sheet:fill-online", {
          detail: { jobId, templateId, responseId: response.id, mode },
        }),
      );
    }, 250);
  };

  return (
    <section id="engineer-job-hero" className="mb-6 space-y-4">
      <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 md:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Today on this job</h2>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading sheets…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">No job sheet attached yet</p>
              <p className="text-muted-foreground text-xs mt-0.5">Ask the office to attach the right form for this visit.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ response, template }) => {
              const submitted = response.status === "submitted";
              const isDraft = response.status === "draft";
              const label = submitted ? "View" : isDraft ? "Continue" : "Fill out";
              const chip = submitted ? (
                <Badge className="bg-green-600 hover:bg-green-600">Submitted</Badge>
              ) : isDraft ? (
                <Badge variant="secondary">Draft</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">Not started</Badge>
              );
              return (
                <div
                  key={template.id}
                  className="rounded-lg border bg-card p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm break-words">{template.name}</p>
                    <div className="mt-1">{chip}</div>
                  </div>
                  <Button
                    size="lg"
                    variant={submitted ? "outline" : "default"}
                    className="min-h-12 text-base font-semibold gap-2 w-full sm:w-auto"
                    onClick={() => openSheet(template.id, response)}
                  >
                    {submitted ? <Eye className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    {label}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>


      <div id="engineer-remedial-hero">
        <JobRemedialChecklist
          jobId={jobId}
          jobOrgId={jobOrgId}
          isRemedial={isRemedial}
          isAdmin={false}
          isAssignedEngineer={true}
        />
      </div>
    </section>
  );
}
