import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send, ArrowLeft, Eye, FileText, Image as ImageIcon, Paperclip, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomerReportPdf from "@/components/CustomerReportPdf";
import { extractStoragePath } from "@/lib/fileUtils";

type JobContext = {
  reference_number?: string | null;
  name?: string | null;
  description?: string | null;
  scheduled_date?: string | null;
  priority?: string | null;
  customers?: { name?: string | null; phone?: string | null } | null;
  sites?: { name?: string | null; address?: string | null } | null;
};

type SitePhoto = {
  id: string;
  file_url: string;
  file_name: string | null;
  storagePath: string | null;
  thumbUrl: string | null;
};

type Step = "compose" | "preview" | "attachments";

const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour — Twilio fetches immediately
const MAX_TOTAL_MEDIA = 10; // Twilio WhatsApp media limit per message

export default function WhatsAppQuickSend({ jobId, jobRef }: { jobId: string; jobRef: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("compose");
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<JobContext | null>(null);
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [includePdf, setIncludePdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("anon");
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setCurrentUserId(data.user?.id || "anon");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUserId(session?.user?.id || "anon");
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // Hidden trigger used to invoke CustomerReportPdf programmatically
  const pdfTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Resolver wired up while we await the PDF generation
  const pdfResolverRef = useRef<((base64: string, fileName: string) => void) | null>(null);

  const buildDefaultMessage = (j: JobContext | null) => {
    if (!j) return "";
    const lines: string[] = [];
    lines.push(`Job ${j.reference_number || jobRef}${j.name ? ` — ${j.name}` : ""}`);
    if (j.customers?.name) lines.push(`Customer: ${j.customers.name}`);
    if (j.sites?.name || j.sites?.address) {
      lines.push(`Site: ${[j.sites?.name, j.sites?.address].filter(Boolean).join(", ")}`);
    }
    if (j.scheduled_date) {
      const d = new Date(j.scheduled_date);
      if (!isNaN(d.getTime())) lines.push(`Scheduled: ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
    }
    if (j.priority) lines.push(`Priority: ${j.priority}`);
    if (j.description) lines.push("", j.description);
    return lines.join("\n");
  };

  const loadContext = async () => {
    setLoadingEngineers(true);

    const [assignRes, jobRes, photosRes] = await Promise.all([
      supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
      supabase
        .from("jobs")
        .select("reference_number, name, description, scheduled_date, priority, customers(name, phone), sites(name, address)")
        .eq("id", jobId)
        .maybeSingle(),
      supabase
        .from("submissions")
        .select("id, file_url, file_name, type")
        .eq("job_id", jobId)
        .eq("type", "photo")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const j = (jobRes.data as JobContext | null) || null;
    setJob(j);
    setMessage(buildDefaultMessage(j));

    // Build photo previews via short signed URLs
    const photoRows = (photosRes.data as any[]) || [];
    const enriched: SitePhoto[] = [];
    for (const p of photoRows) {
      if (!p.file_url) continue;
      const storagePath = extractStoragePath(p.file_url);
      let thumbUrl: string | null = null;
      if (storagePath) {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
        thumbUrl = signed?.signedUrl || null;
      } else if (p.file_url.startsWith("http")) {
        thumbUrl = p.file_url;
      }
      enriched.push({
        id: p.id,
        file_url: p.file_url,
        file_name: p.file_name,
        storagePath,
        thumbUrl,
      });
    }
    setPhotos(enriched);

    const data = assignRes.data;
    let loaded: { id: string; name: string }[] = [];
    if (data && data.length > 0) {
      const ids = data.map((d) => d.engineer_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      loaded = (profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || p.user_id }));
    }
    setEngineers(loaded);
    setSelectedEngineer((current) => {
      const valid = current && loaded.some((e) => e.id === current) ? current : "";
      if (!valid) {
        setStep("compose");
        try { localStorage.setItem(lastStepKey, "compose"); } catch {}
      }
      return valid;
    });
    setLoadingEngineers(false);
  };

  const persistEngineer = (id: string) => {
    try {
      if (id) localStorage.setItem(lastEngineerKey, id);
    } catch {}
  };

  const lastEngineerKey = `whatsappQuickSend:lastEngineer:${jobId}`;
  const lastStepKey = `whatsappQuickSend:lastStep:${jobId}`;

  const isValidStep = (v: string | null): v is Step =>
    v === "compose" || v === "preview" || v === "attachments";

  const setStepPersist = (s: Step) => {
    setStep(s);
    try { localStorage.setItem(lastStepKey, s); } catch {}
  };

  const handleOpen = () => {
    setOpen(true);
    let initial = "";
    let initialStep: Step = "compose";
    try {
      initial = localStorage.getItem(lastEngineerKey) || "";
      const savedStep = localStorage.getItem(lastStepKey);
      if (isValidStep(savedStep)) initialStep = savedStep;
    } catch {}
    setStep(initialStep);
    setSelectedEngineer(initial);
    setMessage("");
    setJob(null);
    setPhotos([]);
    setSelectedPhotoIds(new Set());
    setIncludePdf(false);
    loadContext();
  };

  const togglePhoto = (id: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalAttachments = (includePdf ? 1 : 0) + selectedPhotoIds.size;
  const overLimit = totalAttachments > MAX_TOTAL_MEDIA;

  // Bridge: receive PDF base64 from CustomerReportPdf and resolve the awaiter
  const handlePdfGenerated = (base64: string, fileName: string) => {
    if (pdfResolverRef.current) {
      pdfResolverRef.current(base64, fileName);
      pdfResolverRef.current = null;
    }
  };

  const generateReportPdf = (): Promise<{ base64: string; fileName: string }> =>
    new Promise((resolve, reject) => {
      if (!pdfTriggerRef.current) {
        reject(new Error("Report generator unavailable"));
        return;
      }
      pdfResolverRef.current = (base64, fileName) => resolve({ base64, fileName });
      // Safety timeout
      setTimeout(() => {
        if (pdfResolverRef.current) {
          pdfResolverRef.current = null;
          reject(new Error("Report generation timed out"));
        }
      }, 60_000);
      pdfTriggerRef.current.click();
    });

  const uploadPdfAndSign = async (base64: string, fileName: string): Promise<string> => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const path = `whatsapp-attachments/${jobId}/${Date.now()}-${fileName.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error: upErr } = await supabase.storage.from("submissions").upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw upErr;
    const { data: signed, error: signErr } = await supabase.storage
      .from("submissions")
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (signErr || !signed?.signedUrl) throw signErr || new Error("Could not sign PDF URL");
    return signed.signedUrl;
  };

  const collectMediaUrls = async (): Promise<string[]> => {
    const urls: string[] = [];

    if (includePdf) {
      const { base64, fileName } = await generateReportPdf();
      const signed = await uploadPdfAndSign(base64, fileName);
      urls.push(signed);
    }

    for (const p of photos) {
      if (!selectedPhotoIds.has(p.id)) continue;
      if (urls.length >= MAX_TOTAL_MEDIA) break;
      if (p.storagePath) {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(p.storagePath, SIGNED_URL_TTL_SEC);
        if (signed?.signedUrl) urls.push(signed.signedUrl);
      } else if (p.file_url.startsWith("https://")) {
        urls.push(p.file_url);
      }
    }
    return urls.slice(0, MAX_TOTAL_MEDIA);
  };

  const handleSend = async () => {
    if (!selectedEngineer || (!message.trim() && totalAttachments === 0)) return;
    if (overLimit) {
      toast({ title: "Too many attachments", description: `WhatsApp allows up to ${MAX_TOTAL_MEDIA} files per message.`, variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const mediaUrls = await collectMediaUrls();
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { engineerId: selectedEngineer, message: message.trim(), jobId, mediaUrls },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const attachNote = mediaUrls.length ? ` with ${mediaUrls.length} attachment${mediaUrls.length === 1 ? "" : "s"}` : "";
      toast({ title: "Sent", description: `WhatsApp message sent for ${jobRef}${attachNote}.` });
      try { localStorage.removeItem(lastStepKey); } catch {}
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send message.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const recipientName = engineers.find((e) => e.id === selectedEngineer)?.name || "—";

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        className="text-muted-foreground hover:text-accent transition-colors"
        title="Send WhatsApp"
      >
        <MessageSquare className="h-4 w-4" />
      </button>

      {/* Hidden CustomerReportPdf — only mounted when dialog open and a job context exists */}
      {open && job && (
        <div className="hidden" aria-hidden="true">
          <CustomerReportPdf
            jobId={jobId}
            job={job}
            onPdfGenerated={handlePdfGenerated}
            trigger={<button ref={pdfTriggerRef} type="button">generate</button>}
          />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === "preview" ? <Eye className="h-4 w-4 text-accent" />
                : step === "attachments" ? <Paperclip className="h-4 w-4 text-accent" />
                : <Send className="h-4 w-4 text-accent" />}
              {step === "preview" ? "Preview message"
                : step === "attachments" ? "Add attachments"
                : `WhatsApp — ${jobRef}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {loadingEngineers ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : engineers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engineers assigned to this job.</p>
            ) : step === "compose" ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select value={selectedEngineer} onValueChange={(v) => { setSelectedEngineer(v); persistEngineer(v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select engineer" />
                      </SelectTrigger>
                      <SelectContent>
                        {engineers.map((eng) => (
                          <SelectItem key={eng.id} value={eng.id}>{eng.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedEngineer && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEngineer("");
                        try {
                          localStorage.removeItem(lastEngineerKey);
                          localStorage.removeItem(lastStepKey);
                        } catch {}
                        toast({ title: "Saved recipient cleared", description: "Pick a new engineer for this job." });
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive underline whitespace-nowrap"
                      title="Clear saved recipient for this job"
                    >
                      Clear saved
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Message (auto-filled with job details)</span>
                  <button
                    type="button"
                    onClick={() => setMessage(buildDefaultMessage(job))}
                    className="text-xs text-primary hover:underline"
                  >
                    Reset to default
                  </button>
                </div>

                <Textarea
                  placeholder="Type your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={8}
                  maxLength={1600}
                />
                <div className="text-right text-xs text-muted-foreground">{message.length}/1600</div>

                <Button
                  onClick={() => setStepPersist("preview")}
                  disabled={!selectedEngineer || !message.trim()}
                  className="w-full"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview before sending
                </Button>
              </>
            ) : step === "preview" ? (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>To: <span className="font-medium text-foreground">{recipientName}</span></span>
                    <span>{message.length} chars</span>
                  </div>
                  <div className="rounded-lg bg-[#dcf8c6] dark:bg-emerald-900/40 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words shadow-sm">
                    {message}
                  </div>
                  {totalAttachments > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                      {totalAttachments} attachment{totalAttachments === 1 ? "" : "s"} ready to send
                      {includePdf && <span className="ml-1">· Job report PDF</span>}
                      {selectedPhotoIds.size > 0 && <span className="ml-1">· {selectedPhotoIds.size} photo{selectedPhotoIds.size === 1 ? "" : "s"}</span>}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    This is exactly what {recipientName} will receive on WhatsApp.
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setStepPersist("attachments")}
                  disabled={sending}
                  className="w-full"
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  {totalAttachments > 0 ? `Edit attachments (${totalAttachments})` : "Add report PDF or site photos"}
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStepPersist("compose")}
                    disabled={sending}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to edit
                  </Button>
                  <Button onClick={handleSend} disabled={sending || overLimit} className="flex-1">
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {sending ? "Sending…" : `Send${totalAttachments ? ` + ${totalAttachments}` : ""}`}
                  </Button>
                </div>
              </>
            ) : (
              // step === "attachments"
              <>
                <Label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={includePdf}
                    onCheckedChange={(v) => setIncludePdf(!!v)}
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <FileText className="h-4 w-4 text-primary" />
                      Job report PDF
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Generates the full customer report (photos, parts, signatures) and attaches it.
                    </p>
                  </div>
                </Label>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      Site photos ({photos.length})
                    </p>
                    {photos.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setSelectedPhotoIds(new Set())}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {photos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No site photos uploaded for this job yet.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto rounded-md border p-2">
                      {photos.map((p) => {
                        const checked = selectedPhotoIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePhoto(p.id)}
                            className={`relative aspect-square overflow-hidden rounded-md border transition-all ${checked ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/50"}`}
                          >
                            {p.thumbUrl ? (
                              <img src={p.thumbUrl} alt={p.file_name || "photo"} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">No preview</div>
                            )}
                            {checked && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <div className="rounded-full bg-primary text-primary-foreground h-6 w-6 flex items-center justify-center text-xs font-bold">✓</div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {totalAttachments}/{MAX_TOTAL_MEDIA} attachments selected
                  {overLimit && " — WhatsApp allows up to 10 files per message."}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStepPersist("preview")} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to preview
                  </Button>
                  <Button onClick={() => setStepPersist("preview")} disabled={overLimit} className="flex-1">
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
