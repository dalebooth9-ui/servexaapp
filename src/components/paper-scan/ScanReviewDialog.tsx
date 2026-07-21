// ScanReviewDialog — SINGLE review UI for every paper-scan door.
//
// Historically the app had two separate review dialogs: `ArchiveReviewDialog`
// (archive-only) and `ScanCompletedJobDialog` (job-mode, ~1800 LOC). Every
// parity fix — confidence flags, signature cropper, customer/site pickers,
// site-from-header prefill, letterhead guard — had to land twice, and one of
// them always drifted. This component is the merger of the two.
//
// Modes:
//   • "archive"  → files a queue item into archived_documents (no job)
//   • "job"      → files a queue item as a completed job via the
//                  confirm_paper_scan_job RPC
//
// Everything above the destination section is identical between modes. The
// destination section renders the tiny mode-specific bit (archive filing vs
// job name / matched-existing / date-known confirm).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Archive,
  XCircle,
  AlertTriangle,
  Building2,
  FileText,
  PenLine,
  Briefcase,
} from "lucide-react";
import CustomerCombobox, {
  type CustomerOption,
} from "@/components/CustomerCombobox";
import SiteCombobox, { type SiteOption } from "@/components/SiteCombobox";
import { archiveScanConfirm } from "@/lib/archiveScanConfirm";
import { confirmScanQueueAsJob } from "@/lib/confirmScanQueueAsJob";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";
import { matchSiteFromHeader } from "@/lib/matchSiteFromHeader";
import {
  proposeDefectsFromExtraction,
  createArchiveSourcedDefects,
  type ProposedDefect,
} from "@/lib/proposeArchiveDefects";
import ProposedDefectsSection from "@/components/paper-scan/ProposedDefectsSection";
import PaperSignatureCropper from "@/components/paper-scan/PaperSignatureCropper";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

const createDefectSuffix = (n: number) =>
  n > 0 ? ` · ${n} defect${n === 1 ? "" : "s"} logged` : "";

// Canonical shape a queue item takes when passed into this dialog. Both modes
// share it — the queue writer decides mode when it hands the item over.
export type ScanQueueItemInput = {
  itemId: string;
  batchId: string | null;
  templateId: string | null;
  templateName: string | null;
  documentType: string | null;
  extracted: Record<string, any>;
  header: Record<string, any>;
  imagePaths: string[];
  guessCustomerId: string | null;
  guessSiteId: string | null;
  guessDate: string | null; // yyyy-mm-dd
  // Job-mode extra: candidate existing jobs the AI thinks this scan belongs
  // to (for the "append to existing job" pattern). Empty in archive mode.
  candidateMatches?: Array<{
    job_id: string;
    reference_number: string;
    score: number;
    reason?: string;
    category?: string | null;
  }>;
};

type TemplateField = {
  id: string;
  label: string;
  type: string;
  section?: string;
  options?: string[];
  required?: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "job" | "archive";
  item: ScanQueueItemInput | null;
  onResolved: () => void;
}

// yyyy-mm-dd → dd/mm/yyyy for the job-mode date input
function isoToUk(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Derive a job category from the template metadata (mirrors the logic that
// used to live inline in ScanCompletedJobDialog).
function deriveJobCategory(template: {
  category?: string | null;
  job_category?: string | null;
}): string {
  const cat = (template.category || "").toLowerCase();
  const jc = (template.job_category || "").toLowerCase();
  if (cat === "pressure_test" || jc.includes("pressure_test"))
    return "pressure_test";
  if (cat === "visual" || jc.includes("visual")) return "visual";
  if (
    cat === "sprinkler" ||
    cat === "sprinkler_service" ||
    cat === "commercial_sprinkler_service" ||
    jc.startsWith("sprinkler") ||
    jc.includes("sprinkler")
  )
    return "commercial_sprinkler_service";
  if (jc.startsWith("fire_hydrant") || jc.startsWith("hydrant") || cat.startsWith("hydrant"))
    return "fire_hydrant";
  if (jc.startsWith("wet_riser") || cat.startsWith("wet_riser")) return "wet_riser";
  if (jc.startsWith("dry_riser") || cat.startsWith("dry_riser")) return "dry_riser";
  if (
    jc.startsWith("fire_extinguisher") ||
    cat.startsWith("fire_extinguisher") ||
    jc.startsWith("extinguisher")
  )
    return "fire_extinguisher";
  return template.category || template.job_category || "general";
}

export default function ScanReviewDialog({
  open,
  onOpenChange,
  mode,
  item,
  onResolved,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [docDate, setDocDate] = useState(""); // yyyy-mm-dd for archive
  const [ukDate, setUkDate] = useState(""); // dd/mm/yyyy for job
  const [dateUnknown, setDateUnknown] = useState(false);
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [templateMeta, setTemplateMeta] = useState<{
    name: string | null;
    category: string | null;
    job_category: string | null;
  }>({ name: null, category: null, job_category: null });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [engineers, setEngineers] = useState<
    { user_id: string; full_name: string; has_signature: boolean }[]
  >([]);
  const [technicianUserId, setTechnicianUserId] = useState<string>("");

  // Defect proposals (archive mode only; job mode already has remedial items
  // via the normal job path).
  const [defectSelection, setDefectSelection] = useState<Record<string, boolean>>({});
  const [defectOverrides, setDefectOverrides] = useState<
    Record<string, Partial<ProposedDefect>>
  >({});

  // Job-mode extra state
  const [jobName, setJobName] = useState("");
  const [matchExistingJobId, setMatchExistingJobId] = useState<string>("");

  // Manual signature capture (both modes)
  type SigCapture = { blob: Blob; previewUrl: string; pageIdx: number };
  const [customerSig, setCustomerSig] = useState<SigCapture | null>(null);
  const [engineerSig, setEngineerSig] = useState<SigCapture | null>(null);
  const [manualCrop, setManualCrop] = useState<{
    role: "customer" | "engineer";
    pageIdx: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setCustomerId(item.guessCustomerId || "");
    setSiteId(item.guessSiteId || "");
    const headerSite = String((item.header as any)?.site || "").trim();
    setSiteName(headerSite);
    setSiteAddress(headerSite);
    setDocDate(item.guessDate || "");
    setUkDate(isoToUk(item.guessDate));
    setDateUnknown(false);
    setDocType(item.documentType || item.templateName || "");
    setTitle(item.templateName || "");
    setNotes("");
    setAnswers({ ...(item.extracted || {}) });
    setTemplateFields([]);
    setTemplateMeta({ name: null, category: null, job_category: null });
    setDefectSelection({});
    setDefectOverrides({});
    setJobName("");
    setMatchExistingJobId("");
    setCustomerSig(null);
    setEngineerSig(null);
  }, [open, item]);

  useEffect(() => {
    if (!open || !item?.templateId) return;
    setLoadingTemplate(true);
    (async () => {
      const { data } = await supabase
        .from("job_sheet_templates")
        .select("name, category, job_category, fields")
        .eq("id", item.templateId!)
        .maybeSingle();
      const raw = Array.isArray((data as any)?.fields)
        ? ((data as any).fields as any[])
        : [];
      setTemplateFields(raw as TemplateField[]);
      setTemplateMeta({
        name: (data as any)?.name ?? null,
        category: (data as any)?.category ?? null,
        job_category: (data as any)?.job_category ?? null,
      });
      setLoadingTemplate(false);
    })();
  }, [open, item?.templateId]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: cs } = await supabase
        .from("customers")
        .select("id, name, email")
        .order("name");
      setCustomers((cs as any) || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !item) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, signature_data");
      const list = ((data as any[]) || [])
        .filter((p) => p.full_name)
        .map((p) => ({
          user_id: p.user_id as string,
          full_name: p.full_name as string,
          has_signature: !!p.signature_data,
        }));
      setEngineers(list);
      const raw = String((item.header as any)?.engineer || "").trim();
      if (raw && list.length > 0) {
        const withSig = list.filter((e) => e.has_signature);
        const pool = withSig.length > 0 ? withSig : list;
        const matched = fuzzyMatchEngineer(raw, pool);
        const found = pool.find(
          (e) => e.full_name.toUpperCase() === matched.toUpperCase(),
        );
        setTechnicianUserId(found ? found.user_id : "");
      } else {
        setTechnicianUserId("");
      }
    })();
  }, [open, item]);

  useEffect(() => {
    if (!open) return;
    if (!customerId) {
      setSites([]);
      return;
    }
    (async () => {
      const { data: ss } = await (supabase as any)
        .from("sites")
        .select("id, name, address, postcode")
        .eq("customer_id", customerId)
        .order("name");
      const list = (ss as any as SiteOption[]) || [];
      setSites(list);
      if (!siteId && item) {
        const headerSite = String((item.header as any)?.site || "").trim();
        if (headerSite) {
          const result = matchSiteFromHeader(list, headerSite);
          if (result.confidence === "exact" && result.best) {
            setSiteId(result.best.id);
          }
        }
      }
    })();
  }, [open, customerId, item, siteId]);

  useEffect(() => {
    if (!siteId) return;
    const s = sites.find((x) => x.id === siteId);
    if (!s) return;
    setSiteName(s.name || "");
    setSiteAddress(s.address || "");
  }, [siteId, sites]);

  useEffect(() => {
    if (!open || !item?.imagePaths?.length) {
      setThumbs([]);
      return;
    }
    (async () => {
      const urls: string[] = [];
      for (const p of item.imagePaths) {
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(p, 60 * 60);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      setThumbs(urls);
    })();
  }, [open, item]);

  const orgIdPromise = useMemo(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return (data as any)?.org_id || null;
  }, [user]);

  const updateAnswer = (id: string, value: any) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const sections = useMemo(() => {
    const map = new Map<string, TemplateField[]>();
    for (const f of templateFields) {
      const s = f.section || "Answers";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    }
    return Array.from(map.entries());
  }, [templateFields]);

  const proposedDefects = useMemo(() => {
    if (!item || mode !== "archive") return [] as ProposedDefect[];
    return proposeDefectsFromExtraction(
      templateFields as any,
      answers,
      (item.header || {}) as any,
    );
  }, [item, mode, templateFields, answers]);

  const renderFieldInput = (field: TemplateField) => {
    const value = answers[field.id];
    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            rows={2}
            value={value ?? ""}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
          />
        );
      case "select":
      case "dropdown":
        return (
          <Select
            value={value ?? ""}
            onValueChange={(v) => updateAnswer(field.id, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "radio":
      case "pass_fail":
      case "yes_no":
      case "multiple_choice": {
        const opts =
          field.options && field.options.length > 0
            ? field.options
            : field.type === "yes_no"
              ? ["Yes", "No"]
              : field.type === "pass_fail"
                ? ["Pass", "Fail"]
                : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {opts.map((o) => (
              <Button
                key={o}
                type="button"
                size="sm"
                variant={value === o ? "default" : "outline"}
                onClick={() => updateAnswer(field.id, o)}
              >
                {o}
              </Button>
            ))}
          </div>
        );
      }
      case "checkbox":
      case "boolean":
        return (
          <Checkbox
            checked={!!value}
            onCheckedChange={(c) => updateAnswer(field.id, !!c)}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={value ?? ""}
            onChange={(e) =>
              updateAnswer(
                field.id,
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={value ?? ""}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
          />
        );
      default:
        return (
          <Input
            value={value ?? ""}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
          />
        );
    }
  };

  // Shared "file it" — archive mode
  const fileArchive = async (asUnmatched = false) => {
    if (!user || !item) return;
    const orgId = await orgIdPromise;
    if (!orgId) {
      toast({ title: "No organisation found", variant: "destructive" });
      return;
    }
    if (!asUnmatched && !customerId) {
      toast({
        title: "Pick a customer",
        description:
          "Choose a customer to file this under, or send it to the Unmatched bucket.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      let manualCustomerSignaturePath: string | null = null;
      let manualEngineerSignaturePath: string | null = null;
      const uploadSig = async (
        role: "customer" | "engineer",
        sig: SigCapture,
      ): Promise<string | null> => {
        const rel = `${user.id}/archive-${item.itemId}-${role}-paper-${Date.now()}.png`;
        const dest = await buildOrgPathAsync(rel);
        const { error: upErr } = await supabase.storage
          .from("signatures")
          .upload(dest, sig.blob, { contentType: "image/png", upsert: false });
        if (upErr) {
          console.error("[scan-review] signature upload failed", role, upErr);
          return null;
        }
        return dest;
      };
      if (!asUnmatched && customerSig) {
        manualCustomerSignaturePath = await uploadSig("customer", customerSig);
      }
      if (!asUnmatched && engineerSig) {
        manualEngineerSignaturePath = await uploadSig("engineer", engineerSig);
      }

      const result = await archiveScanConfirm({
        userId: user.id,
        orgId,
        itemId: item.itemId,
        batchId: item.batchId,
        templateId: item.templateId,
        templateName: item.templateName,
        documentType: docType || null,
        customerId: asUnmatched ? null : customerId || null,
        siteId: asUnmatched ? null : siteId || null,
        siteName: asUnmatched ? null : siteName || null,
        siteAddress: asUnmatched ? null : siteAddress || null,
        documentDate: docDate || null,
        title: title || null,
        notes: notes || null,
        extracted: answers || {},
        header: item.header || {},
        storagePhotoPaths: item.imagePaths || [],
        status: asUnmatched ? "unmatched" : "filed",
        templateFields: asUnmatched ? null : templateFields,
        technicianName: (() => {
          if (asUnmatched) return null;
          const e = engineers.find((x) => x.user_id === technicianUserId);
          return e && e.has_signature ? e.full_name : null;
        })(),
        manualCustomerSignaturePath,
        manualEngineerSignaturePath,
      });

      let createdDefectCount = 0;
      if (!asUnmatched && proposedDefects.length > 0 && (result as any).archivedId) {
        const confirmed = proposedDefects
          .filter((p) => defectSelection[p.key] !== false)
          .map((p) => ({ ...p, ...(defectOverrides[p.key] || {}) }));
        if (confirmed.length > 0) {
          try {
            const created = await createArchiveSourcedDefects({
              userId: user.id,
              archivedId: (result as any).archivedId,
              customerId: customerId || null,
              siteId: siteId || null,
              documentDate: docDate || null,
              templateName: title || item.templateName || null,
              proposals: confirmed,
            });
            createdDefectCount = created.length;
          } catch (defectErr: any) {
            console.error("[scan-review] defect create failed", defectErr);
            toast({
              title: "Filed, but defects failed",
              description:
                defectErr?.message ||
                "Defects couldn't be created — open them from the Defects page.",
              variant: "destructive",
            });
          }
        }
      }
      toast({
        title: asUnmatched
          ? "Filed as Unmatched"
          : result.reportPdfPath
            ? `Filed with electronic report${createDefectSuffix(createdDefectCount)}`
            : `Filed to archive (scan only)${createDefectSuffix(createdDefectCount)}`,
      });
      onResolved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Couldn't file document",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Job mode — mirrors ScanCompletedJobDialog.handleConfirm minus the upload
  // step (queue items already have imagePaths).
  const fileAsJob = async () => {
    if (!user || !item || !item.templateId) return;
    if (!customerId) {
      toast({ title: "Choose a customer", variant: "destructive" });
      return;
    }
    if (!siteId) {
      toast({ title: "Choose or create a site", variant: "destructive" });
      return;
    }
    if (!ukDate && !dateUnknown) {
      toast({
        title: "Enter the date from the sheet",
        description:
          "Type the date handwritten on the paper form (dd/mm/yyyy) — or tick 'Date unknown'.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const category = deriveJobCategory(templateMeta);
      const dateKnown = !!ukDate;
      const result = await confirmScanQueueAsJob({
        userId: user.id,
        itemId: item.itemId,
        batchId: item.batchId,
        templateId: item.templateId,
        category,
        customerId,
        siteId,
        overrideJobName: jobName.trim() || null,
        existingJobId: matchExistingJobId || null,
        completionDate: ukDate || null,
        dateKnown,
        responses: answers,
        header: item.header || {},
        imagePaths: item.imagePaths || [],
        customerSignatureBlob: customerSig?.blob || null,
        engineerSignatureBlob: engineerSig?.blob || null,
      });
      toast({
        title: `Job ${result.jobRef} filed`,
        description: "Paper report digitised. Opening the job now.",
      });
      onResolved();
      onOpenChange(false);
      navigate(`/jobs/${result.jobId}`);
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

  const discard = async () => {
    if (!user || !item) return;
    setSaving(true);
    try {
      await supabase
        .from("paper_scan_batch_items")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", item.itemId);
      toast({ title: "Discarded" });
      onResolved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasTemplate = !!item?.templateId;
  const isJob = mode === "job";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isJob ? (
              <>
                <Briefcase className="h-5 w-5" /> File as completed job
              </>
            ) : (
              <>
                <Archive className="h-5 w-5" /> File to archive
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isJob
              ? "Backfilling a paper report as a completed job. Confirm the extraction, then file — a job is created and the scan attaches as source document."
              : "Archive-only — no job is created. Confirm the filing details and file. If a template was matched, a clean electronic report is generated as the primary document."}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            {thumbs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {thumbs.map((u, i) => (
                  <img
                    key={i}
                    src={u}
                    alt={`Page ${i + 1}`}
                    className="h-40 rounded border object-contain bg-muted"
                  />
                ))}
              </div>
            )}

            <div className="text-xs flex gap-2 items-center flex-wrap">
              {item.templateName ? (
                <Badge variant="secondary">Template: {item.templateName}</Badge>
              ) : (
                <Badge variant="outline">
                  {isJob
                    ? "No template matched"
                    : "No template matched — will file as scan-only"}
                </Badge>
              )}
              <span className="text-muted-foreground">
                {item.imagePaths.length} page
                {item.imagePaths.length === 1 ? "" : "s"}
              </span>
            </div>

            {(() => {
              const owner = String(
                (item.header as any)?.paperwork_owner_company || "",
              ).trim();
              const matched =
                (item.header as any)?.paperwork_owner_matched_customer_id;
              if (!owner) return null;
              if (matched && customerId === matched) {
                return (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 px-3 py-2 text-sm flex items-start gap-2">
                    <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Detected letterhead: <strong>{owner}</strong> — matched to
                      selected customer.
                    </span>
                  </div>
                );
              }
              return (
                <div className="rounded border border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Detected letterhead: <strong>{owner}</strong> — no matching
                    customer in your list. Pick an existing customer below or
                    create one, then file.
                  </span>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <CustomerCombobox
                  value={customerId}
                  customers={customers}
                  onChange={(v) => {
                    setCustomerId(v);
                    setSiteId("");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Site{" "}
                  {siteId ? "" : "(no matching record — free text will be filed)"}
                </Label>
                <SiteCombobox value={siteId} sites={sites} onChange={setSiteId} />
              </div>
              <div className="space-y-1.5 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Site name (from sheet)</Label>
                  <Input
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="e.g. The Slate Yard — Graphite Building"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Site address (from sheet)</Label>
                  <Input
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    placeholder="Full address including postcode"
                  />
                </div>
              </div>
              {!isJob && (
                <>
                  <div className="space-y-1.5">
                    <Label>Document date</Label>
                    <Input
                      type="date"
                      value={docDate}
                      onChange={(e) => setDocDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Document type</Label>
                    <Input
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      placeholder="e.g. Dry Riser Annual"
                    />
                  </div>
                </>
              )}
              <div className="space-y-1.5 md:col-span-2">
                <Label>
                  Technician signature{" "}
                  <span className="text-muted-foreground font-normal">
                    (applies this engineer's stored profile signature)
                  </span>
                </Label>
                <Select
                  value={technicianUserId || "__none__"}
                  onValueChange={(v) =>
                    setTechnicianUserId(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No signature applied" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      No signature applied (leave blank)
                    </SelectItem>
                    {engineers.map((e) => (
                      <SelectItem key={e.user_id} value={e.user_id}>
                        {e.full_name}
                        {!e.has_signature ? " — no stored signature" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const rawTech = String(
                    (item.header as any)?.engineer || "",
                  ).trim();
                  const chosen = engineers.find(
                    (e) => e.user_id === technicianUserId,
                  );
                  if (!rawTech) return null;
                  return (
                    <p className="text-xs text-muted-foreground">
                      Scan reads &quot;{rawTech}&quot;
                      {chosen
                        ? ` → matched to ${chosen.full_name}${chosen.has_signature ? "" : " (no signature on file)"}`
                        : " → no engineer matched. Pick one to stamp their signature."}
                    </p>
                  );
                })()}
              </div>
              {!isJob && (
                <>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Title</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Short label (optional)"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything the office should know"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Manual signature capture — identical UI in both modes */}
            {thumbs.length > 0 && (
              <div className="rounded border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PenLine className="h-4 w-4" /> Signatures from original scan
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SigSlot
                    label="Customer signature"
                    autoDetected={
                      !!(item.header as any)?.customer_signature_bbox
                    }
                    sig={customerSig}
                    onClear={() => setCustomerSig(null)}
                    onSelect={(pageIdx) =>
                      setManualCrop({ role: "customer", pageIdx })
                    }
                    pageCount={thumbs.length}
                  />
                  {!technicianUserId && (
                    <SigSlot
                      label="Technician signature"
                      autoDetected={
                        !!(item.header as any)?.engineer_signature_bbox
                      }
                      sig={engineerSig}
                      onClear={() => setEngineerSig(null)}
                      onSelect={(pageIdx) =>
                        setManualCrop({ role: "engineer", pageIdx })
                      }
                      pageCount={thumbs.length}
                    />
                  )}
                </div>
                {manualCrop && (
                  <Dialog
                    open={!!manualCrop}
                    onOpenChange={(o) => !o && setManualCrop(null)}
                  >
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>
                          Select {manualCrop.role} signature — page{" "}
                          {manualCrop.pageIdx + 1}
                        </DialogTitle>
                      </DialogHeader>
                      <PaperSignatureCropper
                        imageUrl={thumbs[manualCrop.pageIdx]}
                        onCancel={() => setManualCrop(null)}
                        onCrop={(blob, previewUrl) => {
                          const capture = {
                            blob,
                            previewUrl,
                            pageIdx: manualCrop.pageIdx,
                          };
                          if (manualCrop.role === "customer") {
                            setCustomerSig(capture);
                          } else {
                            setEngineerSig(capture);
                          }
                          setManualCrop(null);
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}

            {proposedDefects.length > 0 && (
              <ProposedDefectsSection
                proposals={proposedDefects}
                selection={defectSelection}
                onSelectionChange={setDefectSelection}
                overrides={defectOverrides}
                onOverridesChange={setDefectOverrides}
              />
            )}

            {hasTemplate && (
              <div className="rounded border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Extracted answers
                  {loadingTemplate && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                {!loadingTemplate && templateFields.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Template has no fields — the electronic report will still
                    render with header data only.
                  </p>
                )}
                {(() => {
                  const conf =
                    ((item.header as any)?._field_confidence as
                      | Record<string, number>
                      | undefined) || {};
                  return sections.map(([sectionName, sectionFields]) => (
                    <div key={sectionName} className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {sectionName}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {sectionFields.map((field) => {
                          const rawConf = conf[field.id];
                          const hasVal =
                            answers[field.id] !== undefined &&
                            answers[field.id] !== null &&
                            String(answers[field.id]).trim() !== "";
                          const lowConf =
                            hasVal &&
                            typeof rawConf === "number" &&
                            rawConf < 0.7;
                          const unanswered = !hasVal;
                          return (
                            <div
                              key={field.id}
                              className={`space-y-1 rounded-md ${
                                lowConf
                                  ? "border border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-2"
                                  : unanswered
                                    ? "border border-dashed border-muted-foreground/30 p-2"
                                    : ""
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">{field.label}</Label>
                                {lowConf && (
                                  <span
                                    title={`Low OCR confidence (${Math.round(
                                      rawConf * 100,
                                    )}%) — check against scan`}
                                    className="text-[10px] font-medium text-amber-700 dark:text-amber-400"
                                  >
                                    ⚠ check
                                  </span>
                                )}
                                {unanswered && (
                                  <span
                                    title="Not extracted — no clear mark on the sheet"
                                    className="text-[10px] font-medium text-muted-foreground"
                                  >
                                    unanswered
                                  </span>
                                )}
                              </div>
                              {renderFieldInput(field)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Destination-specific section — the ONLY per-mode UI */}
            {isJob && (
              <div className="rounded border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Briefcase className="h-4 w-4" /> Job details
                </div>
                {item.candidateMatches && item.candidateMatches.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Append to existing job (optional)</Label>
                    <Select
                      value={matchExistingJobId || "none"}
                      onValueChange={(v) =>
                        setMatchExistingJobId(v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Create new job (default)
                        </SelectItem>
                        {item.candidateMatches.map((c) => (
                          <SelectItem key={c.job_id} value={c.job_id}>
                            {c.reference_number}
                            {c.reason ? ` — ${c.reason}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Job name (optional override)</Label>
                    <Input
                      value={jobName}
                      onChange={(e) => setJobName(e.target.value)}
                      disabled={!!matchExistingJobId}
                      placeholder="Auto-generated from template + site"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Completion date (dd/mm/yyyy)</Label>
                    <Input
                      value={ukDate}
                      onChange={(e) => setUkDate(e.target.value)}
                      disabled={dateUnknown}
                      placeholder="dd/mm/yyyy"
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={dateUnknown}
                        onCheckedChange={(c) => {
                          const on = !!c;
                          setDateUnknown(on);
                          if (on) setUkDate("");
                        }}
                      />
                      Date unknown — file without one
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-between pt-2 border-t">
              <Button
                variant="ghost"
                type="button"
                onClick={discard}
                disabled={saving}
              >
                <XCircle className="mr-1.5 h-4 w-4" /> Discard
              </Button>
              <div className="flex gap-2">
                {!isJob && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => fileArchive(true)}
                    disabled={saving}
                  >
                    File as Unmatched
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => (isJob ? fileAsJob() : fileArchive(false))}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : isJob ? (
                    <Briefcase className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Archive className="mr-1.5 h-4 w-4" />
                  )}
                  {isJob
                    ? "File as completed job"
                    : hasTemplate
                      ? "File with electronic report"
                      : "File to archive"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SigSlot({
  label,
  autoDetected,
  sig,
  onSelect,
  onClear,
  pageCount,
}: {
  label: string;
  autoDetected: boolean;
  sig: { previewUrl: string; pageIdx: number } | null;
  onSelect: (pageIdx: number) => void;
  onClear: () => void;
  pageCount: number;
}) {
  const [page, setPage] = useState(0);
  return (
    <div className="space-y-1.5 rounded border bg-background p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {autoDetected && !sig && (
          <span className="text-[10px] text-muted-foreground">
            auto-detected on scan
          </span>
        )}
      </div>
      {sig ? (
        <div className="space-y-1.5">
          <div className="rounded border bg-white p-1 flex items-center justify-center h-16">
            <img
              src={sig.previewUrl}
              alt={`${label} preview`}
              className="max-h-14 object-contain"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              from page {sig.pageIdx + 1}
            </span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelect(sig.pageIdx)}
              >
                Reselect
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {pageCount > 1 && (
            <Select
              value={String(page)}
              onValueChange={(v) => setPage(Number(v))}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: pageCount }).map((_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    Page {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onSelect(page)}
          >
            <PenLine className="mr-1.5 h-3.5 w-3.5" /> Select from photo
          </Button>
        </div>
      )}
    </div>
  );
}
