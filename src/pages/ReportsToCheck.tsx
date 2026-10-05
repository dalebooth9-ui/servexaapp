import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import VisualOnlyReportNotice from "@/components/jobs/VisualOnlyReportNotice";
import { fetchVisualOnlyByJob, needsReasonReview } from "@/lib/reportModeSwitch";
import { ClipboardCheck, Loader2, Mail, Pencil, Undo2, ExternalLink } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { officeReturnToEngineer, officeSendToCustomer, officeUnlockForEdit, type CustomerChannel } from "@/lib/reportReview";

type Row = { jobId: string; ref: string; site: string; name: string; engineer: string; submittedAt: string; pdfPath: string | null; visualOnly: boolean; reasonCheck?: boolean; completedReports: number; totalReports: number };

export default function ReportsToCheck() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [channel, setChannel] = useState<CustomerChannel>("email");
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: jobs } = await supabase.from("jobs")
      .select("id, name, reference_number, customer_po, address, sites(name)")
      .eq("status", "submitted_for_review").limit(500);
    const ids = (jobs || []).map((j: any) => j.id);
    const { data: evs } = ids.length
      ? await supabase.from("report_review_events").select("job_id, actor_id, created_at, pdf_path")
          .in("job_id", ids).eq("action", "report_submitted").order("created_at", { ascending: false })
      : { data: [] as any[] };
    const latest = new Map<string, any>();
    (evs || []).forEach((e: any) => { if (!latest.has(e.job_id)) latest.set(e.job_id, e); });
    const actorIds = Array.from(new Set(Array.from(latest.values()).map((e) => e.actor_id).filter(Boolean)));
    const { data: profs } = actorIds.length
      ? await supabase.from("profiles").select("user_id, full_name").in("user_id", actorIds)
      : { data: [] as any[] };
    const switched = await fetchVisualOnlyByJob(ids);
    const { data: reportRows } = ids.length
      ? await supabase.from("job_sheet_responses").select("job_id, status").in("job_id", ids).is("archived_at", null)
      : { data: [] as any[] };
    const reportCounts = new Map<string, { completed: number; total: number }>();
    ((reportRows as any[]) || []).forEach((report) => {
      const current = reportCounts.get(report.job_id) || { completed: 0, total: 0 };
      current.total += 1;
      if (report.status === "submitted") current.completed += 1;
      reportCounts.set(report.job_id, current);
    });
    const names = new Map((profs || []).map((p: any) => [p.user_id, p.full_name]));
    const out: Row[] = (jobs || []).map((j: any) => {
      const e = latest.get(j.id);
      return {
        jobId: j.id,
        ref: j.customer_po ? `PO ${j.customer_po}` : j.reference_number || "—",
        site: j.sites?.name || j.address || "",
        name: j.name || "",
        engineer: (e && names.get(e.actor_id)) || "Engineer",
        submittedAt: e?.created_at || "",
        pdfPath: e?.pdf_path || null,
        visualOnly: switched.has(j.id),
        reasonCheck: needsReasonReview(switched.get(j.id)?.state || null),
        completedReports: reportCounts.get(j.id)?.completed || 0,
        totalReports: reportCounts.get(j.id)?.total || 0,
      };
    });
    out.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)); // oldest first
    setRows(out);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openRow = async (r: Row) => {
    setOpen(r); setPdfUrl(null);
    if (!r.pdfPath) return;
    const { data } = await supabase.storage.from("submissions").createSignedUrl(r.pdfPath, 3600);
    setPdfUrl(data?.signedUrl || null);
  };

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    if (!open) return;
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
      setOpen(null); setReturnOpen(false); setReason("");
      load();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Reports to check</h1>
        <p className="text-sm text-muted-foreground">Reports engineers have submitted, oldest first.</p>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : rows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Nothing waiting — all caught up.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.jobId} className="p-3 flex flex-wrap items-center gap-3 cursor-pointer hover:border-primary/60" onClick={() => openRow(r)}>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate"><span className="font-mono">{r.ref}</span> — {r.site}
                  {r.visualOnly && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-800 dark:text-amber-300">Pressure test outstanding</Badge>}
                  {r.reasonCheck && <Badge variant="outline" className="ml-2">Reason to check</Badge>}</p>
                <p className="text-xs text-muted-foreground truncate">{r.name} · {r.engineer}{r.submittedAt && ` · ${format(new Date(r.submittedAt), "dd/MM/yyyy HH:mm")}`}</p>
                {r.totalReports > 0 && r.completedReports < r.totalReports && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{r.completedReports} of {r.totalReports} reports completed</p>
                )}
              </div>
              <Button size="sm" variant="outline">Open</Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && !busy && setOpen(null)}>
        <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] h-[92dvh] flex flex-col">
          <DialogHeader><DialogTitle>{open?.ref} — {open?.site}</DialogTitle></DialogHeader>
          {open?.visualOnly && <VisualOnlyReportNotice jobId={open.jobId} />}
          <div className="flex-1 min-h-0 rounded border bg-muted/30">
            {pdfUrl ? <iframe src={pdfUrl} title="Report PDF" className="w-full h-full rounded" />
              : <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{open?.pdfPath ? "Loading PDF…" : "No PDF on file"}</div>}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {open && <Button variant="ghost" asChild><Link to={`/jobs/${open.jobId}`}><ExternalLink className="h-4 w-4 mr-1" />Open job</Link></Button>}
            <Button variant="outline" disabled={!!busy} onClick={() => setReturnOpen(true)}><Undo2 className="h-4 w-4 mr-1" />Return to engineer</Button>
            <Button variant="outline" disabled={!!busy} onClick={() => open && run("edit", () => officeUnlockForEdit(open.jobId), "Report unlocked for editing")}>
              {busy === "edit" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pencil className="h-4 w-4 mr-1" />}Edit
            </Button>
            <Button disabled={!!busy || !open?.pdfPath} onClick={() => setSendOpen(true)}>
              {busy === "send" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}Send to customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={(o) => !busy && setReturnOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Return to engineer</DialogTitle></DialogHeader>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs changing?" maxLength={2000} />
          <DialogFooter>
            <Button disabled={!reason.trim() || !!busy} onClick={() => open && run("return", () => officeReturnToEngineer(open.jobId, reason.trim()), "Returned to engineer")}>
              {busy === "return" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={(o) => !busy && setSendOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send report to customer</DialogTitle></DialogHeader>
          <RadioGroup value={channel} onValueChange={(v) => setChannel(v as CustomerChannel)} className="gap-3">
            {([["email", "Email", "Sends the PDF to the site or customer contact email."],
               ["whatsapp", "WhatsApp", "Sends the PDF to the site or customer contact phone number."],
               ["both", "Email and WhatsApp", "Sends it both ways."]] as const).map(([v, label, hint]) => (
              <label key={v} htmlFor={`ch-${v}`} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <RadioGroupItem value={v} id={`ch-${v}`} className="mt-0.5" />
                <span><span className="font-medium block">{label}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button
              disabled={!!busy || !open?.pdfPath}
              onClick={() => open?.pdfPath && run("send", async () => {
                await officeSendToCustomer(open.jobId, open.pdfPath!, channel);
                setSendOpen(false);
              }, "Sent to customer ✓")}
            >
              {busy === "send" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
