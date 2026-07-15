import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Variant = "sticky" | "inline" | "banner";

type Props = {
  jobId: string;
  jobStatus: string;
  jobRef?: string | null;
  isAssignedEngineer: boolean;
  variant?: Variant;
  onCompleted?: () => void;
  className?: string;
};

type DraftBlocker = {
  id: string;
  templateId: string | null;
  templateName: string;
  createdAt: string;
  untouched: boolean;
  hasSubmittedSibling: boolean;
};

type Readiness = {
  engineerSig: boolean;
  customerSig: boolean;
  formsSubmitted: number;
  drafts: DraftBlocker[];
  photos: number;
  remedialOutstanding: number;
  loading: boolean;
};

const TERMINAL = new Set(["completed", "cancelled", "archived", "rejected"]);

// A draft is "auto-clearable" if the engineer never edited it after creation
// AND a submitted response exists for the same template — nothing was captured
// there, and the same form has been properly completed elsewhere.
function isAutoClearable(d: DraftBlocker): boolean {
  return d.untouched && d.hasSubmittedSibling;
}

export default function JobCompleteAction({
  jobId,
  jobStatus,
  jobRef,
  isAssignedEngineer,
  variant = "inline",
  onCompleted,
  className,
}: Props) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [readiness, setReadiness] = useState<Readiness>({
    engineerSig: false,
    customerSig: false,
    formsSubmitted: 0,
    drafts: [],
    photos: 0,
    remedialOutstanding: 0,
    loading: true,
  });

  const canSee = userRole === "admin" || isAssignedEngineer;
  const isTerminal = TERMINAL.has(jobStatus);

  const loadReadiness = async () => {
    setReadiness((r) => ({ ...r, loading: true }));
    const [sigsRes, sheetsRes, photosRes, remedialRes, remedialItemsRes] = await Promise.all([
      supabase.from("job_signatures").select("signer_role").eq("job_id", jobId),
      supabase
        .from("job_sheet_responses")
        .select("id, template_id, status, created_at, updated_at, job_sheet_templates(name)")
        .eq("job_id", jobId),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("type", "photo"),
      // Legacy pre_completion_checklist_items — swallow errors if table absent.
      supabase
        .from("pre_completion_checklist_items" as any)
        .select("status")
        .eq("job_id", jobId)
        .then((r) => r, () => ({ data: [] as any[] })),
      // New job_remedial_items — the primary works checklist for remedial jobs.
      supabase
        .from("job_remedial_items" as any)
        .select("status")
        .eq("job_id", jobId)
        .then((r) => r, () => ({ data: [] as any[] })),
    ]);

    const sigs = sigsRes.data || [];
    const sheets = (sheetsRes.data || []) as any[];
    const remedial = (remedialRes as any).data || [];
    const remedialItems = (remedialItemsRes as any).data || [];

    const submittedTplIds = new Set(
      sheets.filter((s) => s.status === "submitted").map((s) => s.template_id),
    );
    const drafts: DraftBlocker[] = sheets
      .filter((s) => s.status === "draft")
      .map((s) => ({
        id: s.id,
        templateId: s.template_id,
        templateName: s.job_sheet_templates?.name || "Untitled form",
        createdAt: s.created_at,
        untouched: !s.updated_at || s.updated_at === s.created_at,
        hasSubmittedSibling: submittedTplIds.has(s.template_id),
      }));

    setReadiness({
      engineerSig: sigs.some((s: any) => s.signer_role === "engineer"),
      customerSig: sigs.some((s: any) => s.signer_role === "customer"),
      formsSubmitted: sheets.filter((s: any) => s.status === "submitted").length,
      drafts,
      photos: photosRes.count || 0,
      remedialOutstanding:
        remedial.filter(
          (i: any) => i.status !== "done" && i.status !== "unable" && i.status !== "completed",
        ).length
        + remedialItems.filter((i: any) => i.status === "pending").length,
      loading: false,
    });
  };

  useEffect(() => {
    if (!jobId || !canSee || isTerminal) return;
    loadReadiness();
    // Refresh when new signatures/submissions arrive
    const channel = supabase
      .channel(`job-complete-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_signatures", filter: `job_id=eq.${jobId}` },
        () => loadReadiness(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", filter: `job_id=eq.${jobId}` },
        () => loadReadiness(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_sheet_responses", filter: `job_id=eq.${jobId}` },
        () => loadReadiness(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, canSee, isTerminal]);

  if (!canSee || isTerminal) return null;

  // Split drafts: auto-clearable (untouched + submitted sibling) vs. real blockers.
  const autoClearDrafts = readiness.drafts.filter(isAutoClearable);
  const blockingDrafts = readiness.drafts.filter((d) => !isAutoClearable(d));

  const missingRequired: string[] = [];
  if (!readiness.engineerSig) missingRequired.push("Engineer signature");
  if (!readiness.customerSig) missingRequired.push("Customer signature");
  if (blockingDrafts.length > 0)
    missingRequired.push(
      `${blockingDrafts.length} job form${blockingDrafts.length === 1 ? "" : "s"} still in draft`,
    );
  if (readiness.remedialOutstanding > 0)
    missingRequired.push(
      `${readiness.remedialOutstanding} remedial item${readiness.remedialOutstanding === 1 ? "" : "s"} outstanding`,
    );

  const hasMissing = missingRequired.length > 0;
  const canProceed = !hasMissing || (userRole === "admin" && overrideReason.trim().length >= 3);

  const handleDeleteDraft = async (draftId: string) => {
    const { error } = await supabase.from("job_sheet_responses").delete().eq("id", draftId);
    if (error) {
      toast({ title: "Couldn't delete draft", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Draft deleted" });
    await loadReadiness();
  };

  const handleOpenDraft = () => {
    // Sheets are on the same job detail page — close and let the user scroll.
    setOpen(false);
    // Best-effort: hash anchor if page uses it.
    if (typeof window !== "undefined") {
      window.location.hash = "job-sheets";
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      // Auto-clear any untouched drafts that have a submitted sibling.
      if (autoClearDrafts.length > 0) {
        await supabase
          .from("job_sheet_responses")
          .delete()
          .in("id", autoClearDrafts.map((d) => d.id));
      }

      const patch: any = {
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      };
      if (hasMissing && userRole === "admin") {
        patch.completion_override_reason = overrideReason.trim();
      }
      const { error } = await supabase.from("jobs").update(patch).eq("id", jobId);
      if (error) throw error;

      // Mark today's/most recent open visit for this engineer as completed too.
      await supabase
        .from("job_visits")
        .update({ status: "completed" })
        .eq("job_id", jobId)
        .in("status", ["upcoming", "unscheduled", "overdue"]);

      // Fire customer completion email (best effort)
      supabase.functions
        .invoke("notify-customer", { body: { job_id: jobId, notification_type: "job_completed" } })
        .catch(() => {});

      toast({
        title: "Job completed",
        description: hasMissing ? "Completed with admin override." : "Nice work.",
      });
      setOpen(false);
      onCompleted?.();
    } catch (e: any) {
      toast({ title: "Couldn't complete job", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const bothSigned = readiness.engineerSig && readiness.customerSig;

  // ── Banner variant: shown on Sign-off tab once both sigs are captured ──
  if (variant === "banner") {
    if (!bothSigned) return null;
    return (
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-4",
          className,
        )}
      >
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-medium">Both signatures captured.</p>
          <p className="text-muted-foreground">Ready to close out this visit — mark the job complete?</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-green-600 hover:bg-green-700 text-white">
          Mark Job Complete
        </Button>
        {renderDialog()}
      </div>
    );
  }

  // ── Sticky footer (mobile) ──
  if (variant === "sticky") {
    return (
      <>
        <div
          className={cn(
            "md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-lg",
            className,
          )}
        >
          <Button
            onClick={() => setOpen(true)}
            className={cn(
              "w-full h-12 text-base font-semibold",
              hasMissing
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-green-600 hover:bg-green-700 text-white",
            )}
          >
            {hasMissing ? (
              <AlertTriangle className="h-5 w-5 mr-2" />
            ) : (
              <CheckCircle2 className="h-5 w-5 mr-2" />
            )}
            {hasMissing ? "Complete Job (missing items)" : "Complete Job"}
          </Button>
        </div>
        {renderDialog()}
      </>
    );
  }

  // ── Inline button (overview) ──
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={cn(
          "gap-2",
          hasMissing
            ? "bg-amber-500 hover:bg-amber-600 text-white"
            : "bg-green-600 hover:bg-green-700 text-white",
          className,
        )}
      >
        {hasMissing ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {hasMissing ? "Complete Job (review)" : "Complete Job"}
      </Button>
      {renderDialog()}
    </>
  );

  function renderDialog() {
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Complete {jobRef ? <span className="font-mono">{jobRef}</span> : "this job"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border p-3 space-y-1.5">
                  <p className="font-medium text-foreground">Captured on this job:</p>
                  <ul className="space-y-1">
                    <ReadinessLine ok={readiness.engineerSig} label="Engineer signature" />
                    <ReadinessLine ok={readiness.customerSig} label="Customer signature" />
                    <ReadinessLine
                      ok={readiness.formsSubmitted > 0 && blockingDrafts.length === 0}
                      label={`Job forms — ${readiness.formsSubmitted} submitted${
                        blockingDrafts.length > 0
                          ? `, ${blockingDrafts.length} still in draft`
                          : ""
                      }`}
                    />
                    <ReadinessLine
                      ok={readiness.photos > 0}
                      neutral={readiness.photos === 0}
                      label={`Photos — ${readiness.photos}`}
                    />
                    {readiness.remedialOutstanding > 0 && (
                      <ReadinessLine
                        ok={false}
                        label={`Remedial items outstanding — ${readiness.remedialOutstanding}`}
                      />
                    )}
                  </ul>
                </div>

                {blockingDrafts.length > 0 && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="font-medium text-foreground text-xs uppercase tracking-wide">
                      Drafts blocking completion
                    </p>
                    <ul className="space-y-1.5">
                      {blockingDrafts.map((d) => {
                        const started = new Date(d.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        });
                        return (
                          <li
                            key={d.id}
                            className="flex items-start gap-2 justify-between rounded border bg-background p-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground truncate">{d.templateName}</p>
                              <p className="text-xs text-muted-foreground">
                                Started {started}
                                {d.untouched ? " · never edited" : ""}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={handleOpenDraft}
                              >
                                Open
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleDeleteDraft(d.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {autoClearDrafts.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {autoClearDrafts.length} unused draft
                    {autoClearDrafts.length === 1 ? "" : "s"} will be cleared automatically
                    (never edited, and the same form has already been submitted).
                  </p>
                )}

                {hasMissing && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Missing before completion:
                    </p>
                    <ul className="mt-1.5 ml-5 list-disc text-amber-800 dark:text-amber-200">
                      {missingRequired.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                    {userRole === "admin" ? (
                      <div className="mt-3 space-y-1.5">
                        <Label htmlFor="override" className="text-xs">
                          Admin override reason (required to proceed)
                        </Label>
                        <Textarea
                          id="override"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="e.g. Customer left site before signing; will follow up remotely."
                          rows={2}
                          className="bg-background"
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                        Please capture the missing items, or ask an admin to complete with an override.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleComplete();
              }}
              disabled={!canProceed || submitting}
              className={cn(
                hasMissing
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-green-600 hover:bg-green-700",
              )}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {hasMissing ? "Complete with override" : "Complete Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
}

function ReadinessLine({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-foreground">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full shrink-0",
          neutral ? "bg-muted-foreground/40" : ok ? "bg-green-500" : "bg-amber-500",
        )}
      />
      <span className={cn(!ok && !neutral && "text-muted-foreground")}>{label}</span>
    </li>
  );
}
