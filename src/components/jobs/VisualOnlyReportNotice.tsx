import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchVisualOnlyByJob, logSwitch, MODE_SWITCH_PAIRS, switchReasonText, type ModeSwitchState } from "@/lib/reportModeSwitch";

/**
 * Office notice for a job whose report was switched to visual-only:
 * invoicing warning + approve/dismiss a return visit for the full test.
 */
export default function VisualOnlyReportNotice({ jobId, showInvoiceWarning = true, onChanged }: { jobId: string; showInvoiceWarning?: boolean; onChanged?: () => void }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [info, setInfo] = useState<{ responseId: string; state: ModeSwitchState } | null>(null);
  const [returnRef, setReturnRef] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const m = await fetchVisualOnlyByJob([jobId]);
    const i = m.get(jobId) || null;
    setInfo(i);
    if (i?.state.return_job_id) {
      const { data } = await supabase.from("jobs").select("reference_number").eq("id", i.state.return_job_id).maybeSingle();
      setReturnRef((data as any)?.reference_number || "return visit");
    } else setReturnRef(null);
  };
  useEffect(() => { void load(); }, [jobId]);

  if (!info || userRole !== "admin") return null;
  const pair = MODE_SWITCH_PAIRS.find((p) => p.key === info.state.pair);
  const full = pair?.fullLabel.toLowerCase() || "pressure test";

  const patchState = async (patch: Partial<ModeSwitchState>) => {
    const { data } = await supabase.from("job_sheet_responses").select("responses").eq("id", info.responseId).single();
    const r = ((data as any)?.responses || {}) as Record<string, any>;
    const { error } = await supabase.from("job_sheet_responses")
      .update({ responses: { ...r, _mode_switch: { ...r._mode_switch, ...patch } } as any } as any).eq("id", info.responseId);
    if (error) throw error;
  };

  const createReturn = async () => {
    setBusy(true);
    try {
      const { data: job, error: jErr } = await supabase.from("jobs")
        .select("name, reference_number, customer, customer_id, site_id, address, customer_po, category, priority")
        .eq("id", jobId).single();
      if (jErr) throw jErr;
      const j = job as any;
      const { data: newJob, error } = await supabase.from("jobs").insert({
        name: `${pair?.fullLabel || "Pressure test"} return visit — ${j.reference_number}`,
        description: `Return visit to carry out the ${full}. Original visit ${j.reference_number} was visual only. Reason: ${switchReasonText(info.state)}`,
        customer: j.customer, customer_id: j.customer_id, site_id: j.site_id, address: j.address,
        customer_po: j.customer_po, category: j.category, priority: j.priority || "medium",
        status: "active", source: "Return visit", created_by: user?.id,
      } as any).select("id, reference_number").single();
      if (error) throw error;
      await patchState({ return_job_id: (newJob as any).id });
      await logSwitch(jobId, user?.id, `Return visit ${(newJob as any).reference_number} created for the outstanding ${full}`, "return_visit_created");
      toast({ title: "Return visit created", description: (newJob as any).reference_number });
      setConfirm(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Couldn't create return visit", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      await patchState({ return_dismissed: true });
      await logSwitch(jobId, user?.id, `Return visit for the ${full} not needed`, "return_visit_dismissed");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200 space-y-2">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        Visual inspection only – {full} not carried out. Reason: {switchReasonText(info.state)}
      </p>
      {showInvoiceWarning && (
        <p className="pl-6">PO was for {full} – visual only completed. Check price before invoicing.</p>
      )}
      <div className="pl-6 flex flex-wrap items-center gap-2">
        {info.state.return_job_id ? (
          <span>Return visit: <Link className="underline font-medium" to={`/jobs/${info.state.return_job_id}`}>{returnRef}</Link></span>
        ) : info.state.return_dismissed ? (
          <span>Return visit marked as not needed.</span>
        ) : (
          <>
            <span>Suggested: book a return visit for the {full}.</span>
            <Button size="sm" disabled={busy} onClick={() => setConfirm(true)}><CalendarPlus className="h-4 w-4 mr-1" />Create return visit</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>Not needed</Button>
          </>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a return visit?</AlertDialogTitle>
            <AlertDialogDescription>A new job will be created for the same customer and site to carry out the {full}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void createReturn(); }}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
