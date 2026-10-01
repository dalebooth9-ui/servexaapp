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
import { ClipboardCheck, Play, Eye, FileText, Ban, Undo2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SKIP_REASONS, skipReasonLabel } from "@/lib/reportFieldRules";
import JobRemedialChecklist from "@/components/jobs/JobRemedialChecklist";

type Response = {
  id: string;
  template_id: string;
  status: string;
  submitted_at: string | null;
  submitted_by: string | null;
  skipped_at?: string | null;
  skip_reason?: string | null;
  skip_note?: string | null;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [skipFor, setSkipFor] = useState<{ response: Response; template: Template } | null>(null);
  const [reason, setReason] = useState<string>("not_required");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const logActivity = async (action: string, details: string) => {
    await supabase.from("job_activity_log").insert({ job_id: jobId, user_id: user?.id, action, details, org_id: jobOrgId ?? undefined } as any);
  };

  const confirmSkip = async () => {
    if (!skipFor) return;
    if (reason === "other" && !note.trim()) { toast({ title: "Add a short reason", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await supabase.from("job_sheet_responses").update({
      skipped_at: new Date().toISOString(), skipped_by: user?.id, skip_reason: reason, skip_note: note.trim() || null,
    } as any).eq("id", skipFor.response.id);
    setBusy(false);
    if (error) { toast({ title: "Couldn't mark as not done", description: error.message, variant: "destructive" }); return; }
    await logActivity("form_skipped", `${skipFor.template.name} not done on this visit — ${skipReasonLabel(reason)}${note.trim() ? `: ${note.trim()}` : ""}`);
    setSkipFor(null); setNote(""); setReason("not_required");
    load();
  };

  const undoSkip = async (response: Response, template: Template) => {
    const { error } = await supabase.from("job_sheet_responses").update({ skipped_at: null, skipped_by: null, skip_reason: null, skip_note: null } as any).eq("id", response.id);
    if (error) { toast({ title: "Couldn't undo", description: error.message, variant: "destructive" }); return; }
    await logActivity("form_unskipped", `${template.name} put back on this visit`);
    load();
  };

  const load = async () => {
    const { data: resps } = await supabase
      .from("job_sheet_responses")
      .select("id, template_id, status, submitted_at, submitted_by, skipped_at, skip_reason, skip_note")
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
    const mode: "view" | "continue" | "fill" =
      response.status === "submitted" ? "view" : response.status === "draft" ? "continue" : "fill";
    // The JobSheet chunk is lazy and may not have mounted its listener yet on
    // slow mobile. Re-dispatch until a listener marks it handled (max ~4s).
    // The nonce makes the listener act only once.
    const nonce = `${templateId}-${Date.now()}-${Math.random()}`;
    let attempts = 0;
    const tryDispatch = () => {
      attempts++;
      const detail: Record<string, unknown> = { jobId, templateId, responseId: response.id, mode, nonce };
      window.dispatchEvent(new CustomEvent("job-sheet:fill-online", { detail }));
      if (!detail.handled && attempts < 16) setTimeout(tryDispatch, 250);
    };
    setTimeout(tryDispatch, 50);
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
              const skipped = !!response.skipped_at;
              if (skipped) {
                return (
                  <div key={template.id} className="rounded-lg border border-dashed bg-muted/40 p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm break-words text-muted-foreground line-through">{template.name}</p>
                      <div className="mt-1"><Badge variant="outline">Not done — {skipReasonLabel(response.skip_reason)}{response.skip_note ? `: ${response.skip_note}` : ""}</Badge></div>
                    </div>
                    <Button variant="ghost" className="min-h-11 gap-2" onClick={() => undoSkip(response, template)}>
                      <Undo2 className="h-4 w-4" /> Undo
                    </Button>
                  </div>
                );
              }
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
                  className="rounded-lg border bg-card p-3 md:p-4 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                  {!submitted && (
                    <button type="button" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground min-h-8" onClick={() => setSkipFor({ response, template })}>
                      <Ban className="h-3.5 w-3.5" /> Not done on this visit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>


      <Dialog open={!!skipFor} onOpenChange={(o) => !busy && !o && setSkipFor(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader><DialogTitle>Not done on this visit</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{skipFor?.template.name} will be left out of the checks and the report. The office will see why.</p>
          <RadioGroup value={reason} onValueChange={setReason} className="space-y-1">
            {SKIP_REASONS.map((r) => (
              <Label key={r.value} className="flex items-center gap-3 rounded-md border p-3 min-h-12 cursor-pointer font-normal">
                <RadioGroupItem value={r.value} /> {r.label}
              </Label>
            ))}
          </RadioGroup>
          {reason === "other" && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short reason" maxLength={200} />}
          <DialogFooter>
            <Button className="w-full min-h-12" onClick={confirmSkip} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Mark as not done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
