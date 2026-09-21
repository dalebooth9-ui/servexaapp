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



export default function JobScanReportDialog({
  jobId,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

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

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    })();
  }, [open]);

  const reset = useCallback(() => {
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
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
    if (!next) reset();
    onOpenChange(next);
  };

  const addFiles = async (files: File[]) => {
    setErrorMsg(null);
    const room = () => MAX_PAGES - pages.length;
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
    if (ignored.length > 0) {
      setErrorMsg(
        `Couldn't use ${ignored.length} file(s) — add photos of the sheet or a PDF.`,
      );
    }

    const next: Page[] = images
      .slice(0, room())
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPages((prev) => [...prev, ...next].slice(0, MAX_PAGES));

    for (const pdf of pdfs) {
      try {
        setStatusMsg("Reading PDF pages…");
        const pageFiles = await pdfToPageFiles(pdf, MAX_PAGES);
        setPages((prev) =>
          [
            ...prev,
            ...pageFiles.map((file) => ({
              file,
              preview: URL.createObjectURL(file),
            })),
          ].slice(0, MAX_PAGES),
        );
      } catch {
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

  const extractWithTemplate = async (tpl: TemplateRow, files: File[]) => {
    setStatusMsg(`Reading the fields off the sheet (${tpl.name})…`);
    const images = await Promise.all(
      files.map(async (f) => ({
        image_base64: await fileToScanBase64(f),
        mime_type: "image/jpeg",
      })),
    );
    const result = await runScanExtraction({
      images,
      templateName: tpl.name,
      fields: tpl.fields as any,
    });
    setExtracted(result.extracted || {});
    setHeader(result.header || {});
    setTemplate(tpl);
    setStep("review");
  };

  const handleProcess = async () => {
    if (pages.length === 0) return;
    setStep("processing");
    setErrorMsg(null);
    setNeedsManualTemplate(false);
    try {
      setStatusMsg("Working out which report this is…");
      const payloads = await Promise.all(
        pages.map(async (p) => ({
          image_base64: await fileToScanBase64(p.file),
          mime_type: "image/jpeg",
        })),
      );
      const { data: cls, error: clsErr } = await supabase.functions.invoke(
        "classify-job-sheet-template",
        { body: { images: payloads } },
      );
      if (clsErr) throw new Error(clsErr.message || "Classification failed");

      const candidates: Array<{ template_id: string; name?: string }> =
        cls?.candidates || [];
      const topId = candidates[0]?.template_id;
      const tpl = topId ? loadTemplateById(topId) : null;

      if (!tpl) {
        setNeedsManualTemplate(true);
        setStep("upload");
        setStatusMsg("");
        setErrorMsg(
          "Couldn't tell which report this is. Pick the report type below and we'll read it with that.",
        );
        return;
      }
      await extractWithTemplate(tpl, pages.map((p) => p.file));
    } catch (e: any) {
      console.error("[JobScanReportDialog] process failed", e);
      setStep("upload");
      setStatusMsg("");
      setNeedsManualTemplate(true);
      setErrorMsg(
        e?.message ||
          "Couldn't read the sheet. Try a clearer, straight-on photo in good light.",
      );
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
      setStep("upload");
      setErrorMsg(e?.message || "Couldn't read the sheet with that report type.");
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
          description: `${result.failedPages} page(s) didn't upload. Try adding them again from Documents.`,
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
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
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
                addFiles(Array.from(e.target.files || []));
                e.target.value = "";
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
                    {allTemplates.map((t) => (
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
              onClick={handleProcess}
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
