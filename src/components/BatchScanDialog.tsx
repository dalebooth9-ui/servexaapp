import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, Trash2, Layers, FileStack, CheckCircle2, XCircle, ScanLine } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";
import { applyExposedOutletOverrides } from "@/lib/ocrResultNormalization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TemplateField {
  id: string;
  label: string;
  type: string;
  section?: string;
  options?: string[];
  required?: boolean;
  allow_notes?: boolean;
}

interface ScanResult {
  fileName: string;
  status: "pending" | "scanning" | "done" | "error";
  result?: Record<string, any>;
  header?: Record<string, any>;
  detectedCategory?: { slug: string; name: string };
  matchedTemplate?: { id: string; name: string; fields: TemplateField[] };
  jobId?: string;
  error?: string;
}

export default function BatchScanDialog() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [mode, setMode] = useState<"separate" | "multi-page" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [creatingJobs, setCreatingJobs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFiles = (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const accepted = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    const newFiles = accepted.map((file) => ({
      file,
      preview: file.type === "application/pdf" ? "" : URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      if (prev[idx].preview) URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const reset = () => {
    files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFiles([]);
    setMode(null);
    setResults([]);
    setScanning(false);
    setCreatingJobs(false);
  };

  const fileToBase64 = async (file: File): Promise<{ image_base64: string; mime_type: string }> => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { image_base64: btoa(binary), mime_type: file.type || "image/jpeg" };
  };

  const scanSingleSheet = async (
    imagePayloads: { image_base64: string; mime_type: string }[],
    categories: any[],
    categoryNames: string[]
  ): Promise<{ extracted: Record<string, any>; header: Record<string, any>; category?: { slug: string; name: string }; template?: { id: string; name: string; fields: TemplateField[] } }> => {
    // Stage 1: Identify category
    const categoryIdentifyFields = [
      { id: "detected_category", label: "Document Category", type: "select", options: categoryNames },
      { id: "confidence", label: "Confidence", type: "select", options: ["high", "medium", "low"] },
    ];

    const { data: identifyData, error: identifyError } = await supabase.functions.invoke("ocr-job-sheet", {
      body: { images: imagePayloads, template_name: "Category Identification", fields: categoryIdentifyFields },
    });
    if (identifyError) throw identifyError;
    if (identifyData?.error) throw new Error(identifyData.error);

    const detectedName = identifyData?.extracted?.detected_category;
    const matchedCat = categories.find((c: any) => c.name.toLowerCase() === (detectedName || "").toLowerCase());

    // Stage 2: Fetch template
    let templateFields: TemplateField[] = [];
    let templateName = "General Inspection Sheet";
    let templateRecord: any = null;

    if (matchedCat) {
      const { data: templates } = await supabase
        .from("job_sheet_templates")
        .select("id, name, fields, job_category")
        .eq("job_category", matchedCat.slug)
        .eq("status", "published")
        .limit(1);

      if (templates && templates.length > 0) {
        templateRecord = templates[0];
        templateName = templateRecord.name;
        templateFields = (templateRecord.fields as any[] || []).map((f: any) => ({
          id: f.id, label: f.label, type: f.type, section: f.section,
          options: f.options, required: f.required, allow_notes: f.allow_notes,
        }));
      }
    }

    if (templateFields.length === 0) {
      templateFields = [
        { id: "description", label: "Description / Notes", type: "text" },
        { id: "findings", label: "Findings / Results", type: "text" },
        { id: "actions_required", label: "Actions Required", type: "text" },
        { id: "overall_result", label: "Overall Result", type: "pass_fail" },
        { id: "additional_notes", label: "Additional Notes / Comments", type: "text" },
      ];
    }

    // Stage 3: Full extraction
    const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
      body: {
        images: imagePayloads,
        template_name: templateName,
        fields: templateFields.map((f) => ({ id: f.id, label: f.label, type: f.type, section: f.section, options: f.options })),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const extracted = data.extracted || {};
    const headerData = data.header || {};

    // Auto-fill pressure test defaults
    const isPressureTest = matchedCat?.slug?.includes("pressure_test") || templateName?.toLowerCase().includes("pressure");
    if (isPressureTest) {
      if (!extracted.test_pressure_bar && extracted.test_pressure_bar !== 0) extracted.test_pressure_bar = 12;
      if (!extracted.hold_time_minutes && extracted.hold_time_minutes !== 0) extracted.hold_time_minutes = 15;
    }

    // Map header → result fields
    const headerToFieldMap: Record<string, string[]> = {
      date: ["date", "inspection_date"],
      riser_location: ["riser_location"],
      po_ref: ["po_number", "po_ref", "reference"],
      site: ["site_details", "site"],
      customer: ["customer_details", "customer_name"],
      engineer: ["technician_name", "engineer_name"],
    };
    for (const [headerKey, fieldKeys] of Object.entries(headerToFieldMap)) {
      if (headerData[headerKey]) {
        const hasExisting = fieldKeys.some(fk => extracted[fk]);
        if (!hasExisting) {
          const matchingKey = fieldKeys.find(fk => templateFields.some(f => f.id === fk)) || fieldKeys[0];
          extracted[matchingKey] = headerData[headerKey];
        }
      }
    }

    // Fuzzy-match engineer name against known profiles
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    if (headerData.engineer && profiles && profiles.length > 0) {
      headerData.engineer = fuzzyMatchEngineer(headerData.engineer, profiles.filter(p => p.full_name));
    }

    return {
      extracted: applyExposedOutletOverrides(extracted, templateFields),
      header: headerData,
      category: matchedCat ? { slug: matchedCat.slug, name: matchedCat.name } : undefined,
      template: templateRecord ? { id: templateRecord.id, name: templateName, fields: templateFields } : undefined,
    };
  };

  const startBatchScan = async () => {
    if (files.length === 0 || !mode) return;
    setScanning(true);

    // Pre-fetch categories once
    const { data: categories } = await supabase.from("job_categories").select("name, slug").order("sort_order");
    const categoryNames = (categories || []).map((c: any) => c.name);

    if (mode === "multi-page") {
      // All files are pages of one sheet
      const initial: ScanResult = { fileName: files.map(f => f.file.name).join(", "), status: "scanning" };
      setResults([initial]);

      try {
        const imagePayloads = await Promise.all(files.map((f) => fileToBase64(f.file)));
        const scanData = await scanSingleSheet(imagePayloads, categories || [], categoryNames);
        setResults([{
          ...initial,
          status: "done",
          result: scanData.extracted,
          header: scanData.header,
          detectedCategory: scanData.category,
          matchedTemplate: scanData.template,
        }]);
      } catch (err: any) {
        setResults([{ ...initial, status: "error", error: err.message }]);
      }
    } else {
      // Each file is a separate sheet
      const initialResults: ScanResult[] = files.map((f) => ({
        fileName: f.file.name,
        status: "pending" as const,
      }));
      setResults(initialResults);

      for (let i = 0; i < files.length; i++) {
        setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "scanning" } : r));

        try {
          const imagePayloads = [await fileToBase64(files[i].file)];
          const scanData = await scanSingleSheet(imagePayloads, categories || [], categoryNames);
          setResults((prev) => prev.map((r, idx) => idx === i ? {
            ...r,
            status: "done",
            result: scanData.extracted,
            header: scanData.header,
            detectedCategory: scanData.category,
            matchedTemplate: scanData.template,
          } : r));
        } catch (err: any) {
          setResults((prev) => prev.map((r, idx) => idx === i ? {
            ...r, status: "error", error: err.message,
          } : r));
        }
      }
    }

    setScanning(false);
    toast({ title: "Batch scan complete" });
  };

  const createAllJobs = async () => {
    const successful = results.filter((r) => r.status === "done" && r.header);
    if (successful.length === 0) return;
    setCreatingJobs(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    let created = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "done" || !r.header) continue;

      try {
        const jobName = r.header.customer
          ? `${r.header.customer} - ${r.detectedCategory?.name || "Scanned Sheet"}`
          : r.detectedCategory?.name || "Scanned Sheet";

        const { data: job, error } = await supabase
          .from("jobs")
          .insert({
            name: jobName,
            customer: r.header.customer || null,
            address: r.header.site || null,
            status: "active",
            priority: "medium",
            category: r.detectedCategory?.slug || "general",
          })
          .select("id")
          .single();

        if (error) throw error;

        if (r.matchedTemplate && r.result && userId) {
          await supabase.from("job_sheet_responses").insert({
            job_id: job.id,
            template_id: r.matchedTemplate.id,
            submitted_by: userId,
            responses: r.result,
            status: "submitted",
            submitted_at: new Date().toISOString(),
          });
        }

        setResults((prev) => prev.map((res, idx) => idx === i ? { ...res, jobId: job.id } : res));
        created++;
      } catch (err: any) {
        setResults((prev) => prev.map((res, idx) => idx === i ? { ...res, error: err.message } : res));
      }
    }

    toast({ title: `${created} job${created !== 1 ? "s" : ""} created` });
    setCreatingJobs(false);
  };

  const doneCount = results.filter((r) => r.status === "done").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const progressPercent = results.length > 0 ? Math.round(((doneCount + errorCount) / results.length) * 100) : 0;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileStack className="mr-2 h-4 w-4" /> Batch Scan
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="batch-scan-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" />
              Batch Scan — Multiple Sheets
            </DialogTitle>
            <DialogDescription id="batch-scan-desc">
              Upload multiple handwritten sheets to scan and convert them all at once.
            </DialogDescription>
          </DialogHeader>

          {results.length === 0 ? (
            <div className="space-y-4">
              {/* Mode selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode("separate")}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    mode === "separate" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                  }`}
                >
                  <FileStack className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Separate Sheets</span>
                  <span className="text-xs text-muted-foreground text-center">Each file is a different job sheet</span>
                </button>
                <button
                  onClick={() => setMode("multi-page")}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    mode === "multi-page" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                  }`}
                >
                  <Layers className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">Multi-Page Sheet</span>
                  <span className="text-xs text-muted-foreground text-center">All files are pages of the same sheet</span>
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); dragCounter.current = 0; setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                  isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop all your sheets here, or <span className="text-primary font-medium">click to browse</span>
                </p>
                <p className="text-xs text-muted-foreground">JPG, PNG, PDF — no limit</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-lg border p-2">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0">
                          {f.preview ? (
                            <img src={f.preview} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs shrink-0">PDF</div>
                          )}
                          <span className="truncate">{f.file.name}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={startBatchScan} disabled={files.length === 0 || !mode || scanning} className="w-full">
                {scanning ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</>
                ) : (
                  <><ScanLine className="mr-2 h-4 w-4" /> Scan {files.length} Sheet{files.length !== 1 ? "s" : ""}</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress */}
              {scanning && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Processing sheets…</span>
                    <span className="font-medium">{doneCount + errorCount}/{results.length}</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
              )}

              {/* Results list */}
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {results.map((r, idx) => (
                  <div key={idx} className={`rounded-lg border p-3 ${r.status === "error" ? "border-destructive/50 bg-destructive/5" : r.jobId ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : ""}`}>
                    <div className="flex items-center gap-2">
                      {r.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                      {r.status === "scanning" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                      {r.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                      {r.status === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                      <span className="text-sm font-medium truncate flex-1">{r.fileName}</span>
                      {r.detectedCategory && (
                        <Badge className="text-xs shrink-0">{r.detectedCategory.name}</Badge>
                      )}
                    </div>
                    {r.status === "done" && r.header && (
                      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                        {r.header.customer && <span>Customer: <strong className="text-foreground">{r.header.customer}</strong></span>}
                        {r.header.site && <span>Site: <strong className="text-foreground">{r.header.site}</strong></span>}
                        {r.header.engineer && <span>Engineer: <strong className="text-foreground">{r.header.engineer}</strong></span>}
                        {r.header.date && <span>Date: <strong className="text-foreground">{r.header.date}</strong></span>}
                      </div>
                    )}
                    {r.error && <p className="text-xs text-destructive mt-1">{r.error}</p>}
                    {r.jobId && <p className="text-xs text-green-600 mt-1">✓ Job created</p>}
                  </div>
                ))}
              </div>

              {/* Summary & actions */}
              {!scanning && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    {doneCount > 0 && <Badge variant="secondary">{doneCount} extracted</Badge>}
                    {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={createAllJobs}
                      disabled={creatingJobs || doneCount === 0 || results.some((r) => r.jobId)}
                      size="sm"
                    >
                      {creatingJobs ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Jobs…</>
                      ) : (
                        <>Create {doneCount} Job{doneCount !== 1 ? "s" : ""}</>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={reset}>
                      <ScanLine className="mr-2 h-4 w-4" /> Start Over
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
