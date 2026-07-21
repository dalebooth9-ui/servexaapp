import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import CustomerCombobox, {
  type CustomerOption,
} from "@/components/CustomerCombobox";
import SiteCombobox, { type SiteOption } from "@/components/SiteCombobox";
import { archiveScanConfirm } from "@/lib/archiveScanConfirm";
import { fuzzyMatchEngineer } from "@/lib/fuzzyEngineerMatch";
import {
  proposeDefectsFromExtraction,
  createArchiveSourcedDefects,
  type ProposedDefect,
} from "@/lib/proposeArchiveDefects";
import ProposedDefectsSection from "@/components/paper-scan/ProposedDefectsSection";

const createDefectSuffix = (n: number) =>
  n > 0 ? ` · ${n} defect${n === 1 ? "" : "s"} logged` : "";

// A single queue item filed as a standalone archived document (no job).
export type ArchiveQueueItemInput = {
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
  guessDate: string | null;
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
  item: ArchiveQueueItemInput | null;
  onResolved: () => void;
}

export default function ArchiveReviewDialog({
  open,
  onOpenChange,
  item,
  onResolved,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [docDate, setDocDate] = useState("");
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  // Engineer signature matching — office confirms which employee profile's
  // stored signature to stamp as the technician signature on the electronic
  // report, on the basis that the scanned original bears their handwritten
  // signature. "" = no signature applied; UUID = user_id of matched engineer.
  const [engineers, setEngineers] = useState<
    { user_id: string; full_name: string; has_signature: boolean }[]
  >([]);
  const [technicianUserId, setTechnicianUserId] = useState<string>("");

  // Proposed defects derived from the extracted answers. Office reviews the
  // ticklist before anything is written to the defects table.
  const [defectSelection, setDefectSelection] = useState<Record<string, boolean>>({});
  const [defectOverrides, setDefectOverrides] = useState<Record<string, Partial<ProposedDefect>>>({});

  useEffect(() => {
    if (!open || !item) return;
    setCustomerId(item.guessCustomerId || "");
    setSiteId(item.guessSiteId || "");
    // Prefill free-text site name / address from the OCR header block so
    // the office doesn't have to retype them. When a site record is also
    // matched (guessSiteId) these will get overwritten below by the
    // matched site's own name/address.
    const headerSite = String((item.header as any)?.site || "").trim();
    setSiteName(headerSite);
    setSiteAddress(headerSite);
    setDocDate(item.guessDate || "");
    setDocType(item.documentType || item.templateName || "");
    setTitle(item.templateName || "");
    setNotes("");
    setAnswers({ ...(item.extracted || {}) });
    setTemplateFields([]);
    setDefectSelection({});
    setDefectOverrides({});
  }, [open, item]);

  // Load full template fields for the editable answers panel
  useEffect(() => {
    if (!open || !item?.templateId) return;
    setLoadingTemplate(true);
    (async () => {
      const { data } = await supabase
        .from("job_sheet_templates")
        .select("fields")
        .eq("id", item.templateId!)
        .maybeSingle();
      const raw = Array.isArray((data as any)?.fields)
        ? ((data as any).fields as any[])
        : [];
      setTemplateFields(raw as TemplateField[]);
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

  // Load org engineers (with signature_data flag) and prefill the technician
  // dropdown by fuzzy-matching the OCR'd engineer name.
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
        // Prefer engineers with a stored signature, then broaden.
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
      // Auto-match a site record from the OCR'd site text when nothing is
      // already picked. Simple case-insensitive substring / postcode match.
      if (!siteId && item) {
        const headerSite = String((item.header as any)?.site || "")
          .toLowerCase()
          .trim();
        if (headerSite) {
          const pc = headerSite.match(/[a-z]{1,2}\d{1,2}[a-z]?\s*\d[a-z]{2}/i)?.[0]?.toLowerCase();
          const match = list.find((s) => {
            const hay = `${s.name || ""} ${s.address || ""} ${s.postcode || ""}`.toLowerCase();
            if (pc && (s.postcode || "").toLowerCase().replace(/\s+/g, "") === pc.replace(/\s+/g, "")) return true;
            const nameLc = (s.name || "").toLowerCase();
            return nameLc && (headerSite.includes(nameLc) || hay.includes(headerSite.slice(0, 20)));
          });
          if (match) setSiteId(match.id);
        }
      }
    })();
  }, [open, customerId, item, siteId]);

  // When a site record is picked, mirror its name/address into the
  // free-text fields so the persisted archive row is consistent.
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
    if (!item) return [] as ProposedDefect[];
    return proposeDefectsFromExtraction(
      templateFields as any,
      answers,
      (item.header || {}) as any,
    );
  }, [item, templateFields, answers]);

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

  const fileIt = async (asUnmatched = false) => {
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
      });

      // Create confirmed defect proposals AFTER the archive row exists,
      // linked to it as source. Never linked to a job. Only when filed
      // properly (not as "Unmatched") since defects need a customer/site.
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
            console.error("[archive] defect create failed", defectErr);
            toast({
              title: "Filed, but defects failed",
              description: defectErr?.message || "Defects couldn't be created — open them from the Defects page.",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" /> File to archive
          </DialogTitle>
          <DialogDescription>
            Archive-only — no job is created. Confirm or correct the filing
            details and extracted answers, then file. If a template was
            matched, we'll also generate a clean electronic report as the
            primary document.
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
                  No template matched — will file as scan-only
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
                <Label>Site</Label>
                <SiteCombobox
                  value={siteId}
                  sites={sites}
                  onChange={setSiteId}
                />
              </div>
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
              <div className="space-y-1.5 md:col-span-2">
                <Label>
                  Technician signature{" "}
                  <span className="text-muted-foreground font-normal">
                    (applies this engineer's stored profile signature to the
                    electronic report — the scanned original bears their
                    handwritten signature)
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
            </div>

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
                {sections.map(([sectionName, sectionFields]) => (
                  <div key={sectionName} className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {sectionName}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sectionFields.map((field) => (
                        <div key={field.id} className="space-y-1">
                          <Label className="text-xs">{field.label}</Label>
                          {renderFieldInput(field)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => fileIt(true)}
                  disabled={saving}
                >
                  File as Unmatched
                </Button>
                <Button
                  type="button"
                  onClick={() => fileIt(false)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-4 w-4" />
                  )}
                  {hasTemplate ? "File with electronic report" : "File to archive"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
