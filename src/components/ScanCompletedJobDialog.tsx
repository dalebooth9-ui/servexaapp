import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [showNewSite, setShowNewSite] = useState(false);
  const [newSite, setNewSite] = useState({
    name: "",
    address: "",
    postcode: "",
    riser_location: "",
  });

  const [jobName, setJobName] = useState("");
  const [completionDate, setCompletionDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Cropped signatures (auto or manual) — uploaded on confirm
  type SigCapture = { blob: Blob; previewUrl: string; name: string; pageIdx: number };
  const [customerSig, setCustomerSig] = useState<SigCapture | null>(null);
  const [manualCrop, setManualCrop] = useState<{
    role: "customer";
    pageIdx: number;
  } | null>(null);
  const [ackMismatch, setAckMismatch] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

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
      setShowNewSite(false);
      setNewSite({ name: "", address: "", postcode: "", riser_location: "" });
      setJobName("");
      setCompletionDate("");
      setProcessingMsg("");
      setEngineerSig(null);
      setCustomerSig(null);
      setManualCrop(null);
      setAckMismatch(false);
    }
  }, [open]);

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
      });
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
  const addFiles = (fs: FileList | null) => {
    if (!fs || fs.length === 0) return;
    const arr = Array.from(fs).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [
      ...prev,
      ...arr.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
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

    const { data, error } = await supabase.functions.invoke("ocr-job-sheet", {
      body: {
        images: imagePayloads,
        template_name: tplObj.name,
        fields: tplObj.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          section: f.section,
          options: f.options,
        })),
      },
    });
    if (error) throw new Error(error.message || "OCR failed");
    const extracted: Record<string, any> = data?.extracted || {};
    const hdr: Record<string, any> = data?.header || {};

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

      setProcessingMsg("Matching against templates…");
      const { data: clsData, error: clsErr } = await supabase.functions.invoke(
        "classify-job-sheet-template",
        { body: { images: imagePayloads } },
      );
      if (clsErr) throw new Error(clsErr.message || "Classification failed");
      const cands: Candidate[] = clsData?.candidates || [];
      if (cands.length === 0) {
        throw new Error(
          "Couldn't match the form to any template. Try a clearer photo, or select a template manually after upload.",
        );
      }
      setCandidates(cands);

      const hdr = await loadTemplateAndExtract(cands[0].template_id, imagePayloads);
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
    if (!siteId) {
      toast({ title: "Choose or create a site", variant: "destructive" });
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
    setSaving(true);
    try {
      const site = sites.find((s) => s.id === siteId);
      const jobAddress = [site?.address, site?.postcode]
        .filter(Boolean)
        .join(", ");

      // Derive completion timestamp
      let completedAt = new Date().toISOString();
      if (completionDate) {
        // dd/mm/yyyy
        const m = completionDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          completedAt = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`).toISOString();
        }
      }

      const category =
        template.category === "pressure_test"
          ? "pressure_test"
          : template.category === "visual"
            ? "visual"
            : template.category === "sprinkler" ||
                template.category === "sprinkler_service" ||
                template.category === "commercial_sprinkler_service"
              ? "commercial_sprinkler_service"
              : (template.category || template.job_category || "general");

      // Insert job
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .insert({
          name: jobName || `${template.name} — backfilled`,
          customer: selectedCustomer?.name || null,
          customer_id: customerId,
          site_id: siteId,
          address: jobAddress || null,
          status: "completed",
          priority: "medium",
          category,
          source: "paper backfill",
          created_by: user.id,
          completed_by: user.id,
          completed_at: completedAt,
          pressure_test_qty: category === "pressure_test" ? 1 : 0,
          visual_qty: category === "visual" ? 1 : 0,
          other_qty: category !== "pressure_test" && category !== "visual" ? 1 : 0,
        } as any)
        .select("id, reference_number")
        .single();
      if (jobErr) throw jobErr;
      const jobId = (job as any).id;
      const jobRef = (job as any).reference_number;

      // Insert job_sheet_responses — strip blank/undefined so the payload
      // only contains real answers (paper backfill: all template fields optional).
      const fullResponses: Record<string, any> = {};
      for (const [k, v] of Object.entries(responses)) {
        if (v === undefined || v === null || v === "") continue;
        fullResponses[k] = v;
      }
      // Ensure header sub-fields land in response if template has matching IDs
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

      const { error: respErr } = await supabase
        .from("job_sheet_responses")
        .insert({
          job_id: jobId,
          template_id: template.id,
          submitted_by: user.id,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          responses: fullResponses,
        } as any);
      if (respErr) throw respErr;

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
        // Mark queue item confirmed
        await supabase
          .from("paper_scan_batch_items")
          .update({
            status: "confirmed",
            created_job_id: jobId,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", queueItem.itemId);
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
            .upload(path, img.file, {
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
          .upload(path, sig.blob, { contentType: "image/png" });
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
      if (engineerSig) await uploadSig(engineerSig, "engineer");
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
                  Click to upload photo(s) of one paper form, or drag & drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Add front and back / multiple pages if needed.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
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
                    onClick={() => setShowNewSite((s) => !s)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
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





            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Job name</Label>
                <Input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Completion date (dd/mm/yyyy)</Label>
                <Input
                  value={completionDate}
                  placeholder="dd/mm/yyyy"
                  onChange={(e) => setCompletionDate(e.target.value)}
                />
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
