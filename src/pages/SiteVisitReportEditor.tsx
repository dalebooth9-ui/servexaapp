import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, CheckCircle2, CloudOff, FileText, Loader2, Mic, Plus, Square, Trash2, Upload, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { buildSiteVisitPrefill } from "@/lib/siteVisitReportPrefill";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef, resolveToSignedUrl } from "@/lib/durableStorageRef";
import { orientBlob } from "@/lib/exifOrient";
import InlineCamera from "@/components/paper-scan/InlineCamera";

type EventRow = { date: string; time: string; source: string; what_was_recorded: string; note: string };
type Report = Record<string, any> & { id: string; job_id: string; event_log: EventRow[] };
type Photo = { id: string; storage_ref: string; caption: string; display_order: number; url?: string | null };

const OUTCOMES = [
  { value: "completed", label: "Completed" },
  { value: "partly_completed", label: "Partly completed" },
  { value: "not_completed", label: "Not completed" },
  { value: "investigation_only", label: "Investigation only" },
];
const EDITABLE = [
  "po_reference", "client_name", "site_name", "site_address", "visit_date", "attended_by",
  "site_contact_name", "site_contact_title", "work_instructed", "outcome", "outcome_reason",
  "return_visit_required", "parts_required", "title", "raw_notes", "event_log",
  "summary", "system_description", "reason_for_visit", "findings", "conclusion", "possible_causes",
  "recommendations", "closing_note", "gaps_to_confirm", "gaps_resolved",
] as const;
const ARRAY_KEYS = new Set(["event_log", "findings", "possible_causes", "recommendations", "gaps_to_confirm", "gaps_resolved"]);
const localKey = (id: string) => `autosave_svr_${id}`;

function pick(r: Record<string, any>) {
  const o: Record<string, any> = {};
  for (const k of EDITABLE) o[k] = r[k] ?? (ARRAY_KEYS.has(k) ? [] : k === "return_visit_required" ? false : null);
  return o;
}

/** "New Site Visit Report" — one plain tablet screen, saved as a draft as you go. */
export default function SiteVisitReportEditor() {
  const { jobId, reportId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "idle">("idle");
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [view, setView] = useState<"notes" | "review">("notes");
  const [redraftOpen, setRedraftOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const { userRole } = useAuth();
  const isOffice = userRole === "admin" || userRole === "platform_admin";
  const dirty = useRef(false);
  const timer = useRef<number>();
  const creating = useRef(false);

  // ── Create (new) or load (existing) ─────────────────────────────────────
  useEffect(() => {
    if (!jobId || !user) return;
    if (reportId === "new") {
      if (creating.current) return;
      creating.current = true;
      (async () => {
        try {
          if (!navigator.onLine) throw new Error("You need signal to start a new report. Once it's started, it keeps saving on this device without signal.");
          const prefill = await buildSiteVisitPrefill(jobId, params.get("sheet"), user.id);
          const { data, error } = await supabase.from("site_visit_reports").insert(prefill as any).select("*").single();
          if (error) throw error;
          await supabase.from("job_activity_log").insert({ job_id: jobId, user_id: user.id, action: "site_visit_report_started", details: "Site Visit Report started" } as any);
          navigate(`/jobs/${jobId}/site-visit-report/${(data as any).id}`, { replace: true });
        } catch (e: any) {
          setError(e?.message || "Couldn't start the report.");
        }
      })();
      return;
    }
    (async () => {
      const { data, error } = await supabase.from("site_visit_reports").select("*").eq("id", reportId!).maybeSingle();
      let server = data as any;
      const local = (() => { try { return JSON.parse(localStorage.getItem(localKey(reportId!)) || "null"); } catch { return null; } })();
      if (!server && local?.report) server = local.report; // offline reopen
      if (!server) { setError(error?.message || "Report not found."); return; }
      if (local?.report && local.pending) {
        server = { ...server, ...pick(local.report) };
        dirty.current = true;
        scheduleSave(0);
      }
      const norm: any = { ...server };
      for (const k of ARRAY_KEYS) if (!Array.isArray(norm[k])) norm[k] = [];
      setReport(norm);
      if (norm.summary || norm.status !== "draft") setView("review");
      loadPhotos(reportId!);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, reportId, user]);

  const loadPhotos = async (id: string) => {
    const { data } = await supabase.from("site_visit_report_photos").select("id, storage_ref, caption, display_order").eq("report_id", id).order("display_order");
    const rows = ((data as any[]) || []) as Photo[];
    const withUrls = await Promise.all(rows.map(async (p) => ({ ...p, url: await resolveToSignedUrl(p.storage_ref).catch(() => null) })));
    setPhotos(withUrls);
  };

  // ── Autosave: local copy immediately, server copy debounced ─────────────
  const reportRef = useRef<Report | null>(null);
  reportRef.current = report;

  const flush = useCallback(async () => {
    const r = reportRef.current;
    if (!r || !dirty.current) return;
    if (r.status === "approved") { dirty.current = false; return; }
    if (!navigator.onLine) { setSaveState("offline"); return; }
    setSaveState("saving");
    dirty.current = false;
    const { error } = await supabase.from("site_visit_reports").update(pick(r) as any).eq("id", r.id);
    if (error) {
      dirty.current = true;
      setSaveState("offline");
      return;
    }
    localStorage.setItem(localKey(r.id), JSON.stringify({ report: r, pending: dirty.current }));
    setSaveState("saved");
  }, []);

  const scheduleSave = (delay = 1200) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  };

  useEffect(() => {
    const onUp = () => flush();
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("online", onUp);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("online", onUp); document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [flush]);

  const update = (patch: Record<string, any>) => {
    if (reportRef.current?.status === "approved") return;
    setReport((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(localKey(next.id), JSON.stringify({ report: next, pending: true }));
      return next;
    });
    dirty.current = true;
    setSaveState(navigator.onLine ? "saving" : "offline");
    scheduleSave();
  };

  const runDraft = async () => {
    const r = reportRef.current;
    if (!r) return;
    dirty.current = true;
    await flush();
    if (!navigator.onLine) {
      toast.info("Saved on this device. The report will be drafted when you have signal.");
      return;
    }
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-site-visit-report", { body: { report_id: r.id } });
      const msg = (data as any)?.error || (error ? "The AI couldn't draft the report right now." : null);
      if (msg || !(data as any)?.report) {
        toast.error(`${msg || "No report came back."} Everything you entered is saved – you can try again or fill the sections in by hand.`, { duration: 10000 });
        return;
      }
      const fresh: any = { ...(data as any).report };
      for (const k of ARRAY_KEYS) if (!Array.isArray(fresh[k])) fresh[k] = [];
      setReport((curr) => ({ ...(curr as Report), ...fresh, raw_notes: curr?.raw_notes }));
      localStorage.setItem(localKey(r.id), JSON.stringify({ report: { ...r, ...fresh }, pending: false }));
      setView("review");
      window.scrollTo({ top: 0 });
      toast.success("Report drafted. Check each section before it goes out.");
    } finally {
      setDrafting(false);
    }
  };

  const changeStatus = async (to: "draft" | "reviewed" | "approved" | "unlock") => {
    const r = reportRef.current;
    if (!r || !user) return;
    dirty.current = true;
    await flush();
    setStatusBusy(true);
    try {
      if (to === "approved") {
        const { data, error } = await supabase.rpc("approve_site_visit_report" as any, { _report_id: r.id });
        if (error) throw error;
        const n = (data as any)?.created || 0;
        toast.success(n ? `Approved. ${n} defect${n === 1 ? "" : "s"} raised for our own actions.` : "Report approved and locked.");
      } else if (to === "unlock") {
        const { error } = await supabase.rpc("unlock_site_visit_report" as any, { _report_id: r.id });
        if (error) throw error;
        toast.success("Unlocked to revise. The version number has gone up.");
      } else {
        const { error } = await supabase.from("site_visit_reports")
          .update({ status: to, reviewed_by: to === "reviewed" ? user.id : null } as any).eq("id", r.id);
        if (error) throw error;
        await supabase.from("job_activity_log").insert({ job_id: r.job_id, user_id: user.id, action: `site_visit_report_${to}`, details: `Site Visit Report marked ${to === "reviewed" ? "Reviewed" : "Draft"}` } as any);
      }
      const { data: fresh } = await supabase.from("site_visit_reports").select("*").eq("id", r.id).single();
      if (fresh) {
        const f: any = { ...fresh };
        for (const k of ARRAY_KEYS) if (!Array.isArray(f[k])) f[k] = [];
        setReport(f);
        localStorage.setItem(localKey(r.id), JSON.stringify({ report: f, pending: false }));
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change the status.");
    } finally {
      setStatusBusy(false);
    }
  };


  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" asChild><Link to={`/jobs/${jobId}`}>Back to job</Link></Button>
      </div>
    );
  }
  if (!report) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Preparing report…</div>;
  }

  const field = (key: string, label: string, opts: { type?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={key} className="text-sm">{label}</Label>
      <Input id={key} type={opts.type || "text"} className="h-11 text-base" value={report[key] ?? ""} onChange={(e) => update({ [key]: e.target.value || null })} />
    </div>
  );

  const locked = report.status === "approved";
  const jobDetailsSection = (
      <section className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Job details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("po_reference", "PO / contract reference")}
          {field("client_name", "Client")}
          {field("site_name", "Site name")}
          {field("visit_date", "Visit date", { type: "date" })}
          <div className="sm:col-span-2">{field("site_address", "Site address")}</div>
          {field("attended_by", "Attended by")}
          <div />
          {field("site_contact_name", "Site contact name")}
          {field("site_contact_title", "Site contact title")}
        </div>
      </section>
  );
  const workOutcomeSection = (
      <section className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="work_instructed">Work instructed</Label>
          <Textarea id="work_instructed" rows={2} className="text-base" value={report.work_instructed ?? ""} onChange={(e) => update({ work_instructed: e.target.value || null })} />
        </div>
        <div className="space-y-2">
          <Label>Outcome</Label>
          <RadioGroup value={report.outcome ?? ""} onValueChange={(v) => update({ outcome: v })} className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <label key={o.value} className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary">
                <RadioGroupItem value={o.value} /> <span className="text-sm">{o.label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
        {report.outcome && report.outcome !== "completed" && (
          <div className="space-y-1.5">
            <Label htmlFor="outcome_reason">Why?</Label>
            <Input id="outcome_reason" className="h-11 text-base" value={report.outcome_reason ?? ""} onChange={(e) => update({ outcome_reason: e.target.value || null })} />
          </div>
        )}
        <label className="flex items-center gap-3 py-1 cursor-pointer">
          <Checkbox checked={!!report.return_visit_required} onCheckedChange={(v) => update({ return_visit_required: !!v })} className="h-6 w-6" />
          <span>Return visit needed</span>
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="parts_required">Parts needed</Label>
          <Input id="parts_required" className="h-11 text-base" value={report.parts_required ?? ""} onChange={(e) => update({ parts_required: e.target.value || null })} />
        </div>
      </section>
  );

  const gaps: string[] = Array.isArray(report.gaps_to_confirm) ? report.gaps_to_confirm : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 pb-28 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1.5"><Link to={`/jobs/${jobId}`}><ArrowLeft className="h-4 w-4" /> Back to job</Link></Button>
        <SaveBadge state={saveState} />
      </div>
      <h1 className="text-2xl font-semibold">Site Visit Report</h1>
      {view === "review" ? (
        <ReviewScreen
          report={report} update={update} locked={locked} isOffice={isOffice} busy={statusBusy}
          onStatus={changeStatus} jobDetails={jobDetailsSection} workOutcome={workOutcomeSection}
          photos={<PhotosSection report={report} photos={photos} setPhotos={setPhotos} userId={user!.id} />}
        />
      ) : (<>
      {jobDetailsSection}
      {workOutcomeSection}
      {/* 2. Title */}
      <section className="space-y-1.5">
        <Label htmlFor="title">Report title</Label>
        <Input id="title" className="h-12 text-base" placeholder="e.g. Level 2 Sprinkler Flow Switch Alarms" value={report.title ?? ""} onChange={(e) => update({ title: e.target.value })} />
      </section>

      {/* 3. Notes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="raw_notes" className="text-base">What happened on site?</Label>
          <DictateButton jobId={report.job_id} onText={(t) => {
            const cur = reportRef.current?.raw_notes || "";
            update({ raw_notes: cur ? `${cur.replace(/\s+$/, "")}\n${t}` : t });
          }} />
        </div>
        {report.source_job_sheet_id && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Comments copied from the job sheet.{" "}
            <button type="button" className="underline text-primary" onClick={() => openSheet(report.job_id, report.source_job_sheet_id, navigate)}>Check the sheet</button>
          </p>
        )}
        {gaps.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
            {gaps.map((g, i) => <p key={i} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />{g}</p>)}
          </div>
        )}
        <Textarea id="raw_notes" rows={12} className="text-base leading-relaxed" placeholder="Rough notes are fine — what you found, what you did, what's still wrong." value={report.raw_notes ?? ""} onChange={(e) => update({ raw_notes: e.target.value || null })} />
      </section>

      {/* 4. Events / times */}
      <EventsTable rows={report.event_log} onChange={(rows) => update({ event_log: rows })} />

      {/* 5. Photos */}
      <PhotosSection report={report} photos={photos} setPhotos={setPhotos} userId={user!.id} />

      </>)}

      {/* 6. Draft report */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur p-3">
        <div className="mx-auto max-w-3xl flex justify-end">
          {view === "notes" ? (
            <Button size="lg" className="h-12 px-8 text-base" disabled={drafting} onClick={runDraft}>
              {drafting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Drafting…</> : "Draft report"}
            </Button>
          ) : (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setView("notes")}>Back to notes</Button>
              {!locked && (
                <Button variant="outline" disabled={drafting} onClick={() => setRedraftOpen(true)} className="gap-1.5">
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Redraft from notes
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function openSheet(jobId: string, responseId: string, navigate: (p: string) => void) {
  navigate(`/jobs/${jobId}`);
  supabase.from("job_sheet_responses").select("template_id").eq("id", responseId).maybeSingle().then(({ data }) => {
    const nonce = `svr-${responseId}-${Date.now()}`;
    let attempts = 0;
    const tryDispatch = () => {
      attempts++;
      const detail: Record<string, unknown> = { jobId, templateId: (data as any)?.template_id, responseId, mode: "view", nonce };
      window.dispatchEvent(new CustomEvent("job-sheet:fill-online", { detail }));
      if (!detail.handled && attempts < 16) setTimeout(tryDispatch, 300);
    };
    setTimeout(tryDispatch, 400);
  });
}

function SaveBadge({ state }: { state: string }) {
  if (state === "saving") return <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span>;
  if (state === "offline") return <span className="text-sm text-amber-600 flex items-center gap-1.5"><CloudOff className="h-4 w-4" /> Saved on this device</span>;
  if (state === "saved") return <span className="text-sm text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Draft saved</span>;
  return null;
}

function DictateButton({ jobId, onText }: { jobId: string; onText: (t: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        if (blob.size < 1000) { setState("idle"); return; }
        setState("working");
        try {
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const path = await buildOrgPathAsync(`${jobId}/dictation/${Date.now()}.${ext}`);
          const { error: upErr } = await supabase.storage.from("submissions").upload(path, blob, { contentType: type });
          if (upErr) throw upErr;
          const { data, error } = await supabase.functions.invoke("transcribe-media", { body: { file_path: path, job_id: jobId, bucket: "submissions" } });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          const text = String((data as any)?.transcript || "").trim();
          if (text) onText(text);
          else toast.info("No speech was picked up. Try again a little closer to the tablet.");
        } catch (e: any) {
          toast.error("Dictation failed — your notes are unchanged", { description: e?.message });
        } finally {
          setState("idle");
        }
      };
      mr.start();
      rec.current = mr;
      setState("recording");
    } catch {
      toast.error("Microphone not available. Check the browser's microphone permission.");
    }
  };

  if (state === "working") return <Button variant="outline" size="lg" disabled className="gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Writing it up…</Button>;
  if (state === "recording") return <Button variant="destructive" size="lg" className="gap-2" onClick={() => rec.current?.stop()}><Square className="h-5 w-5" /> Stop</Button>;
  return <Button variant="outline" size="lg" className="gap-2" onClick={start}><Mic className="h-5 w-5" /> Dictate</Button>;
}

function EventsTable({ rows, onChange }: { rows: EventRow[]; onChange: (r: EventRow[]) => void }) {
  const set = (i: number, patch: Partial<EventRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Events / times <span className="text-sm font-normal text-muted-foreground">(optional)</span></h2>
          <p className="text-sm text-muted-foreground">Panel logs and alarm histories.</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => onChange([...rows, { date: new Date().toISOString().slice(0, 10), time: "", source: "", what_was_recorded: "", note: "" }])}>
          <Plus className="h-4 w-4" /> Add row
        </Button>
      </div>
      <datalist id="svr-sources"><option value="Fire alarm panel" /><option value="Sprinkler panel" /><option value="Other" /></datalist>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[9rem_6rem_1fr_auto] items-start">
          <Input type="date" className="h-11" value={r.date} onChange={(e) => set(i, { date: e.target.value })} aria-label="Date" />
          <Input type="time" className="h-11" value={r.time} onChange={(e) => set(i, { time: e.target.value })} aria-label="Time" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input list="svr-sources" className="h-11" placeholder="Where recorded" value={r.source} onChange={(e) => set(i, { source: e.target.value })} />
            <Input className="h-11" placeholder="What was recorded" value={r.what_was_recorded} onChange={(e) => set(i, { what_was_recorded: e.target.value })} />
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </section>
  );
}

async function toUprightJpeg(file: File): Promise<Blob> {
  const oriented = await orientBlob(file);
  if (!oriented) return file;
  const img = new Image();
  img.src = oriented.dataUrl;
  await img.decode();
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.85));
}

function PhotosSection({ report, photos, setPhotos, userId }: { report: Report; photos: Photo[]; setPhotos: (fn: (p: Photo[]) => Photo[]) => void; userId: string }) {
  const [busy, setBusy] = useState(0);
  const [camOpen, setCamOpen] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const captionTimers = useRef<Record<string, number>>({});

  const add = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setBusy(list.length);
    for (const file of list) {
      try {
        const blob = await toUprightJpeg(file);
        const path = await buildOrgPathAsync(`${report.job_id}/site-visit/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`);
        const { error: upErr } = await supabase.storage.from("submissions").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const ref = buildDurableRef("submissions", path);
        const { data: sub, error: subErr } = await supabase.from("submissions").insert({ job_id: report.job_id, engineer_id: userId, type: "photo", file_url: ref, file_name: path.split("/").pop(), content: "Site Visit Report photo" } as any).select("id").single();
        if (subErr) throw subErr;
        const order = photos.length + 1;
        const { data: row, error } = await supabase.from("site_visit_report_photos").insert({ report_id: report.id, submission_id: (sub as any).id, storage_ref: ref, caption: "", display_order: order } as any).select("id, storage_ref, caption, display_order").single();
        if (error) throw error;
        setPhotos((p) => [...p, { ...(row as any), url: URL.createObjectURL(blob) }]);
      } catch (e: any) {
        toast.error(`Photo not added: ${file.name}`, { description: navigator.onLine ? e?.message : "No signal — try again when you're back online." });
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  const setCaption = (id: string, caption: string) => {
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, caption } : x)));
    window.clearTimeout(captionTimers.current[id]);
    captionTimers.current[id] = window.setTimeout(() => {
      supabase.from("site_visit_report_photos").update({ caption } as any).eq("id", id).then(() => {});
    }, 800);
  };

  const remove = async (id: string) => {
    // Unlinks from the report only — the photo stays on the job.
    await supabase.from("site_visit_report_photos").delete().eq("id", id);
    setPhotos((p) => p.filter((x) => x.id !== id));
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Photos</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="gap-2" onClick={() => setCamOpen(true)}><Camera className="h-5 w-5" /> Take photo</Button>
          <Button variant="outline" size="lg" className="gap-2" onClick={() => pickRef.current?.click()}><Upload className="h-5 w-5" /> Add photos</Button>
        </div>
        {/* In-page camera: the native camera app can make phones reload the page. */}
        {camOpen && <InlineCamera maxPages={20} onCancel={() => setCamOpen(false)} onCapture={(files: File[]) => { setCamOpen(false); add(files); }} />}
        <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {busy > 0 && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Adding {busy} photo{busy > 1 ? "s" : ""}…</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {photos.map((p) => (
          <div key={p.id} className="rounded-lg border overflow-hidden bg-card">
            {p.url ? <img src={p.url} alt={p.caption || "Site photo"} className="w-full aspect-[4/3] object-cover" /> : <div className="aspect-[4/3] bg-muted" />}
            <div className="p-2 flex gap-2">
              <Input className="h-11" placeholder="Caption" value={p.caption} onChange={(e) => setCaption(p.id, e.target.value)} />
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Remove photo from report" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
