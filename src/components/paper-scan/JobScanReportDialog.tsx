// JobScanReportDialog — "Scan Paper Report" from a job the engineer is on.
//
// Difference from the admin Quick Scan (/paper-scans): the job is already
// known, so there is no job matching, no customer/site guessing and no
// paper_scan_batches queue row. Flow is:
//
//   capture pages → classify-job-sheet-template → runScanExtraction
//     → ScanReviewPanel (original scan beside the extracted fields)
//     → saveJobScanReport (original pages + digital report, both on this job)
//
// When the classifier can't match a template we NEVER guess — the engineer
// picks the report type from a list and we re-read with that template.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  ScanLine,
  Upload,
  X,
} from "lucide-react";
import ScanReviewPanel from "@/components/ScanReviewPanel";
import { fileToScanPayload, runScanExtraction } from "@/lib/scanPipeline";
import { saveJobScanReport } from "@/lib/jobScanReportSave";
import { renderPdfToJpegFilesDetailed } from "@/lib/pdfToImages";
import {
  buildJobSheetPrefill,
  fetchJobPrefillContext,
  formatDateForField,
  type PrefillJobInfo,
} from "@/lib/jobSheetPrefill";

const MAX_PAGES = 8;

/** Below this the classifier is guessing — ask the engineer instead. */
const TEMPLATE_CONFIDENCE_MIN = 0.55;

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  allow_notes?: boolean;
};

type TemplateRow = {
  id: string;
  name: string;
  fields: TemplateField[];
  job_category?: string | null;
  category?: string | null;
};

type Page = { file: File; preview: string };

type Step = "upload" | "processing" | "review" | "saving" | "done";

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Fired once the code-split dialog has mounted, so the launcher can drop
   *  its "Opening scanner…" state. */
  onReady?: () => void;
  /** Files captured before the dialog opened (from the button's camera input).
   *  When provided, the dialog skips the upload step and processes them
   *  immediately on mount. */
  initialFiles?: File[];
}

/** Turn an uploaded PDF into page images using the locally bundled reader —
 *  no CDN fetch, so it still works on a weak site connection. */
async function pdfToPageFiles(pdf: File, limit: number): Promise<File[]> {
  const report = await renderPdfToJpegFilesDetailed(pdf, { maxPages: limit });
  if (report.fatal) throw new Error(report.fatal);
  if (report.pages.length === 0) {
    throw new Error(
      report.errors[0] || "No readable pages were found in that PDF.",
    );
  }
  return report.pages.slice(0, limit);
}

/** Header strip values the review panel shows, taken from the job itself so the
 *  engineer never retypes what we already know. OCR values win when present. */
function buildHeaderPrefill(info: PrefillJobInfo | null): Record<string, string> {
  if (!info) return {};
  const site = info.site;
  const address = site?.address || info.address || "";
  const postcode = site?.postcode || "";
  const fullAddress = postcode && !address.toLowerCase().includes(postcode.toLowerCase())
    ? [address, postcode].filter(Boolean).join(", ")
    : address;
  const siteName = site?.name || info.name || "";
  const out: Record<string, string> = {
    customer: info.customers?.name || info.customer || "",
    site: [siteName, fullAddress].filter(Boolean).join(", "),
    engineer: (info.engineers || []).join(", "),
    date: info.scheduledDate || new Date().toLocaleDateString("en-GB"),
    po_ref: info.reference_number || "",
    riser_location: site?.riser_location || "",
  };
  Object.keys(out).forEach((k) => {
    if (!out[k]) delete out[k];
  });
  return out;
}

/** Merge: anything the scan actually read wins; job data only fills blanks. */
function mergeBlanks(
  scanned: Record<string, any>,
  prefill: Record<string, any>,
): Record<string, any> {
  const out = { ...prefill, ...{} };
  Object.entries(scanned).forEach(([k, v]) => {
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (!empty) out[k] = v;
  });
  return out;
}



export default function JobScanReportDialog({
  jobId,
  open,
  onOpenChange,
  onSaved,
  onReady,
  initialFiles,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  // Flip true once each mount-time fetch settles — the initial auto-process
  // waits for both so it never runs against an empty job context.
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);

  useEffect(() => {
    onReady?.();
    // Only on mount — the launcher just needs to know the dialog is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the dialog opens with files captured BEFORE it mounted (the mobile
  // button's camera input lives on the job page, outside any dialog), load
  // them and start reading straight away. The files arrive as a prop, so
  // there is no state/effect race — but we wait for the job context and the
  // job's report types to load first, so the header pre-fill and the
  // "use the job's own template, never guess" logic apply to this first pass.
  const initialProcessed = useRef(false);
  useEffect(() => {
    if (!initialFiles?.length || initialProcessed.current) return;
    if (!templatesLoaded || !contextLoaded) return;
    initialProcessed.current = true;
    const pageEntries = initialFiles
      .slice(0, MAX_PAGES)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPages(pageEntries);
    setStatusMsg("Processing image…");
    void Promise.resolve()
      .then(() => handleProcess(pageEntries.map((p) => p.file)))
      .catch((err) => {
        console.error("[JobScanReportDialog] initial auto-process failed", err);
        setStep("upload");
        setStatusMsg("");
        const msg = describeError(
          err,
          "Please tap 'Read the sheet' to try again.",
        );
        setErrorMsg(msg);
        toast({ title: "Couldn't process", description: msg, variant: "destructive" });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles, templatesLoaded, contextLoaded]);

  const [pages, setPages] = useState<Page[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<TemplateRow[]>([]);
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [needsManualTemplate, setNeedsManualTemplate] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, any>>({});
  const [header, setHeader] = useState<Record<string, any>>({});
  const [savedCount, setSavedCount] = useState(0);
  const [jobTemplates, setJobTemplates] = useState<TemplateRow[]>([]);
  const [jobInfo, setJobInfo] = useState<PrefillJobInfo | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const payloadCache = useRef<
    Map<File, { image_base64: string; mime_type?: string }>
  >(new Map());

  // Template list for the manual fallback / switcher.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("job_sheet_templates")
        .select("id, name, fields, job_category, category, status")
        .order("name");
      const rows = ((data as any[]) || [])
        .filter((t) => (t.status ?? "published") !== "draft")
        .filter((t) => t.category !== "rams")
        .map((t) => ({
          id: t.id as string,
          name: t.name as string,
          job_category: t.job_category ?? null,
          category: t.category ?? null,
          fields: (typeof t.fields === "string"
            ? JSON.parse(t.fields)
            : t.fields || []) as TemplateField[],
        }));
      setAllTemplates(rows);

      // Templates already assigned to THIS job (attached sheets + per-job
      // locks). When the job knows its report type we use it instead of
      // asking the classifier to guess.
      const [respRes, lockRes] = await Promise.all([
        supabase
          .from("job_sheet_responses")
          .select("template_id")
          .eq("job_id", jobId),
        supabase
          .from("job_template_locks")
          .select("template_id")
          .eq("job_id", jobId),
      ]);
      const ids = Array.from(
        new Set(
          [
            ...(((respRes.data as any[]) || []).map((r) => r.template_id)),
            ...(((lockRes.data as any[]) || []).map((r) => r.template_id)),
          ].filter(Boolean) as string[],
        ),
      );
      setJobTemplates(ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as TemplateRow[]);
    })()
      .catch((e) => {
        console.warn("[JobScanReportDialog] template list fetch failed", e);
      })
      .finally(() => setTemplatesLoaded(true));
  }, [open, jobId]);

  // Job context used to pre-fill the header and any blank template fields.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const ctx = await fetchJobPrefillContext(supabase, jobId);
        setJobInfo(ctx);
      } catch (e) {
        console.warn("[JobScanReportDialog] job context fetch failed", e);
      }
    })().finally(() => setContextLoaded(true));
  }, [open, jobId]);

  const reset = useCallback(() => {
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
    payloadCache.current = new Map();
    setStep("upload");
    setStatusMsg("");
    setErrorMsg(null);
    setTemplate(null);
    setNeedsManualTemplate(false);
    setExtracted({});
    setHeader({});
    setSavedCount(0);
  }, []);

  const handleClose = (next: boolean) => {
    // Never dismiss mid-process/mid-save — a stray outside tap must not
    // interrupt an in-flight scan.
    if (!next && (step === "processing" || step === "saving")) return;
    if (!next) reset();
    onOpenChange(next);
  };

  // Mobile (pre-captured files) overlay: the phone's back gesture reaches us
  // as Escape. Swallow it so the overlay survives, and only close on the
  // engineer's explicit close — never mid-scan.
  const isMobileOverlay = Boolean(initialFiles?.length);
  useEffect(() => {
    if (!isMobileOverlay || !open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (step !== "processing" && step !== "saving") {
        handleClose(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileOverlay, open, step]);

  const addFiles = async (files: File[]) => {
    setErrorMsg(null);
    if (files.length === 0) return;
    // Phone cameras don't always report a MIME type (and iOS may hand over
    // HEIC), so fall back to the file extension instead of silently dropping
    // the page — that looked like "nothing happened" on site.
    const isPdf = (f: File) =>
      f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    const looksLikeImage = (f: File) =>
      f.type.startsWith("image/") ||
      /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i.test(f.name) ||
      !f.type;
    const images = files.filter((f) => !isPdf(f) && looksLikeImage(f));
    const pdfs = files.filter(isPdf);
    const ignored = files.filter((f) => !isPdf(f) && !looksLikeImage(f));
    const empties = images.filter((f) => f.size === 0);
    if (ignored.length > 0) {
      setErrorMsg(
        `Couldn't use ${ignored.length} file(s) — add photos of the sheet or a PDF.`,
      );
      toast({
        title: "Some files couldn't be used",
        description: "Add photos of the sheet (JPG/PNG) or a PDF.",
        variant: "destructive",
      });
    }
    if (empties.length > 0) {
      toast({
        title: "A photo came through empty",
        description: "Please retake it — the camera didn't save an image.",
        variant: "destructive",
      });
    }

    // Count against the live page list, not the value captured at click time:
    // rapid taps on a slow phone used to slip past the page limit.
    const usable = images.filter((f) => f.size > 0);
    if (usable.length > 0) {
      setPages((prev) => {
        const room = Math.max(0, MAX_PAGES - prev.length);
        if (room === 0) {
          toast({
            title: `Maximum ${MAX_PAGES} pages`,
            description: "Remove a page before adding another.",
          });
          return prev;
        }
        const next = usable
          .slice(0, room)
          .map((file) => ({ file, preview: URL.createObjectURL(file) }));
        return [...prev, ...next];
      });
    }

    for (const pdf of pdfs) {
      try {
        setStatusMsg("Reading PDF pages…");
        const pageFiles = await pdfToPageFiles(pdf, MAX_PAGES);
        setPages((prev) => {
          const room = Math.max(0, MAX_PAGES - prev.length);
          return [
            ...prev,
            ...pageFiles.slice(0, room).map((file) => ({
              file,
              preview: URL.createObjectURL(file),
            })),
          ];
        });
      } catch (err: any) {
        console.error("[JobScanReportDialog] pdf read failed", err);
        const reason = err?.message ? ` (${err.message})` : "";
        setErrorMsg(`Couldn't read that PDF${reason}.`);
        toast({
          title: "Could not read that PDF",
          description: "Photograph the sheet or upload a JPG/PNG instead.",
          variant: "destructive",
        });
      } finally {
        setStatusMsg("");
      }
    }
  };

  const removePage = (idx: number) => {
    setPages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const loadTemplateById = (id: string): TemplateRow | null =>
    allTemplates.find((t) => t.id === id) || null;

  /** Convert each page once and reuse it for classify + extract — re-encoding
   *  several phone photos twice is slow and memory-heavy on a handset. */
  const buildPayloads = async (files: File[]) => {
    const out: { image_base64: string; mime_type?: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const cached = payloadCache.current.get(file);
      if (cached) {
        out.push(cached);
        continue;
      }
      setStatusMsg(`Preparing page ${i + 1} of ${files.length}…`);
      const payload = await fileToScanPayload(file);
      const entry = {
        image_base64: payload.image_base64,
        mime_type: payload.mime_type,
      };
      payloadCache.current.set(file, entry);
      out.push(entry);
    }
    return out;
  };

  const extractWithTemplate = async (tpl: TemplateRow, files: File[]) => {
    const images = await buildPayloads(files);
    setStatusMsg(`Running OCR — reading the fields off the sheet (${tpl.name})…`);
    const result = await runScanExtraction({
      images,
      templateName: tpl.name,
      fields: tpl.fields as any,
    });
    // Fill anything the sheet didn't give us from the job itself — the
    // engineer shouldn't retype the customer, site, date or reference.
    const fieldPrefill = buildJobSheetPrefill(
      (tpl.fields || []) as any,
      jobInfo as any,
      tpl.name,
    );
    const datedPrefill: Record<string, any> = {};
    (tpl.fields || []).forEach((f) => {
      const v = fieldPrefill[f.id];
      if (v === undefined) return;
      datedPrefill[f.id] =
        typeof v === "string" ? formatDateForField(f.type, v) || v : v;
    });
    setExtracted(mergeBlanks(result.extracted || {}, datedPrefill));
    setHeader(mergeBlanks(result.header || {}, buildHeaderPrefill(jobInfo)));
    setTemplate(tpl);
    setStep("review");
  };

  /** Turn whatever a failing call gives us into something an engineer can act
   *  on — network and edge-function errors often carry no useful message. */
  const describeError = (e: any, fallback: string): string => {
    const raw = String(e?.message || e?.error || "").trim();
    if (!raw) return fallback;
    if (/failed to fetch|network|load failed|timeout|aborted/i.test(raw)) {
      return "Lost connection while reading the sheet. Check your signal and try again — your photos are still here.";
    }
    return raw;
  };

  const handleProcess = async (filesToProcess?: File[]) => {
    // The camera flow passes the picked files explicitly so this can never
    // read a stale `pages` array mid-render. The manual "Read the sheet"
    // button omits the argument and uses whatever is currently listed.
    const files = filesToProcess ?? pages.map((p) => p.file);
    if (files.length === 0) {
      toast({ title: "Add a photo first", description: "Take a photo of the sheet, then try again.", variant: "destructive" });
      return;
    }
    setStatusMsg("Processing image…");
    setStep("processing");
    setErrorMsg(null);
    setNeedsManualTemplate(false);
    try {
      // The job already knows its report type — use it rather than asking the
      // classifier to work it out from the photo.
      if (jobTemplates.length === 1) {
        await extractWithTemplate(jobTemplates[0], files);
        return;
      }
      if (jobTemplates.length > 1) {
        setNeedsManualTemplate(true);
        setStep("upload");
        setStatusMsg("");
        setErrorMsg(
          "This job has more than one report. Choose which sheet you've scanned.",
        );
        return;
      }

      const payloads = await buildPayloads(files);
      setStatusMsg("Working out which report this is…");
      const { data: cls, error: clsErr } = await supabase.functions.invoke(
        "classify-job-sheet-template",
        { body: { images: payloads } },
      );
      if (clsErr) throw new Error(clsErr.message || "Classification failed");
      if ((cls as any)?.error) throw new Error((cls as any).error);

      const candidates: Array<{
        template_id: string;
        name?: string;
        confidence?: number;
      }> = cls?.candidates || [];
      const top = candidates[0];
      const confident =
        typeof top?.confidence === "number"
          ? top.confidence >= TEMPLATE_CONFIDENCE_MIN
          : false;
      const tpl = top?.template_id ? loadTemplateById(top.template_id) : null;

      // Never guess: an unsure match goes to the engineer, not into the report.
      if (!tpl || !confident) {
        setNeedsManualTemplate(true);
        setStep("upload");
        setStatusMsg("");
        setErrorMsg(
          tpl
            ? `Not certain this is a "${tpl.name}". Confirm the report type below and we'll read it with that.`
            : "Couldn't tell which report this is. Pick the report type below and we'll read it with that.",
        );
        return;
      }
      await extractWithTemplate(tpl, files);
    } catch (e: any) {
      console.error("[JobScanReportDialog] process failed", e);
      setStep("upload");
      setStatusMsg("");
      setNeedsManualTemplate(true);
      const msg = describeError(
        e,
        "Couldn't read the sheet. Try a clearer, straight-on photo in good light.",
      );
      setErrorMsg(msg);
      toast({
        title: "Couldn't read the sheet",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleManualTemplate = async (id: string) => {
    const tpl = loadTemplateById(id);
    if (!tpl || pages.length === 0) return;
    setStep("processing");
    setErrorMsg(null);
    try {
      await extractWithTemplate(tpl, pages.map((p) => p.file));
    } catch (e: any) {
      console.error("[JobScanReportDialog] manual extract failed", e);
      setStep("upload");
      setNeedsManualTemplate(true);
      const msg = describeError(
        e,
        "Couldn't read the sheet with that report type.",
      );
      setErrorMsg(msg);
      toast({
        title: "Couldn't read the sheet",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setStatusMsg("");
    }
  };

  const handleConfirm = async (
    fields: Record<string, any>,
    hdr: Record<string, any>,
    fieldNotes: Record<string, string>,
  ) => {
    if (!template || !user) return;
    setStep("saving");
    setStatusMsg("Saving the scan and the report…");
    try {
      const result = await saveJobScanReport({
        jobId,
        templateId: template.id,
        templateName: template.name,
        userId: user.id,
        images: pages.map((p) => p.file),
        responses: fields,
        header: hdr,
        fieldNotes,
      });
      setSavedCount(result.uploadedPages);

      if (result.responseError) {
        toast({
          title: "Scan saved, report not saved",
          description: `${result.uploadedPages} page(s) are on the job, but the digital report failed: ${result.responseError}`,
          variant: "destructive",
        });
        setStep("review");
        setStatusMsg("");
        return;
      }
      if (result.failedPages > 0) {
        toast({
          title: "Report saved, some pages failed",
          description: `${result.failedPages} page(s) didn't upload${
            result.pageErrors[0] ? ` — ${result.pageErrors[0]}` : ""
          }. Try adding them again from Documents.`,
          variant: "destructive",
        });
      }
      setStep("done");
      setStatusMsg("");
      onSaved?.();
    } catch (e: any) {
      console.error("[JobScanReportDialog] save failed", e);
      setStep("review");
      setStatusMsg("");
      toast({
        title: "Couldn't save",
        description: describeError(e, "Please try again."),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] sm:w-full max-w-4xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6"
        // On mobile the native camera app backgrounds the browser; when it
        // resumes, Radix's outside-interaction listeners can fire and dismiss
        // the dialog before the camera input's onChange runs. Block auto-dismiss.
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scan Paper Report
          </DialogTitle>
          <DialogDescription>
            Photograph the completed paper sheet. It's filed on this job as a
            document and turned into a digital report you can check first.
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                e.target.value = "";
                if (picked.length === 0) {
                  toast({
                    title: "No photo received",
                    description: "The camera didn't return a picture. Please try again.",
                    variant: "destructive",
                  });
                  return;
                }
                setStatusMsg("Processing image…");
                void addFiles(picked)
                  .then(() => {
                    setStatusMsg("");
                    // Start reading straight away — engineers expected the
                    // scan to run after taking the photo, not wait for a tap.
                    // The picked files go in explicitly, so there is no
                    // effect/state race that could see an empty page list.
                    return handleProcess(picked);
                  })
                  .catch((err) => {
                    console.error("[JobScanReportDialog] auto-process failed", err);
                    setStep("upload");
                    setStatusMsg("");
                    const msg = describeError(
                      err,
                      "Please tap 'Read the sheet' to try again.",
                    );
                    setErrorMsg(msg);
                    toast({ title: "Couldn't process", description: msg, variant: "destructive" });
                  });
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                size="lg"
                className="h-16 text-base gap-2"
                onClick={() => cameraRef.current?.click()}
                disabled={pages.length >= MAX_PAGES}
              >
                <Camera className="h-5 w-5" />
                Take photo
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-16 text-base gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={pages.length >= MAX_PAGES}
              >
                <Upload className="h-5 w-5" />
                Upload image or PDF
              </Button>
            </div>

            {statusMsg && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {statusMsg}
              </p>
            )}

            {pages.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {pages.length} page{pages.length === 1 ? "" : "s"} (max{" "}
                  {MAX_PAGES})
                </Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {pages.map((p, i) => (
                    <div
                      key={p.preview}
                      className="relative rounded border overflow-hidden bg-muted"
                    >
                      <img
                        src={p.preview}
                        alt={`Page ${i + 1}`}
                        className="w-full h-28 object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px]">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove page ${i + 1}`}
                        className="absolute top-1 right-1 rounded-full bg-background/90 p-1"
                        onClick={() => removePage(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {needsManualTemplate && pages.length > 0 && (
              <div className="space-y-2">
                <Label>Report type</Label>
                <Select onValueChange={handleManualTemplate}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Choose the report type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(jobTemplates.length > 0 ? jobTemplates : allTemplates).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              size="lg"
              className="w-full h-14 text-base gap-2"
              disabled={pages.length === 0}
              onClick={() => handleProcess()}
            >
              <ScanLine className="h-5 w-5" />
              Read the sheet
            </Button>
          </div>
        )}

        {/* ── Processing ─────────────────────────────────────────── */}
        {(step === "processing" || step === "saving") && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">{statusMsg || "Working…"}</p>
            <p className="text-xs text-muted-foreground">
              This can take up to a minute on a slow signal.
            </p>
          </div>
        )}

        {/* ── Review ─────────────────────────────────────────────── */}
        {step === "review" && template && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <FileText className="h-3 w-3" />
                {template.name}
              </Badge>
              <Select value={template.id} onValueChange={handleManualTemplate}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder="Change report type" />
                </SelectTrigger>
                <SelectContent>
                  {allTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScanReviewPanel
              imagePreviews={pages.map((p) => p.preview)}
              extractedFields={extracted}
              extractedHeader={header}
              templateFields={template.fields}
              templateName={template.name}
              jobId={jobId}
              templateId={template.id}
              onConfirm={handleConfirm}
              onRescan={() => {
                setStep("upload");
                setErrorMsg(null);
              }}
            />
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="font-medium">Saved to this job</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {savedCount} scanned page{savedCount === 1 ? "" : "s"} filed under
              Documents, and the digital report is now listed with the job's
              other reports.
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => reset()}>
                Scan another
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
