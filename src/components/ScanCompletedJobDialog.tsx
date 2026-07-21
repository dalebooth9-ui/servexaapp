import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { runScanExtraction } from "@/lib/scanPipeline";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CustomerCombobox, {
  type CustomerOption,
} from "@/components/CustomerCombobox";
import SiteCombobox, { type SiteOption } from "@/components/SiteCombobox";
import {
  Loader2,
  Upload,
  ScanLine,
  X,
  AlertTriangle,
  CheckCircle2,
  Plus,
  XCircle,
  PenLine,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import BulkScanTab from "@/components/paper-scan/BulkScanTab";
import PaperSignatureCropper from "@/components/paper-scan/PaperSignatureCropper";
import {
  cropSignatureFromScanSource,
  hasUsableSignatureBoundingBox,
  type SignatureBoundingBox,
  type ScanImageSource,
} from "@/lib/signatureCrop";
import { detectPaperMismatches } from "@/lib/paperScanMismatch";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import {
  matchSiteFromHeader,
  splitSiteHeaderForCreate,
  type SiteMatchResult,
} from "@/lib/matchSiteFromHeader";

// ── Types ──
type TemplateField = {
  id: string;
  label: string;
  type: string;
  section?: string;
  options?: string[];
  required?: boolean;
  allow_notes?: boolean;
};

type Template = {
  id: string;
  name: string;
  category: string | null;
  job_category: string | null;
  fields: TemplateField[];
};

type Candidate = {
  template_id: string;
  name: string;
  confidence: number;
  reason?: string;
  category?: string | null;
};

type ImgFile = { file: File; url: string };

export type QueueItemInput = {
  itemId: string;
  batchId: string;
  templateId: string;
  extracted: Record<string, any>;
  header: Record<string, any>;
  imagePaths: string[];
  guessCustomerId: string | null;
  guessSiteId: string | null;
  guessDate: string | null; // yyyy-mm-dd
  candidateMatches: Candidate[];
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When provided, dialog skips upload and goes straight to review of a queued form. */
  queueItem?: QueueItemInput;
  /** Called after confirm/reject to refresh the queue. */
  onQueueItemResolved?: () => void;
  /** Optional file handed in from another intake (e.g. PO import misdrop). */
  initialFile?: File | null;
  /** Called when the user chooses to redirect a misdropped PO to Create Job flow. */
  onRedirectToPo?: (file: File) => void;
}

// ── Helpers ──
async function fileToBase64(file: File, maxDim = 1800): Promise<string> {
  const buf = await file.arrayBuffer();
  const blob = new Blob([buf], { type: file.type });
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (!bmp) {
    const b64 = btoa(
      String.fromCharCode(...new Uint8Array(buf)),
    );
    return b64;
  }
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
}

function parseDateInput(raw: string): string {
  if (!raw) return "";
  const parts = raw.trim().split(/[\/\-.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const year = c.length === 2 ? `20${c}` : c;
    return `${a.padStart(2, "0")}/${b.padStart(2, "0")}/${year}`;
  }
  return raw;
}

function coerceCheckbox(val: unknown): "yes" | "no" | "na" | "" {
  if (val === true) return "yes";
  if (val === false) return "no";
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "yes" || s === "true" || s === "pass") return "yes";
    if (s === "no" || s === "false" || s === "fail") return "no";
    if (s === "n/a" || s === "na") return "na";
  }
  return "";
}

function checkboxToStored(v: "yes" | "no" | "na" | ""): boolean | string | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  if (v === "na") return "N/A";
  return undefined;
}

export default function ScanCompletedJobDialog({
  open,
  onOpenChange,
  queueItem,
  onQueueItemResolved,
  initialFile,
  onRedirectToPo,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<"upload" | "processing" | "review">("upload");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [images, setImages] = useState<ImgFile[]>([]);
  const [processingMsg, setProcessingMsg] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [header, setHeader] = useState<Record<string, any>>({});

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState("");
  const [siteMatch, setSiteMatch] = useState<SiteMatchResult<SiteOption> | null>(null);
  const [showNewSite, setShowNewSite] = useState(false);
  const [newSite, setNewSite] = useState({
    name: "",
    address: "",
    postcode: "",
    riser_location: "",
  });

  const [jobName, setJobName] = useState("");
  const [completionDate, setCompletionDate] = useState<string>("");
  const [dateUnknown, setDateUnknown] = useState(false);
  const [saving, setSaving] = useState(false);

  // Optional: file against an existing pre-scheduled job for this customer/site
  // instead of creating a brand-new historic job.
  type MatchableJob = {
    id: string;
    reference_number: string;
    name: string | null;
    status: string;
    scheduled_date: string | null;
  };
  const [existingJobs, setExistingJobs] = useState<MatchableJob[]>([]);
  const [matchExistingJobId, setMatchExistingJobId] = useState<string>("");

  // Cropped signatures (auto or manual) — uploaded on confirm
  type SigCapture = { blob: Blob; previewUrl: string; name: string; pageIdx: number };
  const [customerSig, setCustomerSig] = useState<SigCapture | null>(null);
  const [manualCrop, setManualCrop] = useState<{
    role: "customer";
    pageIdx: number;
  } | null>(null);
  const [ackMismatch, setAckMismatch] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // PO misdrop detection (result of classify-job-sheet-template)
  const [poMisdrop, setPoMisdrop] = useState<{ reason?: string } | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setMode("single");
      setImages([]);
      setCandidates([]);
      setTemplate(null);
      setResponses({});
      setHeader({});
      setCustomerId("");
      setSiteId("");
      setSiteMatch(null);
      setShowNewSite(false);
      setNewSite({ name: "", address: "", postcode: "", riser_location: "" });
      setJobName("");
      setCompletionDate("");
      setDateUnknown(false);
      setMatchExistingJobId("");
      setExistingJobs([]);
      setProcessingMsg("");
      setCustomerSig(null);
      setManualCrop(null);
      setAckMismatch(false);
      setPoMisdrop(null);
    }
  }, [open]);

  // Handoff from PO import: preload the file
  useEffect(() => {
    if (!open || !initialFile) return;
    const url = URL.createObjectURL(initialFile);
    setImages([{ file: initialFile, url }]);
    setMode("single");
    setPoMisdrop(null);
  }, [open, initialFile]);

  // Load open/scheduled jobs for the selected customer+site so the reviewer
  // can file the scan against an existing job instead of creating a new one.
  useEffect(() => {
    if (!customerId || !siteId) {
      setExistingJobs([]);
      setMatchExistingJobId("");
      return;
    }
    supabase
      .from("jobs")
      .select("id, reference_number, name, status, scheduled_date")
      .eq("customer_id", customerId)
      .eq("site_id", siteId)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: false, nullsFirst: false })
      .limit(20)
      .then(({ data }) => setExistingJobs((data as any) || []));
  }, [customerId, siteId]);

  // Preload from queue item (bulk review flow)
  useEffect(() => {
    if (!open || !queueItem) return;
    (async () => {
      setStep("processing");
      setProcessingMsg("Loading queued form…");
      try {
        const { data: tpl, error: tplErr } = await supabase
          .from("job_sheet_templates")
          .select("id, name, category, job_category, fields")
          .eq("id", queueItem.templateId)
          .maybeSingle();
        if (tplErr || !tpl) throw new Error(tplErr?.message || "Template missing");
        const tplObj: Template = {
          id: (tpl as any).id,
          name: (tpl as any).name,
          category: (tpl as any).category,
          job_category: (tpl as any).job_category,
          fields: Array.isArray((tpl as any).fields) ? (tpl as any).fields : [],
        };
        setTemplate(tplObj);
        setCandidates(queueItem.candidateMatches || []);

        // Normalise extracted responses (same shape helper as single flow)
        const extracted = queueItem.extracted || {};
        const normalised: Record<string, any> = {};
        for (const f of tplObj.fields) {
          const raw = extracted[f.id];
          if (raw === undefined || raw === null || raw === "") continue;
          if (f.type === "checkbox") {
            const cb = coerceCheckbox(raw);
            const stored = checkboxToStored(cb);
            if (stored === undefined && typeof raw === "string") {
              normalised[f.id] = raw;
            } else if (stored !== undefined) {
              normalised[f.id] = stored;
            }
          } else {
            normalised[f.id] = raw;
          }
        }
        setResponses(normalised);
        setHeader(queueItem.header || {});

        if (queueItem.guessCustomerId) setCustomerId(queueItem.guessCustomerId);
        if (queueItem.guessSiteId) setSiteId(queueItem.guessSiteId);
        if (queueItem.guessDate) {
          const m = queueItem.guessDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) setCompletionDate(`${m[3]}/${m[2]}/${m[1]}`);
        } else if (queueItem.header?.date) {
          setCompletionDate(parseDateInput(String(queueItem.header.date)));
        }
        const hdr = queueItem.header || {};
        setJobName(
          `${tplObj.name} — ${hdr.site || hdr.customer || "backfilled"}`,
        );

        // Download queue-item photos as File objects so we can crop
        // signatures out of them client-side.
        setProcessingMsg("Loading source photos…");
        const downloaded: ImgFile[] = [];
        for (const p of queueItem.imagePaths) {
          const { data } = await supabase.storage
            .from("submissions")
            .download(p);
          if (data) {
            const name = p.split("/").pop() || "scan.jpg";
            const file = new File([data], name, {
              type: (data as Blob).type || "image/jpeg",
            });
            downloaded.push({ file, url: URL.createObjectURL(file) });
          }
        }
        setImages(downloaded);

        await autoCropSignatures(downloaded, hdr);
        setStep("review");
      } catch (e: any) {
        toast({
          title: "Couldn't load form",
          description: e?.message,
          variant: "destructive",
        });
        onOpenChange(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, queueItem?.itemId]);


  // Load customer list once
  useEffect(() => {
    if (!open) return;
    supabase
      .from("customers")
      .select("id, name, email")
      .order("name")
      .then(({ data }) => setCustomers((data as any) || []));
  }, [open]);

  // Load sites when customer selected
  useEffect(() => {
    if (!customerId) {
      setSites([]);
      setSiteId("");
      setSiteMatch(null);
      return;
    }
    supabase
      .from("customer_sites")
      .select("site_id, sites(id, name, address, postcode)")
      .eq("customer_id", customerId)
      .then(({ data }) => {
        const opts: SiteOption[] = (data || [])
          .map((r: any) => r.sites)
          .filter(Boolean)
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            address: s.address,
            postcode: s.postcode,
          }));
        setSites(opts);

        // Auto-match extracted site text against the customer's site
        // records. Confident match → pre-select. Ambiguous / none → surface
        // the extracted text and a "Create site from sheet" hint.
        const headerSite = String((header as any)?.site || "").trim();
        if (!headerSite) {
          setSiteMatch(null);
          return;
        }
        const result = matchSiteFromHeader(opts, headerSite);
        setSiteMatch(result);
        if (result.confidence === "exact" && result.best && !siteId) {
          setSiteId(result.best.id);
        }
      });
    // Intentionally excluding siteId/header from deps: we only want to
    // auto-match once per customer selection to avoid clobbering the
    // reviewer's explicit choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);


  // ── Auto-crop signatures out of the source photos using the bboxes the
  // OCR function returned. Runs in both single and queue flows; either
  // slot can be blank and the reviewer can crop it manually. ──
  const autoCropSignatures = async (
    src: ImgFile[],
    hdr: Record<string, any>,
  ) => {
    if (!src.length) return;
    // Engineer signatures come from the stored engineer library (managed
    // in Settings → Documents → Engineer signatures) — never cropped from
    // the paper photo. Only the customer signature is cropped from the scan.
    const custBox = hdr?.customer_signature_bbox as SignatureBoundingBox | undefined;
    if (hasUsableSignatureBoundingBox(custBox)) {
      const pageIdx = Math.min(custBox?.page_index || 0, src.length - 1);
      const source: ScanImageSource = { file: src[pageIdx].file, preview: src[pageIdx].url };
      const cropped = await cropSignatureFromScanSource(source, custBox!, { mode: "field" });
      if (cropped?.blob) {
        setCustomerSig({
          blob: cropped.blob,
          previewUrl: URL.createObjectURL(cropped.blob),
          name: String(hdr?.customer_signed_name || "").trim() || "Customer",
          pageIdx,
        });
      }
    }
  };

  // ── File input ──
  const addFiles = async (fs: FileList | null) => {
    if (!fs || fs.length === 0) return;
    const raw = Array.from(fs);
    const hasPdf = raw.some(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    let expanded: File[];
    if (hasPdf) {
      try {
        setProcessingMsg("Rendering PDF pages…");
        setStep("processing");
        const { expandDropToPageFiles } = await import("@/lib/pdfToImages");
        expanded = await expandDropToPageFiles(raw);
        setStep("upload");
      } catch (e: any) {
        setStep("upload");
        toast({
          title: "Couldn't read PDF",
          description: e?.message || "Try a different file.",
          variant: "destructive",
        });
        return;
      }
    } else {
      expanded = raw.filter((f) => f.type.startsWith("image/"));
    }
    if (expanded.length === 0) return;
    setImages((prev) => [
      ...prev,
      ...expanded.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    ]);
  };

  const removeImg = (idx: number) => {
    setImages((prev) => {
      const c = [...prev];
      const [gone] = c.splice(idx, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return c;
    });
  };

  // ── Load template + extract ──
  const loadTemplateAndExtract = async (
    templateId: string,
    imagePayloads: { image_base64: string; mime_type?: string }[],
  ) => {
    const { data: tpl, error: tplErr } = await supabase
      .from("job_sheet_templates")
      .select("id, name, category, job_category, fields")
      .eq("id", templateId)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error(tplErr?.message || "Template missing");
    const tplObj: Template = {
      id: (tpl as any).id,
      name: (tpl as any).name,
      category: (tpl as any).category,
      job_category: (tpl as any).job_category,
      fields: Array.isArray((tpl as any).fields) ? (tpl as any).fields : [],
    };

    setTemplate(tplObj);
    setProcessingMsg(`Reading form using "${tplObj.name}"…`);

    // Canonical extraction — shared with archive/queue/quick-scan doors.
    const { extracted, header: hdr } = await runScanExtraction({
      images: imagePayloads,
      templateName: tplObj.name,
      fields: tplObj.fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        options: f.options,
      })),
    });

    // Normalise checkbox strings → booleans/N/A
    const normalised: Record<string, any> = {};
    for (const f of tplObj.fields) {
      const raw = extracted[f.id];
      if (raw === undefined || raw === null || raw === "") continue;
      if (f.type === "checkbox") {
        const cb = coerceCheckbox(raw);
        const stored = checkboxToStored(cb);
        if (stored === undefined && typeof raw === "string") {
          normalised[f.id] = raw;
        } else if (stored !== undefined) {
          normalised[f.id] = stored;
        }
      } else {
        normalised[f.id] = raw;
      }
    }

    setResponses(normalised);
    setHeader(hdr);
    // Prefill job header widgets from header
    if (hdr.date) setCompletionDate(parseDateInput(String(hdr.date)));
    setJobName(`${tplObj.name} — ${hdr.site || hdr.customer || "backfilled"}`);
    return hdr;
  };

  // ── Analyze ──
  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setStep("processing");
    setProcessingMsg("Preparing photos…");
    try {
      const imagePayloads = await Promise.all(
        images.map(async (im) => ({
          image_base64: await fileToBase64(im.file),
          mime_type: "image/jpeg",
        })),
      );

      // Multi-page uploads may actually contain several separate completed
      // sheets (e.g. scanner spits out one PDF for the whole stack). Detect
      // sheet boundaries first — if >1 sheet is found, hand off to the batch
      // review queue so nothing is silently discarded.
      if (imagePayloads.length > 1) {
        setProcessingMsg(`Detecting sheets in ${imagePayloads.length} pages…`);
        const { data: splitData, error: splitErr } = await supabase.functions.invoke(
          "split-paper-scan-pdf",
          { body: { pages: imagePayloads } },
        );
        if (splitErr) throw new Error(splitErr.message || "Sheet detection failed");

        if (splitData?.document_kind === "purchase_order") {
          setPoMisdrop({ reason: splitData?.document_kind_reason });
          setStep("upload");
          return;
        }

        const sheets: any[] = Array.isArray(splitData?.sheets) ? splitData.sheets : [];
        if (sheets.length > 1) {
          setProcessingMsg(`${sheets.length} sheets detected — creating batch…`);
          const { data: profile } = await supabase
            .from("profiles")
            .select("org_id")
            .eq("user_id", user!.id)
            .maybeSingle();
          const orgId = (profile as any)?.org_id;
          if (!orgId) throw new Error("Your account has no organisation.");

          const { createScanBatchFromSheets } = await import(
            "@/lib/createScanBatchFromSheets"
          );
          const batchId = await createScanBatchFromSheets({
            orgId,
            userId: user!.id,
            pageFiles: images.map((im) => im.file),
            sheets,
            sourceLabel: "manual_multi_sheet_upload",
          });
          toast({
            title: `${sheets.length} sheets detected`,
            description: `Batch created with ${images.length} pages. Opening review queue…`,
          });
          onOpenChange(false);
          navigate(`/paper-scans?tab=review&batch=${batchId}`);
          return;
        }
        // Single sheet found spanning multiple pages — continue with single flow.
      }

      setProcessingMsg("Matching against templates…");
      const { data: clsData, error: clsErr } = await supabase.functions.invoke(
        "classify-job-sheet-template",
        { body: { images: imagePayloads } },
      );
      if (clsErr) throw new Error(clsErr.message || "Classification failed");

      // PO misdrop check — offer redirect to Create Job flow
      if (clsData?.document_kind === "purchase_order") {
        setPoMisdrop({ reason: clsData?.document_kind_reason });
        setStep("upload");
        return;
      }

      const cands: Candidate[] = clsData?.candidates || [];
      if (cands.length === 0) {
        throw new Error(
          "Couldn't match the form to any template. Try a clearer photo, or select a template manually after upload.",
        );
      }
      // Safety demotion: never let a Remedial/Repair template win over a
      // service/inspection candidate. The classifier prompt already forbids
      // this, but on borderline scans Gemini can still pick a remedial
      // template as top-1. When a non-remedial candidate is in the top 3,
      // promote it — the SHEET's title decides, not the pre-attached job
      // template.
      const isRemedialName = (n?: string) =>
        !!n && /remedial|repair works|snag/i.test(n);
      let promoted = cands;
      if (isRemedialName(cands[0]?.name)) {
        const nonRemedial = cands.find((c) => !isRemedialName(c.name));
        if (nonRemedial) {
          promoted = [nonRemedial, ...cands.filter((c) => c.template_id !== nonRemedial.template_id)];
        }
      }
      setCandidates(promoted);

      const hdr = await loadTemplateAndExtract(promoted[0].template_id, imagePayloads);
      await autoCropSignatures(images, hdr);
      setStep("review");
    } catch (e: any) {
      toast({
        title: "Scan failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
      setStep("upload");
    }
  };

  // ── Switch template in review ──
  const handleTemplateChange = async (newTemplateId: string) => {
    if (!newTemplateId || newTemplateId === template?.id) return;
    setStep("processing");
    setProcessingMsg("Re-reading form with new template…");
    try {
      const imagePayloads = await Promise.all(
        images.map(async (im) => ({
          image_base64: await fileToBase64(im.file),
          mime_type: "image/jpeg",
        })),
      );
      const hdr = await loadTemplateAndExtract(newTemplateId, imagePayloads);
      await autoCropSignatures(images, hdr);
      setStep("review");
    } catch (e: any) {
      toast({
        title: "Re-scan failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
      setStep("review");
    }
  };

  // ── Create new site ──
  const handleCreateSite = async () => {
    if (!customerId || !newSite.name.trim()) {
      toast({ title: "Site name required", variant: "destructive" });
      return;
    }
    try {
      const { data: created, error } = await supabase
        .from("sites")
        .insert({
          name: newSite.name.trim(),
          address: newSite.address.trim() || null,
          postcode: newSite.postcode.trim() || null,
          riser_location: newSite.riser_location.trim() || null,
          site_type: "site",
          created_by: user?.id,
          notes: "Created via Scan Paper Report backfill",
        })
        .select("id, name, address, postcode")
        .single();
      if (error) throw error;

      await supabase.from("customer_sites").insert({
        customer_id: customerId,
        site_id: (created as any).id,
      });

      const opt: SiteOption = {
        id: (created as any).id,
        name: (created as any).name,
        address: (created as any).address,
        postcode: (created as any).postcode,
      };
      setSites((prev) => [...prev, opt]);
      setSiteId(opt.id);
      setShowNewSite(false);
      setNewSite({ name: "", address: "", postcode: "", riser_location: "" });
      toast({ title: "Site created" });
    } catch (e: any) {
      toast({
        title: "Could not create site",
        description: e?.message,
        variant: "destructive",
      });
    }
  };

  // ── Fields blank in the extracted data (soft warning only — paper backfill
  // treats every template field as optional so a partly-filled sheet still
  // files. Job-level essentials (customer/site/date) remain required.) ──
  const missingFields = useMemo(() => {
    if (!template) return [] as TemplateField[];
    return template.fields.filter(
      (f) => responses[f.id] === undefined || responses[f.id] === "" || responses[f.id] === null,
    );
  }, [template, responses]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedSite = sites.find((s) => s.id === siteId);

  const mismatches = useMemo(
    () =>
      detectPaperMismatches({
        extractedCustomer: header?.customer as string | undefined,
        selectedCustomer: selectedCustomer?.name,
        extractedSite: header?.site as string | undefined,
        selectedSiteText: selectedSite
          ? [selectedSite.name, selectedSite.address, selectedSite.postcode]
              .filter(Boolean)
              .join(", ")
          : "",
      }),
    [header, selectedCustomer, selectedSite],
  );

  useEffect(() => {
    setAckMismatch(false);
  }, [customerId, siteId, header]);



  // ── Confirm & file ──
  const handleConfirm = async () => {
    if (!template || !user) return;
    if (!customerId) {
      toast({ title: "Choose a customer", variant: "destructive" });
      return;
    }
    const headerSite = String((header as any)?.site || "").trim();
    const freeTextSite = headerSite;
    if (!siteId && !freeTextSite) {
      toast({
        title: "No site information",
        description:
          "Pick a site from the list, or add a site name/address from the sheet.",
        variant: "destructive",
      });
      return;
    }
    if (mismatches.length > 0 && !ackMismatch) {
      toast({
        title: "Confirm the mismatch first",
        description: "The paper form doesn't clearly match the selected customer/site. Tick the acknowledgement or change the selection.",
        variant: "destructive",
      });
      return;
    }
    if (!completionDate && !dateUnknown) {
      toast({
        title: "Enter the date from the sheet",
        description:
          "Type the date handwritten on the paper form (dd/mm/yyyy) — or tick 'Date unknown' to file it without one. Backlog jobs must never silently default to today.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // Auto-create the site from the free-text sheet fields if the reviewer
      // didn't pick one — the UI promises "free text will be filed".
      let effectiveSiteId = siteId;
      if (!effectiveSiteId && freeTextSite) {
        const parts = splitSiteHeaderForCreate(freeTextSite);
        const { data: created, error: siteErr } = await supabase
          .from("sites")
          .insert({
            name: (parts.name || freeTextSite).slice(0, 200),
            address: parts.address || freeTextSite || null,
            postcode: parts.postcode || null,
            site_type: "site",
            created_by: user.id,
            notes: "Auto-created from paper scan review",
          } as any)
          .select("id, name, address, postcode")
          .single();
        if (siteErr) throw siteErr;
        effectiveSiteId = (created as any).id;
        await supabase.from("customer_sites" as any).insert({
          customer_id: customerId,
          site_id: effectiveSiteId,
        });
      }
      const site = sites.find((s) => s.id === effectiveSiteId);
      const jobAddress = [site?.address, site?.postcode]
        .filter(Boolean)
        .join(", ");

      // Derive completion timestamp — ONLY from the handwritten date. If the
      // reviewer explicitly ticked "date unknown", we still need a value for
      // completed_at, so fall back to today but tag the job so it's obvious
      // in reports/history.
      let completedAt: string | null = null;
      let dateKnown = true;
      if (completionDate) {
        const m = completionDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          completedAt = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`).toISOString();
        }
      }
      if (!completedAt) {
        completedAt = new Date().toISOString();
        dateKnown = false;
      }

      // Job category is derived from the CLASSIFIED template — never left as
      // "general" for a scan whose template clearly belongs to a service
      // category. This also prevents the Remedial Works template auto-
      // attaching on genuine service-sheet scans (that trigger fires on
      // category=general jobs).
      const deriveCategory = (): string => {
        const cat = (template.category || "").toLowerCase();
        const jc = (template.job_category || "").toLowerCase();
        if (cat === "pressure_test" || jc.includes("pressure_test")) return "pressure_test";
        if (cat === "visual" || jc.includes("visual")) return "visual";
        if (
          cat === "sprinkler" ||
          cat === "sprinkler_service" ||
          cat === "commercial_sprinkler_service" ||
          jc.startsWith("sprinkler") ||
          jc.includes("sprinkler")
        ) return "commercial_sprinkler_service";
        if (jc.startsWith("fire_hydrant") || jc.startsWith("hydrant") || cat.startsWith("hydrant"))
          return "fire_hydrant";
        if (jc.startsWith("wet_riser") || cat.startsWith("wet_riser")) return "wet_riser";
        if (jc.startsWith("dry_riser") || cat.startsWith("dry_riser")) return "dry_riser";
        if (jc.startsWith("fire_extinguisher") || cat.startsWith("fire_extinguisher") || jc.startsWith("extinguisher"))
          return "fire_extinguisher";
        return template.category || template.job_category || "general";
      };
      const category = deriveCategory();

      const backfillSource = dateKnown
        ? "paper backfill"
        : "paper backfill (date unknown)";

      const matchedExisting = Boolean(matchExistingJobId);

      // Build the response payload — strip blank/undefined so it only
      // contains real answers (paper backfill: all template fields optional).
      const fullResponses: Record<string, any> = {};
      for (const [k, v] of Object.entries(responses)) {
        if (v === undefined || v === null || v === "") continue;
        fullResponses[k] = v;
      }
      if (header.customer && !fullResponses["customer_name"] && template.fields.some(f => f.id === "customer_name")) {
        fullResponses.customer_name = header.customer;
      }
      if (header.po_ref && !fullResponses["po_number"]) {
        fullResponses.po_number = String(header.po_ref);
      }
      if (completionDate && !fullResponses["date"]) {
        fullResponses.date = completionDate;
      }
      if (header.engineer && !fullResponses["technician_name"]) {
        fullResponses.technician_name = header.engineer;
      }

      // ATOMIC: create/update the job AND file the response in one
      // transaction on the server. Prevents shell-jobs when a mid-flight
      // failure previously left the job without its response.
      // Naming rules are enforced server-side:
      //   name = "<Template name> — <Site/address>" (never raw scope text)
      //   reference_number = normal VFP sequence (never a PO scraped from paper)
      //   customer_po = any PO/reference handwritten on the sheet
      const poFromPaper =
        (header.po_ref ? String(header.po_ref) : "") ||
        (header.job_ref ? String(header.job_ref) : "");
      const { data: confirmRes, error: confirmErr } = await supabase.rpc(
        "confirm_paper_scan_job" as any,
        {
          _template_id: template.id,
          _customer_id: customerId,
          _site_id: effectiveSiteId,
          _completed_at: completedAt,
          _date_known: dateKnown,
          _category: category,
          _responses: fullResponses,
          _customer_po: poFromPaper || null,
          _existing_job_id: matchedExisting ? matchExistingJobId : null,
          _batch_item_id: queueItem?.itemId || null,
          _override_name: jobName || null,
        },
      );
      if (confirmErr) throw confirmErr;
      const row = Array.isArray(confirmRes) ? confirmRes[0] : confirmRes;
      if (!row?.job_id) throw new Error("Confirm did not return a job id");
      const jobId: string = row.job_id;
      const jobRef: string = row.reference_number;

      // Attach photos — from File objects (single flow) or copy from storage (queue flow)
      if (queueItem && queueItem.imagePaths.length > 0) {
        for (let i = 0; i < queueItem.imagePaths.length; i++) {
          const src = queueItem.imagePaths[i];
          const ext =
            src.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
            "jpg";
          const safeName = `paper-scan-${i + 1}-${Date.now()}.${ext}`;
          const dest = `job-documents/${jobId}/${safeName}`;
          const { error: copyErr } = await supabase.storage
            .from("submissions")
            .copy(src, dest);
          if (copyErr) {
            console.error("copy failed", src, copyErr);
            continue;
          }
          const { data: urlData } = await supabase.storage
            .from("submissions")
            .createSignedUrl(dest, 60 * 60 * 24 * 365 * 5);
          await supabase.from("job_documents" as any).insert({
            job_id: jobId,
            document_type: "source_scan",
            label: `Original paper form (page ${i + 1})`,
            file_url: urlData?.signedUrl || null,
            file_name: safeName,
            source: "manual",
            created_by: user.id,
          });
        }
        // Batch item was already marked confirmed inside the atomic RPC.
        onQueueItemResolved?.();
      } else {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const ext =
            img.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
            "jpg";
          const safeName = `paper-scan-${i + 1}-${Date.now()}.${ext}`;
          const path = `job-documents/${jobId}/${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("submissions")
            .upload(await buildOrgPathAsync(path), img.file, {
              upsert: true,
              contentType: img.file.type || "image/jpeg",
            });
          if (upErr) {
            console.error("upload failed", upErr);
            continue;
          }
          const { data: urlData } = await supabase.storage
            .from("submissions")
            .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);

          await supabase.from("job_documents" as any).insert({
            job_id: jobId,
            document_type: "source_scan",
            label: `Original paper form (page ${i + 1})`,
            file_url: urlData?.signedUrl || null,
            file_name: safeName,
            source: "manual",
            created_by: user.id,
          });
        }
      }

      // Persist captured signatures — same pattern as normal in-app sign-off
      const uploadSig = async (sig: SigCapture, role: "engineer" | "customer") => {
        const path = `${user.id}/${jobId}-${role}-paper-${Date.now()}.png`;
        const { error: upErr } = await supabase.storage
          .from("signatures")
          .upload(await buildOrgPathAsync(path), sig.blob, { contentType: "image/png" });
        if (upErr) {
          console.error("signature upload failed", upErr);
          return;
        }
        await supabase.from("job_signatures" as any).insert({
          job_id: jobId,
          signer_id: user.id,
          signer_name: sig.name || (role === "customer" ? "Customer" : "Engineer"),
          signer_role: role,
          file_path: path,
        });
      };
      if (customerSig) await uploadSig(customerSig, "customer");



      toast({
        title: `Job ${jobRef} filed`,
        description: "Paper report digitised. Opening the job now.",
      });
      onOpenChange(false);
      navigate(`/jobs/${jobId}`);
    } catch (e: any) {
      toast({
        title: "Couldn't file job",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Field renderer ──
  const renderField = (f: TemplateField) => {
    const val = responses[f.id];
    const setVal = (v: any) => setResponses((r) => ({ ...r, [f.id]: v }));

    // Yes/No/N/A tri-state for checkbox
    if (f.type === "checkbox") {
      const cur = coerceCheckbox(val);
      const useDescriptive =
        typeof val === "string" && cur === "" && val.trim().length > 0;
      return (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            {(["yes", "no", "na"] as const).map((opt) => (
              <Button
                key={opt}
                type="button"
                size="sm"
                variant={cur === opt ? "default" : "outline"}
                className="h-7 px-3"
                onClick={() => setVal(checkboxToStored(opt))}
              >
                {opt === "yes" ? "Yes" : opt === "no" ? "No" : "N/A"}
              </Button>
            ))}
            {useDescriptive && (
              <span className="text-xs italic text-muted-foreground self-center ml-2">
                Extracted text: "{String(val)}"
              </span>
            )}
          </div>
          {(f.allow_notes || useDescriptive) && (
            <Input
              value={useDescriptive ? String(val) : ""}
              placeholder="Optional note (e.g. N/A - exposed valve)"
              onChange={(e) => setVal(e.target.value)}
              className="h-8 text-sm"
            />
          )}
        </div>
      );
    }
    if (f.type === "select" && f.options?.length) {
      return (
        <Select value={String(val ?? "")} onValueChange={setVal}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (f.type === "textarea") {
      return (
        <Textarea
          value={String(val ?? "")}
          onChange={(e) => setVal(e.target.value)}
          rows={2}
        />
      );
    }
    if (f.type === "date") {
      return (
        <Input
          value={String(val ?? "")}
          placeholder="dd/mm/yyyy"
          onChange={(e) => setVal(e.target.value)}
        />
      );
    }
    return (
      <Input
        value={String(val ?? "")}
        onChange={(e) => setVal(e.target.value)}
      />
    );
  };

  // ── UI ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" /> Scan paper job sheet
          </DialogTitle>
          <DialogDescription>
            Digitise a completed handwritten report. AI matches it to the closest template — you review the answers, pick the customer/site, and file it as a completed job.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && !queueItem && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single scan</TabsTrigger>
              <TabsTrigger value="bulk">Bulk scan</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-4 mt-4">
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
              >
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm">
                  Click to upload photo(s) or a PDF of the paper form(s), or drag & drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Multi-sheet PDFs are split automatically into a batch.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((im, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={im.url}
                        alt=""
                        className="w-full h-32 object-cover rounded border"
                      />
                      <button
                        className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100"
                        onClick={() => removeImg(idx)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {poMisdrop && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-sm space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">This looks like a purchase order, not a completed job sheet.</p>
                      {poMisdrop.reason && <p className="text-xs text-muted-foreground">{poMisdrop.reason}</p>}
                      <p className="text-xs text-muted-foreground">Create a job from it instead?</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={async () => {
                        const f = images[0]?.file;
                        if (!f) return;
                        const { logIntakeMisdrop } = await import("@/lib/logIntakeMisdrop");
                        await logIntakeMisdrop({
                          source: "scan_paper_report",
                          detected_kind: "purchase_order",
                          action: "redirected",
                          file_name: f.name,
                          reason: poMisdrop.reason,
                        });
                        onOpenChange(false);
                        onRedirectToPo?.(f);
                      }}
                      disabled={!onRedirectToPo || images.length === 0}
                    >
                      Create job from PO
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const { logIntakeMisdrop } = await import("@/lib/logIntakeMisdrop");
                        await logIntakeMisdrop({
                          source: "scan_paper_report",
                          detected_kind: "purchase_order",
                          action: "continued",
                          file_name: images[0]?.file?.name,
                          reason: poMisdrop.reason,
                        });
                        setPoMisdrop(null);
                        handleAnalyze();
                      }}
                    >
                      Continue as job sheet anyway
                    </Button>
                  </div>
                </div>
              )}


              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAnalyze}
                  disabled={images.length === 0}
                >
                  <ScanLine className="mr-2 h-4 w-4" /> Analyse form
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="bulk" className="mt-4">
              <BulkScanTab onClose={() => onOpenChange(false)} />
            </TabsContent>
          </Tabs>
        )}


        {step === "processing" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {processingMsg || "Working…"}
            </p>
          </div>
        )}

        {step === "review" && template && (
          <div className="space-y-4">
            {/* Template selector */}
            <div className="rounded-md border p-3 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">Detected template</div>
                  <div className="font-medium text-sm">{template.name}</div>
                </div>
                {candidates[0] && (
                  <Badge variant="secondary">
                    {Math.round((candidates[0].confidence || 0) * 100)}% match
                  </Badge>
                )}
              </div>
              {candidates.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Not right? Try:</span>
                  {candidates
                    .filter((c) => c.template_id !== template.id)
                    .map((c) => (
                      <Button
                        key={c.template_id}
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => handleTemplateChange(c.template_id)}
                      >
                        {c.name}
                      </Button>
                    ))}
                </div>
              )}
            </div>

            {(() => {
              const owner = String(
                (header as any)?.paperwork_owner_company || "",
              ).trim();
              const matched =
                (header as any)?.paperwork_owner_matched_customer_id;
              if (!owner) return null;
              const matchedSelected = matched && customerId === matched;
              return (
                <div
                  className={
                    "rounded border px-3 py-2 text-sm flex items-start gap-2 " +
                    (matchedSelected
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                      : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200")
                  }
                >
                  <span className="mt-0.5 text-base leading-none">🏷️</span>
                  <span>
                    Detected letterhead: <strong>{owner}</strong>
                    {matchedSelected
                      ? " — matched to selected customer."
                      : " — no matching customer in your list. Pick or create one below."}
                  </span>
                </div>
              );
            })()}

            {/* Job header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <CustomerCombobox
                  value={customerId}
                  customers={customers}
                  onChange={setCustomerId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Site *</Label>
                <div className="flex gap-1">
                  <SiteCombobox
                    value={siteId}
                    sites={sites}
                    onChange={setSiteId}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!customerId}
                    onClick={() => {
                      const headerSite = String((header as any)?.site || "").trim();
                      if (headerSite && !showNewSite) {
                        const parts = splitSiteHeaderForCreate(headerSite);
                        setNewSite((prev) => ({
                          name: prev.name || parts.name,
                          address: prev.address || parts.address,
                          postcode: prev.postcode || parts.postcode,
                          riser_location: prev.riser_location,
                        }));
                      }
                      setShowNewSite((s) => !s);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {/* Prefill hints from the OCR'd sheet */}
                {(() => {
                  const headerSite = String((header as any)?.site || "").trim();
                  if (!headerSite || !customerId) return null;
                  if (siteId && siteMatch?.confidence === "exact" && siteMatch.best?.id === siteId) {
                    return (
                      <div className="text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Matched from sheet: “{headerSite}”
                      </div>
                    );
                  }
                  if (!siteId && siteMatch?.confidence === "ambiguous") {
                    return (
                      <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-2 py-1.5 text-[11px] space-y-1">
                        <div className="text-amber-900 dark:text-amber-200">
                          Sheet says: <strong>{headerSite}</strong> — pick the best match:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {siteMatch.candidates.slice(0, 4).map((c) => (
                            <Button
                              key={c.id}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => setSiteId(c.id)}
                            >
                              {c.name}{c.postcode ? ` · ${c.postcode}` : ""}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (!siteId && siteMatch?.confidence === "none") {
                    return (
                      <div className="rounded border border-dashed px-2 py-1.5 text-[11px] flex items-center gap-2">
                        <span className="text-muted-foreground flex-1 truncate">
                          Sheet says: <strong>{headerSite}</strong> — no match on file.
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            const parts = splitSiteHeaderForCreate(headerSite);
                            setNewSite({
                              name: parts.name,
                              address: parts.address,
                              postcode: parts.postcode,
                              riser_location: "",
                            });
                            setShowNewSite(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Create site from sheet
                        </Button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>


            {showNewSite && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                <div className="text-xs font-medium">Create new site</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    placeholder="Site name"
                    value={newSite.name}
                    onChange={(e) =>
                      setNewSite({ ...newSite, name: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Postcode"
                    value={newSite.postcode}
                    onChange={(e) =>
                      setNewSite({ ...newSite, postcode: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Address"
                    className="md:col-span-2"
                    value={newSite.address}
                    onChange={(e) =>
                      setNewSite({ ...newSite, address: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Riser location (optional)"
                    className="md:col-span-2"
                    value={newSite.riser_location}
                    onChange={(e) =>
                      setNewSite({ ...newSite, riser_location: e.target.value })
                    }
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowNewSite(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCreateSite}>
                    Create site
                  </Button>
                </div>
              </div>
            )}

            {/* Site/customer mismatch guard */}
            {mismatches.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <div className="font-medium text-destructive">
                      This paper form may not belong to the selected {mismatches.map((m) => m.kind).join(" / ")}
                    </div>
                    {mismatches.map((m) => (
                      <div key={m.kind} className="text-xs">
                        <div>
                          <span className="text-muted-foreground">Paper says:</span>{" "}
                          <span className="font-medium">{m.extracted}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Selected:</span>{" "}
                          <span className="font-medium">{m.selected}</span>
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground pt-1">
                      Change the picker above, or tick below to file anyway.
                    </div>
                    <label className="flex items-center gap-2 text-xs pt-1">
                      <input
                        type="checkbox"
                        checked={ackMismatch}
                        onChange={(e) => setAckMismatch(e.target.checked)}
                      />
                      I've checked — file against the selected customer/site anyway
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Customer signature captured from the paper form. Engineer
                signatures are pulled from the stored engineer-signature
                library at PDF-render time, so nothing to review here. */}
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Customer signature from paper form
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[110px,1fr,auto] gap-2 items-center">
                <Label className="text-xs">Customer</Label>
                <div className="flex items-center gap-2">
                  {customerSig ? (
                    <img
                      src={customerSig.previewUrl}
                      alt="customer signature"
                      className="h-14 max-w-[220px] object-contain bg-muted rounded border"
                    />
                  ) : (
                    <span className="text-xs italic text-muted-foreground">
                      No signature captured
                      {header?.customer_signed_name
                        ? ` (name detected: ${String(header.customer_signed_name).trim()})`
                        : ""}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {customerSig && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCustomerSig(null)}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={images.length === 0}
                    onClick={() =>
                      setManualCrop({
                        role: "customer",
                        pageIdx: customerSig?.pageIdx ?? 0,
                      })
                    }
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    {customerSig ? "Redraw" : "Select from photo"}
                  </Button>
                </div>
              </div>
              {header?.engineer && (
                <p className="text-xs text-muted-foreground border-t pt-2">
                  Technician on this form: <strong>{String(header.engineer).trim()}</strong>.
                  {" "}Their stored signature (from Settings → Documents → Engineer signatures) will be used in the PDF automatically.
                </p>
              )}
              {manualCrop && images[manualCrop.pageIdx] && (
                <div className="border-t pt-3 space-y-2">
                  {images.length > 1 && (
                    <div className="flex gap-1 flex-wrap text-xs">
                      <span className="text-muted-foreground self-center">Page:</span>
                      {images.map((_, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant={manualCrop.pageIdx === i ? "default" : "outline"}
                          className="h-6"
                          onClick={() =>
                            setManualCrop({ ...manualCrop, pageIdx: i })
                          }
                        >
                          {i + 1}
                        </Button>
                      ))}
                    </div>
                  )}
                  <PaperSignatureCropper
                    imageUrl={images[manualCrop.pageIdx].url}
                    onCancel={() => setManualCrop(null)}
                    onCrop={(blob, previewUrl) => {
                      const name =
                        String(header?.customer_signed_name || "").trim() ||
                        "Customer";
                      setCustomerSig({
                        blob,
                        previewUrl,
                        name,
                        pageIdx: manualCrop.pageIdx,
                      });
                      setManualCrop(null);
                    }}
                  />
                </div>
              )}
            </div>





            {/* Historic backfill banner + optional match-to-existing-job */}
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-start gap-2 text-xs">
                <Badge variant="outline" className="border-amber-500/60 text-amber-700 bg-amber-500/10">
                  Historic backfill
                </Badge>
                <span className="text-muted-foreground">
                  Filed as a completed job dated to the paper form. Won't appear as active work,
                  never enters the planner, and never notifies engineers.
                </span>
              </div>
              {existingJobs.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Or file against an existing scheduled job at this site
                  </Label>
                  <Select
                    value={matchExistingJobId || "none"}
                    onValueChange={(v) => setMatchExistingJobId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        No — create a new historic job
                      </SelectItem>
                      {existingJobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.reference_number} — {j.name || "(no name)"} · {j.status}
                          {j.scheduled_date ? ` · ${j.scheduled_date}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {matchExistingJobId && (
                    <p className="text-[11px] text-muted-foreground">
                      The existing job will be marked completed on the handwritten date. No new job created.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Job name</Label>
                <Input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  disabled={!!matchExistingJobId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Date on paper form (dd/mm/yyyy) *
                </Label>
                <Input
                  value={completionDate}
                  placeholder="dd/mm/yyyy"
                  disabled={dateUnknown}
                  onChange={(e) => setCompletionDate(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <input
                    type="checkbox"
                    checked={dateUnknown}
                    onChange={(e) => {
                      setDateUnknown(e.target.checked);
                      if (e.target.checked) setCompletionDate("");
                    }}
                  />
                  Date unknown — file it anyway (job will be flagged
                  "date unknown" instead of silently dated today)
                </label>
              </div>
            </div>


            {missingFields.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                <div>
                  <div className="font-medium">
                    {missingFields.length} field
                    {missingFields.length === 1 ? "" : "s"} blank on the paper form
                  </div>
                  <div className="text-muted-foreground">
                    {missingFields.map((f) => f.label).slice(0, 5).join(" · ")}
                    {missingFields.length > 5 ? "…" : ""} — you can still file the job; blank answers will be omitted.
                  </div>
                </div>
              </div>
            )}

            {/* Fields */}
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {(() => {
                const bySection = new Map<string, TemplateField[]>();
                template.fields.forEach((f) => {
                  const s = f.section || "Details";
                  if (!bySection.has(s)) bySection.set(s, []);
                  bySection.get(s)!.push(f);
                });
                const out: JSX.Element[] = [];
                bySection.forEach((fields, section) => {
                  out.push(
                    <div key={section} className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium border-b pb-1">
                        {section}
                      </div>
                      {fields.map((f) => (
                        <div
                          key={f.id}
                          className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start"
                        >
                          <Label className="text-sm pt-1.5">
                            {f.label}
                          </Label>
                          <div>{renderField(f)}</div>
                        </div>
                      ))}
                    </div>,
                  );
                });
                return out;
              })()}
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t">
              <div>
                {queueItem && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={saving}
                    onClick={async () => {
                      if (!user) return;
                      await supabase
                        .from("paper_scan_batch_items")
                        .update({
                          status: "rejected",
                          reviewed_by: user.id,
                          reviewed_at: new Date().toISOString(),
                        })
                        .eq("id", queueItem.itemId);
                      toast({ title: "Discarded" });
                      onQueueItemResolved?.();
                      onOpenChange(false);
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Discard
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {!queueItem && (
                  <Button
                    variant="outline"
                    onClick={() => setStep("upload")}
                    disabled={saving}
                  >
                    Back
                  </Button>
                )}
                <Button onClick={handleConfirm} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Confirm & file job
                </Button>
              </div>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
