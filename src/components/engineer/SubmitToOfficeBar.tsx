import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, Loader2, MessageSquare, Send, AlertTriangle, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { drainSubmitQueue, getReportCompletionSummary, isQueued, markUntouchedReportsNotUsed, messageOffice, queueSubmit, submitToOffice } from "@/lib/reportReview";
import { useAuth } from "@/hooks/useAuth";
import SignatureCapture from "@/components/SignatureCapture";
import { PenLine } from "lucide-react";

type Props = { jobId: string; jobStatus?: string; canAct: boolean; onStatusChanged?: (s: string) => void };

export default function SubmitToOfficeBar({ jobId, jobStatus, canAct, onStatusChanged }: Props) {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "queued">(() => (isQueued(jobId) ? "queued" : "idle"));
  const [missing, setMissing] = useState<string[]>([]);
  const [unfinishedOpen, setUnfinishedOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const { user } = useAuth();
  const [returned, setReturned] = useState<string | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const submitRef = useRef<() => void>(() => {});
  const alreadySubmitted = jobStatus === "submitted_for_review" || jobStatus === "completed";

  useEffect(() => {
    supabase.from("job_sheet_responses").select("returned_reason").eq("job_id", jobId).not("returned_reason", "is", null).limit(1)
      .then(({ data }) => setReturned((data as any[])?.[0]?.returned_reason || null));
    const onOnline = () => drainSubmitQueue();
    const onDone = (e: Event) => {
      if ((e as CustomEvent).detail?.jobId === jobId) { setState("sent"); onStatusChanged?.("submitted_for_review"); }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("report-review:submitted", onDone);
    drainSubmitQueue();
    const onRun = () => { document.getElementById("submit-to-office")?.scrollIntoView({ behavior: "smooth", block: "center" }); submitRef.current(); };
    window.addEventListener("submit-to-office:run", onRun);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("report-review:submitted", onDone); window.removeEventListener("submit-to-office:run", onRun); };
  }, [jobId, onStatusChanged]);

  const submit = async (unfinishedConfirmed = false) => {
    const requestId = `${jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!navigator.onLine) {
      queueSubmit(jobId, requestId);
      setState("queued");
      toast({ title: "Waiting to send", description: "No signal — it sends by itself when signal returns." });
      return;
    }
    setState("busy");
    try {
      const [reportSummary, sigs, remed] = await Promise.all([
        getReportCompletionSummary(jobId),
        supabase.from("job_signatures").select("signer_role").eq("job_id", jobId),
        supabase.from("job_remedial_items" as any).select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("status", "pending"),
      ]);
      const required: string[] = [];
      if (!((sigs.data as any[]) || []).some((x) => x.signer_role === "engineer")) required.push("Engineer signature");
      if ((remed as any).count > 0) required.push(`${(remed as any).count} remedial item(s) outstanding`);
      if (required.length) { setMissing(required); setState("idle"); return; }
      setMissing([]);
      if (reportSummary.unfinishedIds.length > 0 && !unfinishedConfirmed) {
        setState("idle");
        setUnfinishedOpen(true);
        return;
      }
      await markUntouchedReportsNotUsed(reportSummary.untouchedIds);
      if (user) {
        await supabase.from("jobs").update({ completed_at: new Date().toISOString(), completed_by: user.id } as any).eq("id", jobId);
        await supabase.from("job_visits").update({ status: "completed" }).eq("job_id", jobId).in("status", ["upcoming", "unscheduled", "overdue"]);
      }
      const res = await submitToOffice(jobId, requestId);
      setState("sent");
      setReturned(null);
      toast({ title: "Sent to office ✓" });
      window.dispatchEvent(new CustomEvent("report-review:submitted", { detail: { jobId } }));
      onStatusChanged?.("submitted_for_review");
      if (!res?.officeEmailConfigured) toast({ title: "Submitted", description: "No office email is set up, so the office wasn't emailed — it's in their Reports to check list." });
    } catch (e: any) {
      if (!navigator.onLine || /fetch|network|send/i.test(String(e?.message))) {
        queueSubmit(jobId, requestId);
        setState("queued");
      } else {
        setState("idle");
        toast({ title: "Could not submit", description: e?.message, variant: "destructive" });
      }
    }
  };

  submitRef.current = submit;

  const sendMessage = async () => {
    setSending(true);
    try {
      await messageOffice(jobId, msg.trim(), photos);
      toast({ title: "Message sent to office ✓" });
      setMsg(""); setPhotos([]); setMsgOpen(false);
    } catch (e: any) {
      toast({ title: "Message not sent", description: e?.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const showSent = state === "sent" || (alreadySubmitted && state !== "queued");

  return (
    <section id="submit-to-office" className="rounded-2xl border bg-card p-4 md:p-5 shadow-sm space-y-3">
      {returned && !showSent && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <Undo2 className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div><p className="font-medium">Returned by the office</p><p className="text-muted-foreground">{returned}</p></div>
        </div>
      )}
      {showSent ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
          <div><p className="font-semibold">Sent to office ✓</p><p className="text-xs text-muted-foreground">The report is locked while the office checks it.</p></div>
        </div>
      ) : state === "queued" ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <Clock className="h-6 w-6 text-muted-foreground shrink-0" />
          <div><p className="font-semibold">Waiting for signal</p><p className="text-xs text-muted-foreground">You can carry on; it sends by itself once you have signal.</p></div>
        </div>
      ) : (
        <Button size="lg" className="w-full min-h-14 text-base font-semibold gap-2" disabled={!canAct || state === "busy"} onClick={() => void submit()}>
          {state === "busy" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {state === "busy" ? "Completing & sending…" : "Complete & submit to office"}
        </Button>
      )}
      {missing.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-3">
          <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4 text-destructive" /> Fill these in first:</p>
          <ul className="list-disc pl-5 space-y-1">{missing.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      <Button variant="outline" size="lg" className="w-full min-h-12 gap-2" disabled={!canAct} onClick={() => setMsgOpen(true)}>
        <MessageSquare className="h-5 w-5" /> Message office
      </Button>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" /> Sign off</DialogTitle></DialogHeader>
          <SignatureCapture jobId={jobId} signerRole="engineer" heading="Engineer sign-off" filterByRole />
          <div className="border-t pt-3"><SignatureCapture jobId={jobId} signerRole="customer" heading="Customer sign-off (optional)" filterByRole /></div>
          <DialogFooter><Button className="w-full min-h-12" onClick={() => setSignOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unfinishedOpen} onOpenChange={setUnfinishedOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
          <DialogHeader><DialogTitle>This report isn't finished. Complete the job anyway?</DialogTitle></DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUnfinishedOpen(false)}>Go back</Button>
            <Button onClick={() => { setUnfinishedOpen(false); void submit(true); }}>Yes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={msgOpen} onOpenChange={(o) => !sending && setMsgOpen(o)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg">
          <DialogHeader><DialogTitle>Message office</DialogTitle></DialogHeader>
          <Textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type your message…" maxLength={5000} />
          <Input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 6))} />
          {photos.length > 0 && <p className="text-xs text-muted-foreground">{photos.length} photo(s) attached</p>}
          <DialogFooter>
            <Button onClick={sendMessage} disabled={sending || !msg.trim()} className="w-full gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
