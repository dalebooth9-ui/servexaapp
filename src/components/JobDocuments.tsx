import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Trash2, Upload, Loader2, Building2, FileSpreadsheet } from "lucide-react";
import { generateRamsPdf } from "@/lib/ramsPdf";
import { generateSprinklerRamsPdf, generateExtinguisherRamsPdf, generateHydrantRamsPdf, generateInstallationRamsPdf } from "@/lib/ramsPdfVariants";
import BlankTemplatePdfExport from "@/components/BlankTemplatePdfExport";
import PreStartChecklistPdf from "@/components/PreStartChecklistPdf";
import type { RamsType } from "@/components/RamsPdfExport";

type JobDoc = {
  id: string;
  job_id: string;
  document_type: string;
  label: string;
  file_url: string | null;
  file_name: string | null;
  source: string;
  created_at: string;
};

type Props = {
  jobId: string;
  job: any;
  engineers: { id: string; name: string }[];
};

export default function JobDocuments({ jobId, job, engineers }: Props) {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<JobDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingRams, setGeneratingRams] = useState(false);
  const [uploadingManual, setUploadingManual] = useState(false);
  const [uploadingSlotId, setUploadingSlotId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingCostingSheet, setUploadingCostingSheet] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const costingSheetInputRef = useRef<HTMLInputElement>(null);
  const slotUploadRef = useRef<HTMLInputElement>(null);
  const pendingSlotDoc = useRef<JobDoc | null>(null);
  const [jobInfo, setJobInfo] = useState<any | null>(null);
  const [blankTemplates, setBlankTemplates] = useState<Record<string, any>>({});

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("job_documents" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at");
    setDocs((data as unknown as JobDoc[]) || []);
    setLoading(false);
  };

  // Fetch full job info including site/customer for PDF generation
  const fetchJobInfo = async () => {
    const { data: jd } = await supabase
      .from("jobs")
      .select("name, address, customer, reference_number, category, status, priority, visual_qty, pressure_test_qty, other_qty, other_service_type, customer_id, site_id, customers(name, email, phone, logo_url), sites(name, address, postcode, contact_name, contact_phone, contact_email, riser_location)")
      .eq("id", jobId)
      .single();
    if (!jd) return;
    const j = jd as any;
    let engineerNames: string[] = [];
    const { data: assigns } = await supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId);
    if (assigns && assigns.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", assigns.map((a: any) => a.engineer_id));
      engineerNames = (profs || []).map((p: any) => p.full_name).filter(Boolean);
    }
    setJobInfo({
      name: j.name,
      address: j.address,
      customer: j.customers?.name || j.customer,
      customers: j.customers ? { name: j.customers.name, logo_url: j.customers.logo_url || null } : null,
      customer_email: j.customers?.email || null,
      customer_phone: j.customers?.phone || null,
      reference_number: j.reference_number,
      category: j.category,
      status: j.status,
      priority: j.priority,
      visual_qty: j.visual_qty,
      pressure_test_qty: j.pressure_test_qty,
      other_qty: j.other_qty ?? 0,
      other_service_type: j.other_service_type ?? null,
      engineers: engineerNames,
      site: j.sites ? { name: j.sites.name, address: j.sites.address, postcode: j.sites.postcode, contact_name: j.sites.contact_name, contact_phone: j.sites.contact_phone, contact_email: j.sites.contact_email, riser_location: j.sites.riser_location } : null,
    });
    // Fetch templates for blank_job_sheet docs
    const { data: tpls } = await supabase.from("job_sheet_templates").select("*");
    if (tpls) {
      const map: Record<string, any> = {};
      (tpls as any[]).forEach((t) => {
        map[t.id] = { ...t, fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields, branding: t.branding || {} };
      });
      setBlankTemplates(map);
    }
  };

  useEffect(() => { fetchDocs(); fetchJobInfo(); }, [jobId]);

  // Auto-attach documents from category templates when the component mounts
  useEffect(() => {
    if (!job?.category || !user || userRole !== "admin") return;
    if (job?.status === "completed" || job?.status === "cancelled") return;
    autoAttachCategoryDocuments();
    autoAttachPreStartChecklist();
  }, [job?.category]);

  // Auto-attach customer paperwork (auto_attach=true) that hasn't been attached yet
  useEffect(() => {
    if (!job?.customer_id || !user || userRole !== "admin") return;
    if (job?.status === "completed" || job?.status === "cancelled") return;
    autoAttachCustomerPaperwork();
  }, [job?.customer_id]);

  const isInstallationJob = () => {
    const cat = job?.category || "";
    return cat === "installation" || cat === "dry_riser_installation";
  };

  const autoAttachPreStartChecklist = async () => {
    if (!isInstallationJob() || !user) return;
    // Check if already attached
    const { data: existing } = await supabase
      .from("job_documents" as any)
      .select("id")
      .eq("job_id", jobId)
      .eq("document_type", "pre_start_checklist")
      .limit(1);
    if (existing && (existing as any[]).length > 0) return;

    await supabase.from("job_documents" as any).insert({
      job_id: jobId,
      document_type: "pre_start_checklist",
      label: "Pre-start Check List",
      file_url: null,
      file_name: null,
      source: "auto",
      created_by: user.id,
    } as any);
    fetchDocs();
  };

  const autoAttachCustomerPaperwork = async () => {
    if (!job?.customer_id || !user) return;
    // Fetch all auto-attach paperwork for this customer
    const { data: paperwork } = await supabase
      .from("customer_paperwork" as any)
      .select("*")
      .eq("customer_id", job.customer_id)
      .eq("auto_attach", true);
    if (!paperwork || (paperwork as any[]).length === 0) return;

    // Get already-attached customer paperwork docs for this job
    const { data: existingDocs } = await supabase
      .from("job_documents" as any)
      .select("file_name")
      .eq("job_id", jobId)
      .eq("source", "customer_paperwork");
    const existingFileNames = new Set((existingDocs || []).map((d: any) => d.file_name));

    const toInsert = (paperwork as any[])
      .filter((pw) => !existingFileNames.has(pw.file_name))
      .map((pw) => ({
        job_id: jobId,
        document_type: "customer_paperwork",
        label: pw.label || pw.file_name,
        file_url: pw.file_url,
        file_name: pw.file_name,
        source: "customer_paperwork",
        created_by: user.id,
      }));

    if (toInsert.length > 0) {
      await supabase.from("job_documents" as any).insert(toInsert as any);
      fetchDocs();
    }
  };

  const autoAttachCategoryDocuments = async () => {
    if (!job?.category) return;
    // Fetch enabled templates for this category
    const { data: catTemplates } = await supabase
      .from("category_document_templates" as any)
      .select("*")
      .eq("category_slug", job.category)
      .eq("enabled", true)
      .order("sort_order");

    if (!catTemplates || catTemplates.length === 0) return;

    // Get existing auto-attached docs to avoid duplicates
    const { data: existingDocs } = await supabase
      .from("job_documents" as any)
      .select("category_template_id")
      .eq("job_id", jobId)
      .eq("source", "auto");

    const existingTemplateIds = new Set((existingDocs || []).map((d: any) => d.category_template_id));

    const toInsert = (catTemplates as any[])
      .filter((t) => !existingTemplateIds.has(t.id))
      .map((t) => ({
        job_id: jobId,
        document_type: t.document_type,
        label: t.label,
        file_url: t.document_type === "uploaded_file" ? t.file_url : null,
        file_name: t.document_type === "uploaded_file" ? t.file_name : null,
        source: "auto",
        category_template_id: t.id,
        created_by: user?.id,
      }));

    if (toInsert.length > 0) {
      await supabase.from("job_documents" as any).insert(toInsert as any);
      fetchDocs();
    }
  };

  // Determine RAMS type from job category
  const ramsTypeForJob = (): RamsType => {
    const cat = job?.category || "";
    if (cat === "sprinkler" || cat === "sprinkler_service") return "sprinkler";
    if (cat === "fire_extinguisher") return "fire_extinguisher";
    if (cat === "fire_hydrant" || cat === "hydrant_service") return "fire_hydrant";
    if (cat === "installation" || cat === "dry_riser_installation") return "installation";
    return "dry_riser";
  };

  const handleGenerateRams = async () => {
    setGeneratingRams(true);
    try {
      let siteData = null;
      if (job.site_id) {
        const { data: s } = await supabase.from("sites").select("*").eq("id", job.site_id).single();
        siteData = s;
      }
      let customerData = null;
      if (job.customer_id) {
        const { data: c } = await supabase.from("customers").select("*").eq("id", job.customer_id).single();
        customerData = c;
      }

      const jInfo = {
        ...job,
        site: siteData,
        customer: customerData,
        reference_number: job.reference_number,
      };

      const operatives = engineers.map((e) => ({ name: e.name, sig: "", date: "" }));

      let attendanceDate = "";
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("schedule_date")
        .eq("job_id", jobId)
        .order("schedule_date", { ascending: true })
        .limit(1);
      if (schedules && schedules.length > 0) {
        attendanceDate = new Date(schedules[0].schedule_date).toLocaleDateString("en-GB");
      }

      const formData = { rams_attendance_date: attendanceDate };
      const ramsType = ramsTypeForJob();

      let result: { base64: string; fileName: string };
      if (ramsType === "sprinkler") {
        result = await generateSprinklerRamsPdf(formData, jInfo, operatives);
      } else if (ramsType === "fire_extinguisher") {
        result = await generateExtinguisherRamsPdf(formData, jInfo, operatives);
      } else if (ramsType === "fire_hydrant") {
        result = await generateHydrantRamsPdf(formData, jInfo, operatives);
      } else if (ramsType === "installation") {
        result = await generateInstallationRamsPdf(formData, jInfo, operatives);
      } else {
        result = await generateRamsPdf(formData, jInfo, operatives);
      }

      const { base64, fileName } = result;
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: "RAMS PDF opened", description: fileName });
    } catch (e) {
      toast({ title: "Error generating RAMS PDF", variant: "destructive" });
    }
    setGeneratingRams(false);
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    setUploadingManual(true);

    const path = `job-documents/${jobId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } else {
      const { data: urlData } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (urlData?.signedUrl) {
        await supabase.from("job_documents" as any).insert({
          job_id: jobId,
          document_type: "uploaded_file",
          label: file.name,
          file_url: urlData.signedUrl,
          file_name: file.name,
          source: "manual",
          created_by: user.id,
        } as any);
        fetchDocs();
        toast({ title: "Document attached" });
      }
    }
    setUploadingManual(false);
  };

  const handleCostingSheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    setUploadingCostingSheet(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `costing-sheets/${jobId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("submissions")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: signedData, error: signError } = await supabase.storage
        .from("submissions")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 5);
      if (signError || !signedData?.signedUrl) throw new Error("Could not generate signed URL");

      toast({ title: "Processing costing sheet…", description: "Extracting materials, please wait." });

      const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-costing-sheet", {
        body: { file_url: signedData.signedUrl, job_id: jobId, user_id: user.id, bucket: "submissions" },
      });
      if (fnError) throw new Error(fnError.message);

      const count = fnData?.parts?.length ?? 0;
      const days = fnData?.allocated_days;
      toast({
        title: "Costing sheet processed ✓",
        description: `${count} material(s) added to Parts tab${days ? `, ${days} allocated day(s) set` : ""}.`,
      });
      fetchDocs();
    } catch (err: any) {
      toast({ title: "Costing sheet processing failed", description: err.message || "Could not extract materials.", variant: "destructive" });
    } finally {
      setUploadingCostingSheet(false);
    }
  };

  const handleDelete = async (doc: JobDoc) => {
    setDeletingId(doc.id);
    await supabase.from("job_documents" as any).delete().eq("id", doc.id);

    // If deleting a Costing Sheet, also remove the parts that were extracted from it
    if (doc.label === "Costing Sheet" || doc.document_type === "costing_sheet") {
      await supabase.from("job_parts").delete().eq("job_id", jobId);
    }

    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast({ title: doc.label === "Costing Sheet" ? "Costing sheet and extracted materials removed" : "Document removed" });
    setDeletingId(null);
  };

  const handleDownload = async (doc: JobDoc) => {
    if (!doc.file_url) return;
    let url = doc.file_url;
    // Customer paperwork stores a storage path, not a full URL — generate a signed URL
    if (doc.source === "customer_paperwork" && !doc.file_url.startsWith("http")) {
      const { data } = await supabase.storage.from("customer-paperwork").createSignedUrl(doc.file_url, 300);
      if (data?.signedUrl) url = data.signedUrl;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleUploadSlot = (doc: JobDoc) => {
    pendingSlotDoc.current = doc;
    slotUploadRef.current?.click();
  };

  const handleSlotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const doc = pendingSlotDoc.current;
    if (!file || !doc || !user) return;
    e.target.value = "";
    setUploadingSlotId(doc.id);
    const path = `job-documents/${jobId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } else {
      const { data: urlData } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (urlData?.signedUrl) {
        await supabase.from("job_documents" as any).update({ file_url: urlData.signedUrl, file_name: file.name } as any).eq("id", doc.id);
        setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, file_url: urlData.signedUrl, file_name: file.name } : d));
        toast({ title: "Document uploaded" });
      }
    }
    setUploadingSlotId(null);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading documents…</p>;

  const customerPaperwork = docs.filter((d) => d.source === "customer_paperwork");

  const DOC_TYPE_ORDER: Record<string, number> = { rams_pdf: 0, pre_start_checklist: 1 };
  const allJobDocs = docs
    .filter((d) => d.source !== "customer_paperwork")
    .sort((a, b) => {
      const ao = DOC_TYPE_ORDER[a.document_type] ?? 99;
      const bo = DOC_TYPE_ORDER[b.document_type] ?? 99;
      return ao - bo;
    });

  return (
    <div className="space-y-4">
      <input ref={slotUploadRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleSlotFileChange} />

      {/* Customer paperwork documents */}
      {customerPaperwork.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Building2 className="h-3 w-3" /> Customer's Own Forms
          </p>
          <div className="space-y-2">
            {customerPaperwork.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                isAdmin={userRole === "admin"}
                deleting={deletingId === doc.id}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onGenerateRams={handleGenerateRams}
                generatingRams={generatingRams}
                jobId={jobId}
                job={job}
                jobInfo={jobInfo}
                blankTemplates={blankTemplates}
                isCustomerPaperwork
              />
            ))}
          </div>
        </div>
      )}

      {/* All job documents */}
      {allJobDocs.length > 0 && (
        <div className="space-y-2">
          {allJobDocs.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              isAdmin={userRole === "admin"}
              deleting={deletingId === doc.id}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onGenerateRams={handleGenerateRams}
              generatingRams={generatingRams}
              jobId={jobId}
              job={job}
              jobInfo={jobInfo}
              blankTemplates={blankTemplates}
              onUploadSlot={handleUploadSlot}
              uploadingSlotId={uploadingSlotId}
            />
          ))}
        </div>
      )}

      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents configured for this job type. Attach one manually below, or configure auto-attachments in Settings.</p>
      )}

      {/* Admin actions */}
      {userRole === "admin" && (
        <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleManualUpload} />
          <input ref={costingSheetInputRef} type="file" className="hidden" accept=".xls,.xlsx" onChange={handleCostingSheetUpload} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingManual}
          >
            {uploadingManual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Attach Document
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => costingSheetInputRef.current?.click()}
            disabled={uploadingCostingSheet}
          >
            {uploadingCostingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Upload Costing Sheet
          </Button>
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc,
  isAdmin,
  deleting,
  onDelete,
  onDownload,
  onGenerateRams,
  generatingRams,
  jobId,
  job,
  jobInfo,
  blankTemplates,
  isCustomerPaperwork,
  onUploadSlot,
  uploadingSlotId,
}: {
  doc: JobDoc;
  isAdmin: boolean;
  deleting: boolean;
  onDelete: (d: JobDoc) => void;
  onDownload: (d: JobDoc) => void;
  onGenerateRams: () => void;
  generatingRams: boolean;
  jobId: string;
  job: any;
  jobInfo: any | null;
  blankTemplates: Record<string, any>;
  isCustomerPaperwork?: boolean;
  onUploadSlot?: (doc: JobDoc) => void;
  uploadingSlotId?: string | null;
}) {
  const isRams = doc.document_type === "rams_pdf";
  const isBlankSheet = doc.document_type === "blank_job_sheet";
  const isPreStart = doc.document_type === "pre_start_checklist";
  const isUploadSlot = ["quote", "purchase_order", "site_drawing", "uploaded_file"].includes(doc.document_type);
  const hasFile = !!doc.file_url;

  const DOC_TYPE_BADGE: Record<string, string> = {
    rams_pdf: "RAMS PDF",
    blank_job_sheet: "Blank Job Sheet",
    uploaded_file: doc.label === "Costing Sheet" ? "Costing Sheet" : "File",
    quote: "Quote",
    purchase_order: "Purchase Order",
    site_drawing: "Site Drawing",
    pre_start_checklist: "Pre-start Checklist",
  };

  // Find matching template for blank job sheet by label
  const matchedTemplate = isBlankSheet
    ? Object.values(blankTemplates).find((t: any) =>
        t.name?.toLowerCase() === doc.label?.toLowerCase() ||
        doc.label?.toLowerCase().includes(t.name?.toLowerCase()) ||
        t.name?.toLowerCase().includes(doc.label?.toLowerCase())
      ) ?? null
    : null;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${isCustomerPaperwork ? "bg-primary/5 border-primary/20" : "bg-card"}`}>
      <FileText className={`h-4 w-4 shrink-0 ${isCustomerPaperwork ? "text-primary" : "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isCustomerPaperwork ? (
            <Badge variant="outline" className="text-[10px] gap-0.5 border-primary/40 text-primary">
              <Building2 className="h-2.5 w-2.5" /> Customer Form
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {DOC_TYPE_BADGE[doc.document_type] ?? "File"}
            </Badge>
          )}
          {doc.file_name && (
            <span className="text-[10px] text-muted-foreground truncate">{doc.file_name}</span>
          )}
          {isUploadSlot && !hasFile && (
            <span className="text-[10px] text-muted-foreground italic">Awaiting upload</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {isRams && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 shrink-0"
          onClick={onGenerateRams}
          disabled={generatingRams}
        >
          {generatingRams ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
          Generate
        </Button>
      )}
      {isPreStart && (
        <PreStartChecklistPdf jobInfo={jobInfo} />
      )}
      {isBlankSheet && matchedTemplate && jobInfo && (
        <BlankTemplatePdfExport template={matchedTemplate} jobInfo={jobInfo} />
      )}
      {isBlankSheet && (!matchedTemplate || !jobInfo) && (
        <span className="text-[10px] text-muted-foreground">Loading…</span>
      )}

      {isCustomerPaperwork && hasFile && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 shrink-0"
          onClick={() => onDownload(doc)}
        >
          <Download className="h-3 w-3" /> Open
        </Button>
      )}

      {isUploadSlot && hasFile && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 shrink-0"
          onClick={() => onDownload(doc)}
        >
          <Download className="h-3 w-3" /> Open
        </Button>
      )}
      {isUploadSlot && isAdmin && onUploadSlot && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1 shrink-0"
          onClick={() => onUploadSlot(doc)}
          disabled={uploadingSlotId === doc.id}
        >
          {uploadingSlotId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {hasFile ? "Replace" : "Upload"}
        </Button>
      )}

      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDelete(doc)}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}
