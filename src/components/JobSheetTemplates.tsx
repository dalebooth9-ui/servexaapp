import { useState, useEffect, useRef, useCallback } from "react";
import { useAutoSave } from "@/hooks/useAutoSave";
import { saveFormDraft, clearFormDraft, loadFormDraftSync } from "@/lib/offlineFormStorage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobCategories } from "@/hooks/useJobCategories";
import { deriveScopeFromTemplateName } from "@/lib/jobSheetPrefill";
import { logReportEdits, jobHasSignatures } from "@/lib/logReportEdits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText, Plus, ClipboardCheck, Send, Loader2, CheckCircle2, Eye, Camera, X, Trash2, Pencil, Copy, Lock, Unlock, RotateCcw, FileJson, Download,
} from "lucide-react";
import JobSheetPdfExport from "./JobSheetPdfExport";
import SignatureCapture from "./SignatureCapture";
import BlankTemplatePdfExport from "./BlankTemplatePdfExport";
import PreviousReportPanel from "./PreviousReportPanel";
import ScanJobSheet from "./ScanJobSheet";
import ImportTemplateDialog from "./ImportTemplateDialog";
import ImportTemplateJsonDialog from "./ImportTemplateJsonDialog";
import EditTemplateDialog from "./EditTemplateDialog";
import { downloadTemplateJson } from "@/lib/templateJson";
import RamsPdfExport from "./RamsPdfExport";
import AiRamsAutoFill from "./AiRamsAutoFill";
import RepeatingTableField from "./job-sheets/RepeatingTableField";
import RepeatingTableReadOnly from "./job-sheets/RepeatingTableReadOnly";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef } from "@/lib/durableStorageRef";
import { createSubmissionPhotoSignedUrl } from "@/lib/jobPhotos";
import SortablePhotoGrid from "./SortablePhotoGrid";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  placeholder?: string;
  allow_notes?: boolean;
  allow_na?: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  created_at: string;
  locked?: boolean;
  status?: "draft" | "published" | string | null;
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
  };
};

type Response = {
  id: string;
  template_id: string;
  responses: Record<string, any>;
  submitted_by: string;
  status: string;
  submitted_at: string | null;
  last_amended_at?: string | null;
  last_amended_by?: string | null;
  created_at: string;
};

type JobInfo = {
  address: string | null;
  customer: string | null;
  customers?: { name: string; logo_url?: string | null } | null;
  reference_number: string;
  commissioning_ref?: string;
  category?: string | null;
  name?: string | null;
  priority?: string | null;
  status?: string | null;
  visual_qty?: number;
  pressure_test_qty?: number;
  other_qty?: number;
  other_service_type?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  engineers?: string[];
  site?: { name: string; address: string | null; postcode: string | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; riser_location?: string | null } | null;
};

export default function JobSheetTemplates({ jobId }: { jobId: string }) {
  const { user, userRole, profile } = useAuth();
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [engineerOptions, setEngineerOptions] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importJsonOpen, setImportJsonOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeResponse, setActiveResponse] = useState<Response | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [sitePhotos, setSitePhotos] = useState<{ file: File; preview: string; caption: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [viewingResponse, setViewingResponse] = useState<Response | null>(null);
  const [aiRamsData, setAiRamsData] = useState<Record<string, any> | null>(null);
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string>("");

  // Auto-save template form data — IndexedDB-backed for offline resilience
  const templateFormKey = activeTemplate ? `template-form-${jobId}-${activeTemplate.id}${activeResponse ? `-${activeResponse.id}` : ""}` : null;

  useEffect(() => {
    if (!templateFormKey || Object.keys(formData).length === 0) return;
    const t = setTimeout(() => {
      void saveFormDraft(templateFormKey, formData);
    }, 500);
    return () => clearTimeout(t);
  }, [formData, templateFormKey]);

  const clearTemplateFormDraft = useCallback(() => {
    if (templateFormKey) void clearFormDraft(templateFormKey);
  }, [templateFormKey]);

  // Fetch all engineer + admin names once for dynamic dropdown population
  useEffect(() => {
    const fetchEngineers = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["engineer", "admin"]);
      if (data && data.length > 0) {
        // De-duplicate user_ids (a user may have both roles)
        const uniqueIds = [...new Set(data.map((r: any) => r.user_id))];
        const { data: profs } = await supabase
          .from("profiles")
          .select("full_name")
          .in("user_id", uniqueIds);
        setEngineerOptions(
          (profs || []).map((p: any) => p.full_name).filter(Boolean).sort()
        );
      }
    };
    fetchEngineers();
  }, []);

  const fetchData = async () => {
    // Job first (small) so we can server-side filter templates by category
    const jobRes = await supabase
      .from("jobs")
      .select("name, address, customer, reference_number, category, status, priority, visual_qty, pressure_test_qty, other_qty, other_service_type, customer_id, site_id, customers(name, email, phone, logo_url), sites(name, address, postcode, contact_name, contact_phone, contact_email, riser_location)")
      .eq("id", jobId)
      .single();

    const rawJobCategory = (jobRes.data as any)?.category || null;
    const normalizeCategory = (cat: string | null) => {
      if (!cat) return null;
      if (cat === "sprinkler_service") return "sprinkler";
      if (cat === "hydrant_service" || cat === "fire_hydrant") return "fire_hydrant";
      if (cat === "extinguisher_service") return "fire_extinguisher";
      if (cat === "installation") return "dry_riser_installation";
      if (cat === "dry_riser_pressure_test" || cat === "dry_riser_visual" || cat === "dry_riser_installation" || cat === "dry_riser_remedial") return cat;
      if (cat === "dry_riser_service" || cat === "dry_riser") return "dry_riser";
      return cat;
    };
    const jobCategory = normalizeCategory(rawJobCategory);

    // Reverse-map: which raw job_category values normalise to this job's category
    const categoryAliases = (() => {
      if (!jobCategory) return [] as string[];
      const aliasMap: Record<string, string[]> = {
        sprinkler: ["sprinkler", "sprinkler_service"],
        fire_hydrant: ["fire_hydrant", "hydrant_service"],
        fire_extinguisher: ["fire_extinguisher", "extinguisher_service"],
        dry_riser_installation: ["dry_riser_installation", "installation"],
        dry_riser: ["dry_riser", "dry_riser_service"],
      };
      return aliasMap[jobCategory] || [jobCategory];
    })();

    // Build OR filter: matching job_category aliases OR global rams templates
    const orParts: string[] = ["category.eq.rams"];
    if (categoryAliases.length > 0) {
      orParts.push(`job_category.in.(${categoryAliases.join(",")})`);
    }

    const [tplRes, respRes, schedRes] = await Promise.all([
      supabase
        .from("job_sheet_templates")
        .select("*")
        .or(orParts.join(","))
        .order("created_at", { ascending: false }),
      supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
      supabase.from("job_schedule").select("schedule_date").eq("job_id", jobId).order("schedule_date", { ascending: true }).limit(1),
    ]);

    if (schedRes.data && schedRes.data.length > 0) {
      setScheduledDate(new Date(schedRes.data[0].schedule_date).toLocaleDateString("en-GB"));
    }
    const allTpls = (tplRes.data || []).map((t: any) => ({
      ...t,
      fields: (typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields) as TemplateField[],
      branding: t.branding || {},
    }));
    // Defensive re-filter (server filter already narrowed, this handles edge cases)
    const filteredTpls = allTpls.filter((t: any) => {
      if (!t.job_category) return t.category === "rams";
      return normalizeCategory(t.job_category) === jobCategory;
    });

    // Ensure every template referenced by an existing response is available for
    // rendering, even if it doesn't match the job's category (e.g. paper-scan
    // backfill jobs whose category doesn't line up with the detected template).
    const respTplIds = Array.from(
      new Set(
        (respRes.data || [])
          .map((r: any) => r.template_id)
          .filter((id: string | null) => id && !allTpls.some((t: any) => t.id === id)),
      ),
    );
    let mergedAllTpls = allTpls;
    if (respTplIds.length > 0) {
      const { data: extraTpls } = await supabase
        .from("job_sheet_templates")
        .select("*")
        .in("id", respTplIds);
      const extras = (extraTpls || []).map((t: any) => ({
        ...t,
        fields: (typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields) as TemplateField[],
        branding: t.branding || {},
      }));
      mergedAllTpls = [...allTpls, ...extras];
    }

    setTemplates(filteredTpls);
    setAllTemplates(mergedAllTpls);
    setResponses((respRes.data || []) as Response[]);

    // Profile + assignment lookups in parallel
    const respUserIds = Array.from(
      new Set((respRes.data || []).map((r: any) => r.submitted_by).filter(Boolean))
    );
    const [assignsRes, respProfsRes] = await Promise.all([
      supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
      respUserIds.length > 0
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", respUserIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    let engineerNames: string[] = [];
    if (jobRes.data) {
      const jd = jobRes.data as any;
      const assigns = assignsRes.data || [];
      if (assigns.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", assigns.map((a: any) => a.engineer_id));
        engineerNames = (profs || []).map((p: any) => p.full_name).filter(Boolean);
      }

      setJobInfo({
        name: jd.name,
        address: jd.address,
        customer: jd.customers?.name || jd.customer,
        customer_email: jd.customers?.email || null,
        customer_phone: jd.customers?.phone || null,
        customers: jd.customers ? { name: jd.customers.name, logo_url: jd.customers.logo_url || null } : null,
        reference_number: jd.reference_number,
        category: jd.category,
        status: jd.status,
        priority: jd.priority,
        visual_qty: jd.visual_qty,
        pressure_test_qty: jd.pressure_test_qty,
        other_qty: jd.other_qty ?? 0,
        other_service_type: jd.other_service_type ?? null,
        engineers: engineerNames,
        site: jd.sites ? { name: jd.sites.name, address: jd.sites.address, postcode: jd.sites.postcode, contact_name: jd.sites.contact_name, contact_phone: jd.sites.contact_phone, contact_email: jd.sites.contact_email, riser_location: jd.sites.riser_location } : null,
      });
    }

    const map: Record<string, string> = {};
    (respProfsRes.data || []).forEach((p: any) => { map[p.user_id] = p.full_name; });
    setProfiles(map);
  };

  useEffect(() => { fetchData(); }, [jobId]);

  const handleDeleteTemplate = async (templateId: string) => {
    setDeletingTemplateId(templateId);
    try {
      await supabase.from("job_sheet_responses").delete().eq("template_id", templateId);
      await supabase.from("job_sheet_templates").delete().eq("id", templateId);
      toast({ title: "Template deleted" });
      fetchData();
    } catch {
      toast({ title: "Error deleting template", variant: "destructive" });
    }
    setDeletingTemplateId(null);
  };

  const handleToggleLock = async (tpl: Template) => {
    const newLocked = !tpl.locked;
    const { error } = await supabase.from("job_sheet_templates").update({ locked: newLocked } as any).eq("id", tpl.id);
    if (error) {
      toast({ title: "Error toggling lock", variant: "destructive" });
    } else {
      toast({ title: newLocked ? "Template locked" : "Template unlocked" });
      fetchData();
    }
  };

  const handleTogglePublish = async (tpl: Template) => {
    const current = (tpl.status ?? "published");
    const next = current === "published" ? "draft" : "published";
    const { error } = await supabase.from("job_sheet_templates").update({ status: next } as any).eq("id", tpl.id);
    if (error) {
      toast({ title: "Error updating status", variant: "destructive" });
    } else {
      toast({
        title: next === "published" ? "Template published" : "Reverted to draft",
        description: next === "published"
          ? "This template is now available to new jobs."
          : "Hidden from new jobs until you publish again.",
      });
      fetchData();
    }
  };

  const handleDuplicateTemplate = async (tpl: Template) => {
    const { error } = await supabase.from("job_sheet_templates").insert({
      name: tpl.name + " (copy)",
      description: tpl.description,
      fields: tpl.fields as any,
      branding: tpl.branding as any,
      created_by: user?.id,
    } as any);
    if (error) {
      toast({ title: "Error duplicating template", variant: "destructive" });
    } else {
      toast({ title: "Template duplicated" });
      fetchData();
    }
  };

  const getAutoPopulatedData = (template: Template, override?: JobInfo | null): Record<string, any> => {
    const prefilled: Record<string, any> = {};
    const info = override ?? jobInfo;
    if (!info) return prefilled;

    const jobAddress = info.address || info.site?.address || "";
    const siteName = info.site?.name || "";
    const customerName = info.customer || "";
    const sitePostcode = info.site?.postcode || "";
    const siteContact = info.site?.contact_name || "";
    const siteContactPhone = info.site?.contact_phone || "";
    const siteContactEmail = info.site?.contact_email || "";
    const engineerList = (info.engineers || []).join(", ");
    // For real engineers, pre-select their own name in dropdowns. In admin
    // preview, we intentionally leave the selection empty per spec.
    const ownEngineerName = userRole === "engineer" ? (profile?.full_name || "") : "";

    template.fields.forEach((f) => {
      const lbl = f.label.toLowerCase();
      const label = lbl.replace(/[:\s]+$/g, "").trim();
      const isDrainField = lbl.includes("drain") || lbl.includes("drop leg");
      const isYesNoSelect =
        !!f.options &&
        f.options.length <= 3 &&
        f.options.some((opt) => opt.toLowerCase() === "yes") &&
        f.options.some((opt) => opt.toLowerCase() === "no");

      // Default "drop leg drained" / drain fields to YES
      if (isDrainField) {
        prefilled[f.id] = f.type === "checkbox" ? true : isYesNoSelect ? "YES" : true;
      }

      // Select fields: only prefill for well-known slots where we can pick an
      // exact option — Scope of Work (from template title) and Engineer name.
      if (f.options && f.options.length > 0) {
        if (isDrainField) return;
        if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("service type")) {
          const derived = deriveScopeFromTemplateName(template.name);
          if (derived) {
            const match = f.options.find((o) => o.toLowerCase() === derived.toLowerCase());
            if (match) prefilled[f.id] = match;
          }
          return;
        }
        if (ownEngineerName && (label.includes("engineer") || label.includes("technician") || label.includes("operative") || label.includes("carried out by") || label.includes("completed by") || label.includes("attended by"))) {
          const match = f.options.find((o) => o.toLowerCase() === ownEngineerName.toLowerCase());
          if (match) prefilled[f.id] = match;
        }
        return;
      }

      // Site details (composite: name + address)
      if (
        (label.includes("site") && label.includes("detail")) ||
        (label.includes("site") && label.includes("info"))
      ) {
        prefilled[f.id] = [siteName, jobAddress, sitePostcode].filter(Boolean).join("\n");
      // Site name
      } else if (label === "site name" || label === "site") {
        prefilled[f.id] = siteName;
      // Site address
      } else if (label === "site address" || label === "address") {
        prefilled[f.id] = [jobAddress, sitePostcode].filter(Boolean).join(", ");
      // Postcode
      } else if (label.includes("postcode") || label.includes("post code") || label.includes("zip")) {
        prefilled[f.id] = sitePostcode;
      // Site contact name
      } else if (label.includes("site") && label.includes("contact") && label.includes("name")) {
        prefilled[f.id] = siteContact;
      } else if (label === "contact name" || label === "contact person") {
        prefilled[f.id] = siteContact;
      // Site contact phone
      } else if ((label.includes("site") && label.includes("contact") && label.includes("phone")) || (label.includes("site") && label.includes("tel"))) {
        prefilled[f.id] = siteContactPhone;
      } else if (label === "contact phone" || label === "contact tel" || label === "contact number") {
        prefilled[f.id] = siteContactPhone;
      // Site contact email
      } else if (label.includes("site") && label.includes("email")) {
        prefilled[f.id] = siteContactEmail;
      // Customer details (composite)
      } else if (
        (label.includes("customer") && label.includes("detail")) ||
        (label.includes("client") && label.includes("detail"))
      ) {
        prefilled[f.id] = [customerName, info.customer_email, info.customer_phone].filter(Boolean).join("\n");
      // Customer / client name
      } else if (label === "customer name" || label === "client name" || label === "customer" || label === "client") {
        prefilled[f.id] = customerName;
      } else if (label.includes("customer") && !label.includes("sign") && !label.includes("email") && !label.includes("phone")) {
        prefilled[f.id] = customerName;
      // Customer email
      } else if ((label.includes("customer") || label.includes("client")) && label.includes("email")) {
        prefilled[f.id] = info.customer_email || "";
      // Customer phone
      } else if ((label.includes("customer") || label.includes("client")) && (label.includes("phone") || label.includes("tel"))) {
        prefilled[f.id] = info.customer_phone || "";
      // Reference / PO number
      } else if (label.includes("po number") || label.includes("reference") || label.includes("ref no") || label.includes("job ref") || label.includes("job number") || label.includes("order number")) {
        prefilled[f.id] = info.reference_number || "";
      // Job name / description — extended for commissioning certs
      } else if (
        label === "job name" || label === "job title" || label === "job description" ||
        label === "description of work" || label === "works description" ||
        label === "project name" || label === "project title" || label === "contract" ||
        label.includes("project description") || label === "works"
      ) {
        prefilled[f.id] = info.name || "";
      // Address / location — extended for commissioning certs
      } else if (
        label === "site address" || label === "address" || label === "location" ||
        label === "site location" || label === "property address" || label === "premises address" ||
        label === "installation address" || label === "premises"
      ) {
        prefilled[f.id] = [info.address || info.site?.address, info.site?.postcode].filter(Boolean).join(", ");
      // Number of systems (commissioning cert specific)
      } else if (
        label.includes("number of") && (label.includes("system") || label.includes("riser")) ||
        label.includes("no. of") || label.includes("no of") && (label.includes("system") || label.includes("riser")) ||
        label === "qty" || label === "quantity of systems" || label === "number of risers"
      ) {
        prefilled[f.id] = String(info.other_qty || 1);
      // Date fields — use scheduled planner date if available, else today
      } else if (label === "date" || label === "inspection date" || label === "service date" || label === "visit date" || label === "work date" || label === "commissioning date" || label === "installation date" || label === "completion date") {
        prefilled[f.id] = scheduledDate || new Date().toISOString().split("T")[0];
      // Attendance date — always use the planner-booked date
      } else if (label.includes("attendance date") || label === "rams_attendance_date" || label === "attendance") {
        prefilled[f.id] = scheduledDate || new Date().toLocaleDateString("en-GB");
      // Category / scope / type of work — match template title first, fall back to PT/Visual qty, then category
      } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category") || label.includes("service type")) {
        const fromTitle = deriveScopeFromTemplateName(template.name);
        if (fromTitle) {
          prefilled[f.id] = fromTitle;
        } else {
          const scopeParts: string[] = [];
          if ((info.pressure_test_qty ?? 0) > 0) scopeParts.push(`Pressure Test ×${info.pressure_test_qty}`);
          if ((info.visual_qty ?? 0) > 0) scopeParts.push(`Visual Inspection ×${info.visual_qty}`);
          if ((info.other_qty ?? 0) > 0 && info.other_service_type) scopeParts.push(`${info.other_service_type} ×${info.other_qty}`);
          const categoryName = jobCategories.find(c => c.slug === info.category)?.name
            || (info.category ? info.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "");
          prefilled[f.id] = scopeParts.length > 0 ? scopeParts.join(", ") : categoryName;
        }
      // Priority
      } else if (label === "priority" || label === "job priority") {
        prefilled[f.id] = info.priority || "";
      // Engineer / technician
      } else if (label.includes("engineer") || label.includes("technician") || label.includes("operative") || label.includes("carried out by") || label.includes("completed by") || label.includes("attended by")) {
        prefilled[f.id] = engineerList;
      // PT / Visual quantities
      } else if (label.includes("pressure test") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
        prefilled[f.id] = String(info.pressure_test_qty ?? 0);
      } else if (label.includes("visual") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
        prefilled[f.id] = String(info.visual_qty ?? 0);
      } else if (label.includes("riser location") || label.includes("riser loc")) {
        prefilled[f.id] = info.site?.riser_location || "";
      }
    });
    return prefilled;
  };

  // Fields that are permanently set by the template and cannot be changed by the user
  const getLockedFieldIds = (template: Template): Set<string> => {
    const locked = new Set<string>();
    const tplName = template.name.toLowerCase();
    if (tplName.includes("pressure test") || tplName.includes("pressure-test") || tplName.includes("visual")) {
      template.fields.forEach((f) => {
        const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();
        if (label.includes("scope") || label.includes("type of work") || label.includes("work type")) {
          locked.add(f.id);
        }
      });
    }
    return locked;
  };

  const lockedFieldIds = activeTemplate ? getLockedFieldIds(activeTemplate) : new Set<string>();

  // Auto-create N draft responses for a template based on job quantities
  const handleAutoCreateDrafts = async (template: Template) => {
    if (!user || !jobInfo) return;
    const tplName = template.name.toLowerCase();
    let qty = 1;
    if (tplName.includes("pressure test") || tplName.includes("dry riser")) {
      qty = jobInfo.pressure_test_qty || 1;
    } else if (tplName.includes("visual")) {
      qty = jobInfo.visual_qty || 1;
    }
    if (qty <= 1) {
      handleStartForm(template);
      return;
    }
    // Find existing drafts for this template
    const existingDrafts = responses.filter(
      (r) => r.template_id === template.id && r.status === "draft"
    );
    const needed = qty - existingDrafts.length;
    if (needed <= 0) {
      // All already created — open first unfilled
      handleStartForm(template, existingDrafts[0]);
      return;
    }
    const prefilled = getAutoPopulatedData(template);
    const toInsert = Array.from({ length: needed }, (_, i) => ({
      job_id: jobId,
      template_id: template.id,
      responses: {
        ...prefilled,
        _system_label: `System ${existingDrafts.length + i + 1} of ${qty}`,
      } as any,
      submitted_by: user.id,
      status: "draft",
    }));
    await supabase.from("job_sheet_responses").insert(toInsert as any);
    toast({ title: `${qty} draft${qty > 1 ? "s" : ""} created`, description: `One per system for ${template.name}` });
    await fetchData();
  };

  const fetchBackfilledSitePhotos = async (existingResponse?: Response) => {
    const { data: subs } = await supabase
      .from("submissions")
      .select("file_url, file_name, content, engineer_id, created_at, display_order")
      .eq("job_id", jobId)
      .eq("type", "photo")
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (!subs || subs.length === 0) return { urls: [] as string[], paths: [] as string[], captions: [] as string[] };
    const ownPhotos = existingResponse ? (subs as any[]).filter((s) => s.engineer_id === existingResponse.submitted_by) : [];
    const pool = ownPhotos.length > 0 ? ownPhotos : (subs as any[]);
    const urls: string[] = [];
    const paths: string[] = [];
    const captions: string[] = [];
    for (const s of pool) {
      if (!s.file_url) continue;
      const signed = await createSubmissionPhotoSignedUrl(s.file_url as string, jobId, 60 * 60);
      urls.push(signed?.signedUrl || (s.file_url as string));
      const signedPath = signed?.path || "";
      const jobPathIndex = signedPath.indexOf(`${jobId}/`);
      paths.push(jobPathIndex >= 0 ? signedPath.slice(jobPathIndex) : signedPath || `${jobId}/${s.file_name || ""}`);
      captions.push((s.content as string) || "");
    }
    return { urls, paths, captions };
  };

  const withPreservedSitePhotos = async (payload: Record<string, any>) => {
    const existingUrls = Array.isArray(payload._site_photo_urls) ? payload._site_photo_urls : [];
    const existingPaths = Array.isArray(payload._site_photo_paths) ? payload._site_photo_paths : [];
    const existingCaptions = Array.isArray(payload._site_photo_captions) ? payload._site_photo_captions : [];
    if (existingUrls.length > 0 || existingPaths.length > 0 || !activeResponse) return payload;
    try {
      const backfilled = await fetchBackfilledSitePhotos(activeResponse);
      if (backfilled.urls.length === 0) return payload;
      return {
        ...payload,
        _site_photo_urls: [...existingUrls, ...backfilled.urls],
        _site_photo_paths: [...existingPaths, ...backfilled.paths],
        _site_photo_captions: [...existingCaptions, ...backfilled.captions],
      };
    } catch (err) {
      console.warn("[JobSheetTemplates] failed to preserve backfilled site photos on save", err);
      return payload;
    }
  };

  // Recover template-photo references from the submissions table back into
  // the responses JSON. Used when a re-edit/save wiped the photo URLs but the
  // files still live in storage. Safe to run any time — duplicates are skipped.
  const restorePhotosFromSubmissions = async () => {
    if (!activeTemplate) return;
    try {
      const { data: subs, error } = await supabase
        .from("submissions")
        .select("file_name, file_url, content, created_at")
        .eq("job_id", jobId)
        .eq("type", "photo")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const photos = (subs || []) as Array<{ file_name: string; file_url: string; content: string | null; created_at: string }>;
      if (photos.length === 0) {
        toast({ title: "No photos to restore", description: "No photo uploads found for this job." });
        return;
      }

      const uuidRe = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
      const filePatt = new RegExp(`^(?:.*?— )?(?<row>[a-z_]+)-(?<ident>\\d+|${uuidRe})-(?<field>[a-z_]+)-\\d+`, "i");

      const next: Record<string, any> = { ...formData };
      let dwellingChanged = false;
      let dwellingPhotoSet = 0;
      let photosAppended = 0;
      let siteAdded = 0;
      const orphans: string[] = [];

      // Site photos (site-photo-*.jpg/png)
      const siteUrls: string[] = Array.isArray(next._site_photo_urls) ? [...next._site_photo_urls] : [];
      const sitePaths: string[] = Array.isArray(next._site_photo_paths) ? [...next._site_photo_paths] : [];
      const siteCaps: string[] = Array.isArray(next._site_photo_captions) ? [...next._site_photo_captions] : [];

      // Parse dwelling_access_log (stored as a JSON-stringified array)
      let dwellingRows: any[] = [];
      const rawDwelling = next.dwelling_access_log;
      if (Array.isArray(rawDwelling)) dwellingRows = rawDwelling;
      else if (typeof rawDwelling === "string" && rawDwelling.trim().startsWith("[")) {
        try { dwellingRows = JSON.parse(rawDwelling); } catch { dwellingRows = []; }
      }
      const byId = new Map<string, any>();
      dwellingRows.forEach((r) => { if (r?.id) byId.set(String(r.id), r); });

      for (const p of photos) {
        const fn = p.file_name || "";
        const url = p.file_url || "";
        const caption = p.content || "";
        if (fn.startsWith("site-photo")) {
          if (url && !siteUrls.includes(url)) {
            siteUrls.push(url);
            sitePaths.push(`${jobId}/${fn}`);
            siteCaps.push(caption);
            siteAdded++;
          }
          continue;
        }
        const m = fn.match(filePatt);
        if (!m || !m.groups) { orphans.push(fn); continue; }
        const rowKey = m.groups.row;
        const ident = m.groups.ident;
        const fieldKey = m.groups.field;
        if (rowKey !== "dwelling_access_log") { orphans.push(fn); continue; }
        const storagePath = `${jobId}/template-photos/${fn}`;

        let target: any = null;
        if (/^[0-9a-f-]{36}$/i.test(ident)) {
          target = byId.get(ident);
          if (!target) {
            target = { unit_number: "(recovered)", access_result: "", total_heads: "", room_breakdown: "", dwelling_photo: "", id: ident, photos: [] };
            dwellingRows.push(target);
            byId.set(ident, target);
            dwellingChanged = true;
          }
        } else {
          const idx = parseInt(ident, 10);
          if (idx >= 0 && idx < dwellingRows.length) target = dwellingRows[idx];
        }
        if (!target) { orphans.push(fn); continue; }

        if (fieldKey === "dwelling_photo") {
          if (!target.dwelling_photo) {
            target.dwelling_photo = storagePath;
            dwellingPhotoSet++;
            dwellingChanged = true;
          }
        } else {
          const gal: any[] = Array.isArray(target.photos) ? target.photos : [];
          if (!gal.some((x) => x && typeof x === "object" && x.path === storagePath)) {
            gal.push({ path: storagePath, caption, uploaded_at: p.created_at });
            target.photos = gal;
            photosAppended++;
            dwellingChanged = true;
          }
        }
      }

      if (dwellingChanged) next.dwelling_access_log = JSON.stringify(dwellingRows);
      if (siteAdded > 0) {
        next._site_photo_urls = siteUrls;
        next._site_photo_paths = sitePaths;
        next._site_photo_captions = siteCaps;
      }

      console.log("[JobSheetTemplates] restorePhotosFromSubmissions", {
        scanned: photos.length,
        dwellingPhotoSet,
        photosAppended,
        siteAdded,
        orphans,
      });

      const totalRestored = dwellingPhotoSet + photosAppended + siteAdded;
      if (totalRestored === 0) {
        toast({ title: "Nothing to restore", description: `Scanned ${photos.length} photo upload(s); all were already present.` });
        return;
      }
      setFormData(next);
      toast({
        title: "Photos restored",
        description: `Recovered ${totalRestored} photo reference(s) — remember to Save to keep them.`,
      });
    } catch (err: any) {
      console.error("[JobSheetTemplates] restorePhotosFromSubmissions failed", err);
      toast({ title: "Restore failed", description: err?.message || String(err), variant: "destructive" });
    }
  };

  // Lightweight, non-destructive "Merge photos" action.
  // Unlike Restore, this never creates new rows and never touches site photos —
  // it only fills empty `dwelling_photo` slots and appends missing gallery
  // `photos` onto rows the engineer can still see in the form. For each
  // (row, field) pair it uses ONLY the most recent submission so older test
  // uploads don't leak back in.
  const mergePhotosFromSubmissions = async () => {
    if (!activeTemplate) return;
    try {
      const { data: subs, error } = await supabase
        .from("submissions")
        .select("file_name, content, created_at")
        .eq("job_id", jobId)
        .eq("type", "photo")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const photos = (subs || []) as Array<{ file_name: string; content: string | null; created_at: string }>;
      if (photos.length === 0) {
        toast({ title: "No photos to merge", description: "No photo uploads found for this job." });
        return;
      }

      const uuidRe = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
      const filePatt = new RegExp(`^(?:.*?— )?(?<row>[a-z_]+)-(?<ident>\\d+|${uuidRe})-(?<field>[a-z_]+)-\\d+`, "i");

      // Parse existing dwelling rows
      const next: Record<string, any> = { ...formData };
      let dwellingRows: any[] = [];
      const rawDwelling = next.dwelling_access_log;
      if (Array.isArray(rawDwelling)) dwellingRows = rawDwelling;
      else if (typeof rawDwelling === "string" && rawDwelling.trim().startsWith("[")) {
        try { dwellingRows = JSON.parse(rawDwelling); } catch { dwellingRows = []; }
      }
      if (dwellingRows.length === 0) {
        toast({ title: "Nothing to merge into", description: "This report has no dwelling rows to attach photos to." });
        return;
      }
      const byId = new Map<string, any>();
      dwellingRows.forEach((r) => { if (r?.id) byId.set(String(r.id), r); });

      // Keep only the most recent submission per (row, ident, field) bucket so
      // we don't reintroduce earlier duplicates the engineer already replaced.
      const latestByKey = new Map<string, { file_name: string; content: string | null; created_at: string; row: string; ident: string; field: string }>();
      for (const p of photos) {
        const fn = p.file_name || "";
        if (fn.startsWith("site-photo")) continue;
        const m = fn.match(filePatt);
        if (!m || !m.groups) continue;
        const row = m.groups.row;
        if (row !== "dwelling_access_log") continue;
        const ident = m.groups.ident;
        const field = m.groups.field;
        const key = `${row}|${ident}|${field}`;
        const prev = latestByKey.get(key);
        if (!prev || new Date(p.created_at).getTime() > new Date(prev.created_at).getTime()) {
          latestByKey.set(key, { ...p, row, ident, field });
        }
      }

      let dwellingPhotoSet = 0;
      let photosAppended = 0;
      let skippedNoRow = 0;
      let dwellingChanged = false;

      for (const entry of latestByKey.values()) {
        const { ident, field, file_name, content, created_at } = entry;
        let target: any = null;
        if (/^[0-9a-f-]{36}$/i.test(ident)) {
          target = byId.get(ident) || null;
        } else {
          const idx = parseInt(ident, 10);
          if (idx >= 0 && idx < dwellingRows.length) target = dwellingRows[idx];
        }
        if (!target) { skippedNoRow++; continue; } // no row creation in merge mode

        const storagePath = `${jobId}/template-photos/${file_name}`;
        if (field === "dwelling_photo") {
          if (!target.dwelling_photo) {
            target.dwelling_photo = storagePath;
            dwellingPhotoSet++;
            dwellingChanged = true;
          }
        } else {
          const gal: any[] = Array.isArray(target.photos) ? target.photos : [];
          if (!gal.some((x) => x && typeof x === "object" && x.path === storagePath)) {
            gal.push({ path: storagePath, caption: content || "", uploaded_at: created_at });
            target.photos = gal;
            photosAppended++;
            dwellingChanged = true;
          }
        }
      }

      if (dwellingChanged) next.dwelling_access_log = JSON.stringify(dwellingRows);

      console.log("[JobSheetTemplates] mergePhotosFromSubmissions", {
        scanned: photos.length,
        consideredLatest: latestByKey.size,
        dwellingPhotoSet,
        photosAppended,
        skippedNoRow,
      });

      const totalMerged = dwellingPhotoSet + photosAppended;
      if (totalMerged === 0) {
        toast({
          title: "Nothing to merge",
          description: skippedNoRow > 0
            ? `All matching rows already have their photos. ${skippedNoRow} upload(s) had no matching row — use Restore photos to recover them.`
            : "All photos are already attached to their rows.",
        });
        return;
      }
      setFormData(next);
      toast({
        title: "Photos merged",
        description: `Filled ${dwellingPhotoSet} dwelling photo${dwellingPhotoSet === 1 ? "" : "s"} and appended ${photosAppended} gallery photo${photosAppended === 1 ? "" : "s"} — remember to Save.`,
      });
    } catch (err: any) {
      console.error("[JobSheetTemplates] mergePhotosFromSubmissions failed", err);
      toast({ title: "Merge failed", description: err?.message || String(err), variant: "destructive" });
    }
  };

  const handleStartForm = async (template: Template, existingResponse?: Response) => {
    setActiveTemplate(template);
    setViewingResponse(null);

    // If the async fetchData hasn't populated jobInfo yet (e.g. engineer taps
    // "Fill in" the instant the tab mounts), fetch the job context on demand
    // so pre-fill never runs against a null jobInfo and hands back a blank form.
    let contextInfo: JobInfo | null = jobInfo;
    if (!contextInfo) {
      try {
        const ctx = await fetchJobPrefillContext(supabase, jobId);
        if (ctx) {
          contextInfo = ctx as JobInfo;
          setJobInfo(contextInfo);
        }
      } catch (e) {
        console.warn("[JobSheetTemplates] on-demand job context fetch failed", e);
      }
    }

    const prefilled = getAutoPopulatedData(template, contextInfo);
    // Only treat a field as "auto-populated" when we actually have a value for it.
    const autoPopulatedIds = new Set(
      Object.entries(prefilled)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k]) => k)
    );

    // Check for auto-saved draft (sync read from localStorage mirror)
    const draftKey = `template-form-${jobId}-${template.id}${existingResponse ? `-${existingResponse.id}` : ""}`;
    const localDraft = loadFormDraftSync<Record<string, any>>(draftKey);

    if (existingResponse) {
      setActiveResponse(existingResponse);
      let saved: Record<string, any> = {};
      const raw = existingResponse.responses as unknown;
      if (raw && typeof raw === "object") {
        saved = raw as Record<string, any>;
      } else if (typeof raw === "string") {
        try { saved = JSON.parse(raw); } catch { saved = {}; }
      }

      // Start with all saved data so nothing the engineer entered gets lost.
      // Backfill EMPTY saved fields with fresh auto-populated values — but
      // never clobber a value the engineer has already typed.
      const merged: Record<string, any> = { ...saved };
      Object.entries(prefilled).forEach(([key, val]) => {
        if (val === undefined || val === null || val === "") return;
        const existing = merged[key];
        const isEmpty = existing === undefined || existing === null || existing === "";
        if (isEmpty) merged[key] = val;
      });
      // Overlay any locally-saved progress (e.g. from lost connection)
      if (localDraft) {
        Object.entries(localDraft).forEach(([key, val]) => {
          if (autoPopulatedIds.has(key)) return;
          if (val !== undefined && val !== null && val !== "") {
            merged[key] = val;
          }
        });
      }
      // Alias: if the template field id is "site" but saved data only has
      // "site_name" (or vice versa), copy the value across so the input pre-fills.
      const SITE_ALIASES: Array<[string, string]> = [
        ["site", "site_name"],
        ["site_name", "site"],
        ["address", "site_address"],
        ["site_address", "address"],
      ];
      for (const [from, to] of SITE_ALIASES) {
        if ((merged[to] === undefined || merged[to] === "") && merged[from]) {
          merged[to] = merged[from];
        }
      }

      if (!Array.isArray(merged._site_photo_urls) || merged._site_photo_urls.length === 0) {
        try {
          const backfilled = await fetchBackfilledSitePhotos(existingResponse);
          if (backfilled.urls.length > 0) {
            merged._site_photo_urls = backfilled.urls;
            merged._site_photo_paths = backfilled.paths;
            merged._site_photo_captions = backfilled.captions;
          }
        } catch (err) {
          console.warn("[JobSheetTemplates] failed to backfill site photos", err);
        }
      }

      const extraPhotoKeys = Object.keys(merged).filter((k) => !Object.keys(saved).includes(k));
      console.debug("[JobSheetTemplates] edit existing report", {
        responseId: existingResponse.id,
        savedKeys: Object.keys(saved),
        mergedKeys: Object.keys(merged),
        hasSitePhotos: Array.isArray(merged._site_photo_urls) && merged._site_photo_urls.length > 0,
      });
      console.log("[JobSheetTemplates] edit existing report", {
        responseId: existingResponse.id,
        savedSiteName: saved.site_name,
        savedSite: saved.site,
        mergedSiteName: merged.site_name,
        mergedSite: merged.site,
        extraKeys: extraPhotoKeys,
        sitePhotoUrls: merged._site_photo_urls,
        sitePhotoPaths: merged._site_photo_paths,
        sitePhotoCaptions: merged._site_photo_captions,
        hasSitePhotos: Array.isArray(merged._site_photo_urls) && merged._site_photo_urls.length > 0,
      });
      setFormData(merged);
    } else {
      setActiveResponse(null);
      if (localDraft) {
        // Restore from local draft, keeping fresh auto-populated values
        const merged = { ...localDraft, ...prefilled };
        setFormData(merged);
      } else {
        setFormData(prefilled);
      }
    }
  };

  useEffect(() => {
    const handleFillOnline = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string; templateId?: string }>).detail;
      if (detail?.jobId !== jobId || !detail?.templateId) return;

      const template = allTemplates.find((tpl) => tpl.id === detail.templateId);
      if (!template) return;

      const existingDraft = responses.find((resp) => {
        if (resp.template_id !== detail.templateId || resp.status !== "draft") return false;
        return userRole === "admin" || resp.submitted_by === user?.id;
      });
      handleStartForm(template, existingDraft);
    };

    window.addEventListener("job-sheet:fill-online", handleFillOnline as EventListener);
    return () => window.removeEventListener("job-sheet:fill-online", handleFillOnline as EventListener);
  }, [jobId, allTemplates, responses, user?.id, userRole]);

  // Reset form data back to master template defaults, preserving job auto-populated fields
  const handleResetToTemplate = () => {
    if (!activeTemplate) return;
    const prefilled = getAutoPopulatedData(activeTemplate);
    const templateDefaults: Record<string, any> = {};
    activeTemplate.fields.forEach((f) => {
      const lbl = f.label.toLowerCase();
      const isDrainField = lbl.includes("drain") || lbl.includes("drop leg");
      const isYesNoSelect =
        !!f.options &&
        f.options.length <= 3 &&
        f.options.some((opt) => opt.toLowerCase() === "yes") &&
        f.options.some((opt) => opt.toLowerCase() === "no");

      if (f.type === "checkbox") {
        templateDefaults[f.id] = isDrainField ? true : false;
      } else if (isDrainField && isYesNoSelect) {
        templateDefaults[f.id] = "YES";
      } else {
        templateDefaults[f.id] = "";
      }
    });
    setFormData({ ...templateDefaults, ...prefilled });
    toast({ title: "Reset to template defaults", description: "All fields reset to master template values." });
  };

  const handleFieldValue = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSaveDraft = async () => {
    if (!activeTemplate) return;
    setSubmitting(true);
    try {
      const payload = await withPreservedSitePhotos(formData);
      console.log("[JobSheetTemplates] save report photos", {
        responseId: activeResponse?.id || null,
        sitePhotoUrls: Array.isArray(payload._site_photo_urls) ? payload._site_photo_urls.length : 0,
        sitePhotoPaths: Array.isArray(payload._site_photo_paths) ? payload._site_photo_paths.length : 0,
        sitePhotoCaptions: Array.isArray(payload._site_photo_captions) ? payload._site_photo_captions.length : 0,
      });
      if (activeResponse) {
        const wasSubmitted = activeResponse.status === "submitted";
        const previousResponses = (activeResponse.responses as Record<string, any>) || {};
        await supabase.from("job_sheet_responses").update({
          responses: payload as any,
        } as any).eq("id", activeResponse.id);
        // Office edit audit trail — only when amending an already-submitted report.
        if (wasSubmitted && user?.id) {
          try {
            const hasSigs = await jobHasSignatures(jobId);
            const changed = await logReportEdits({
              responseId: activeResponse.id,
              jobId,
              editorId: user.id,
              fields: (activeTemplate.fields || []).map((f: any) => ({ id: f.id, label: f.label })),
              oldValues: previousResponses,
              newValues: payload as Record<string, any>,
              hasSignatures: hasSigs,
            });
            if (changed > 0) {
              toast({
                title: hasSigs ? "Amendment logged (after signature)" : "Amendment logged",
                description: `${changed} field${changed === 1 ? "" : "s"} recorded in job history.`,
              });
            }
          } catch (auditErr) {
            console.error("[JobSheetTemplates] audit log failed", auditErr);
            toast({ title: "Warning: audit trail not saved", description: "Edit saved but the audit trail entry failed.", variant: "destructive" });
          }
        }
      } else {
        const { data } = await supabase.from("job_sheet_responses").insert({
          job_id: jobId,
          template_id: activeTemplate.id,
          responses: payload as any,
          submitted_by: user?.id,
          status: "draft",
        } as any).select().single();
        if (data) setActiveResponse(data as Response);
      }
      setFormData(payload);
      toast({ title: "Draft saved" });
      clearTemplateFormDraft();
      fetchData();
    } catch {
      toast({ title: "Error saving draft", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!activeTemplate) return;
    // Allow all fields to be left blank — no required validation block

    setSubmitting(true);
    try {
      // Upload site photos if any
      const photoUrls: string[] = [];
      const photoPaths: string[] = [];
      const photoCaptions: string[] = [];
      if (sitePhotos.length > 0 && user) {
        for (const photo of sitePhotos) {
          const ext = photo.file.name.split(".").pop() || "jpg";
          const fileName = `site-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const filePath = `${jobId}/${fileName}`;
          const storagePath = await buildOrgPathAsync(filePath);
          const { error: upErr } = await supabase.storage
            .from("submissions")
            .upload(storagePath, photo.file, { contentType: photo.file.type });
          if (upErr) {
            console.error("Site photo upload failed", upErr);
            toast({ title: "Photo upload failed", description: upErr.message, variant: "destructive" });
            continue;
          }
          // Always record the path — signed URLs can be regenerated at render time
          photoPaths.push(filePath);
          photoCaptions.push((photo.caption || "").trim());
          const signed = await createSubmissionPhotoSignedUrl(filePath, jobId, 60 * 60);
          if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
          // Register as a job submission so it appears in the job folder/Documents
          const { error: subErr } = await supabase.from("submissions").insert({
            job_id: jobId,
            engineer_id: user.id,
            type: "photo",
            file_url: buildDurableRef("submissions", storagePath),
            file_name: fileName,
            content: (photo.caption || "").trim() || null,
          } as any);
          if (subErr) console.error("Submission insert failed", subErr);
        }
      }
      const baseFormData = await withPreservedSitePhotos(formData);
      const existingPhotoUrls = Array.isArray(baseFormData._site_photo_urls) ? baseFormData._site_photo_urls : [];
      const existingPhotoPaths = Array.isArray(baseFormData._site_photo_paths) ? baseFormData._site_photo_paths : [];
      const existingPhotoCaptions = Array.isArray(baseFormData._site_photo_captions) ? baseFormData._site_photo_captions : [];
      const finalFormData = (photoUrls.length > 0 || photoPaths.length > 0 || existingPhotoUrls.length > 0 || existingPhotoPaths.length > 0)
        ? {
            ...baseFormData,
            _site_photo_urls: [...existingPhotoUrls, ...photoUrls],
            _site_photo_paths: [...existingPhotoPaths, ...photoPaths],
            _site_photo_captions: [...existingPhotoCaptions, ...photoCaptions],
          }
        : baseFormData;
      console.log("[JobSheetTemplates] submit report photos", {
        existingSitePhotos: existingPhotoUrls.length,
        newSitePhotos: photoUrls.length,
        finalSitePhotos: Array.isArray((finalFormData as any)._site_photo_urls) ? (finalFormData as any)._site_photo_urls.length : 0,
      });
      if (activeResponse) {
        await supabase.from("job_sheet_responses").update({
          responses: finalFormData as any,
          status: "submitted",
          submitted_at: new Date().toISOString(),
        } as any).eq("id", activeResponse.id);
      } else {
        await supabase.from("job_sheet_responses").insert({
          job_id: jobId,
          template_id: activeTemplate.id,
          responses: finalFormData as any,
          submitted_by: user?.id,
          status: "submitted",
          submitted_at: new Date().toISOString(),
        } as any);
      }

      // Auto-create Certificate of Conformity when a commissioning cert is submitted
      if (
        activeTemplate.name.toLowerCase().includes("commissioning") &&
        user && jobInfo
      ) {
        // Count how many commissioning submissions already exist for this job
        // (excluding the one we just saved) to determine the sequential number
        const { data: prevCommResponses } = await supabase
          .from("job_sheet_responses" as any)
          .select("id")
          .eq("job_id", jobId)
          .eq("template_id", activeTemplate.id);
        const commCount = (prevCommResponses as any[] | null)?.length ?? 1;

        // Build per-commissioning reference: VFP-00123/Comm-1, VFP-00123/Comm-2 ...
        const baseRef = jobInfo.reference_number || "";
        const commRef = baseRef ? `${baseRef}/Comm-${commCount}` : `Comm-${commCount}`;

        const { autoCreateConformityCert } = await import("@/components/CertificateOfConformity");
        await autoCreateConformityCert(jobId, user.id, { ...jobInfo, commissioning_ref: commRef });
        toast({ title: "Report submitted", description: `Certificate of Conformity created (${commRef}) — edit it in the Documents section.` });
      } else {
        toast({ title: "Report submitted" });
      }

      clearTemplateFormDraft();
      setActiveTemplate(null);
      setActiveResponse(null);
      setFormData({});
      fetchData();
    } catch {
      toast({ title: "Error submitting", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleViewResponse = (resp: Response) => {
    const tpl = allTemplates.find((t) => t.id === resp.template_id);
    if (tpl) {
      setViewingResponse(resp);
      setActiveTemplate(tpl);
      setFormData(resp.responses as Record<string, any>);
      setActiveResponse(null);
    }
  };

  const handleDeleteResponse = async (respId: string) => {
    try {
      const { error } = await supabase.from("job_sheet_responses").delete().eq("id", respId);
      if (error) throw error;
      setResponses((prev) => prev.filter((r) => r.id !== respId));
      toast({ title: "Report deleted" });
    } catch (err: any) {
      toast({ title: "Error deleting report", description: err.message, variant: "destructive" });
    }
  };

  const sections = activeTemplate
    ? [...new Set(activeTemplate.fields.map((f) => f.section || "General"))]
    : [];

  const omittedSections: string[] = Array.isArray((formData as any).__omitted_sections__)
    ? (formData as any).__omitted_sections__
    : [];
  const isSectionOmitted = (s: string) => omittedSections.includes(s);
  const toggleSectionOmitted = (s: string) => {
    const next = isSectionOmitted(s)
      ? omittedSections.filter((x) => x !== s)
      : [...omittedSections, s];
    handleFieldValue("__omitted_sections__", next);
  };
  const filterTemplateBySections = <T extends { fields: any[] }>(tpl: T, data: Record<string, any>): T => {
    const omitted: string[] = Array.isArray(data?.__omitted_sections__) ? data.__omitted_sections__ : [];
    if (!omitted.length) return tpl;
    return { ...tpl, fields: tpl.fields.filter((f: any) => !omitted.includes(f.section || "General")) };
  };

  const closeForm = () => { setActiveTemplate(null); setActiveResponse(null); setFormData({}); setViewingResponse(null); sitePhotos.forEach(p => URL.revokeObjectURL(p.preview)); setSitePhotos([]); };

  // Find the most recent RAMS response (any status) for prominent export
  const ramsTemplates = templates.filter((t) => (t as any).category === "rams");
  const ramsResponses = responses
    .filter((r) => ramsTemplates.some((t) => t.id === r.template_id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestRams = ramsResponses[0];
  const latestRamsTpl = latestRams ? ramsTemplates.find((t) => t.id === latestRams.template_id) : null;

  // Main list view
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Job Documents
            </CardTitle>
            <div className="flex gap-1.5 items-center">
              {userRole === "admin" && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setImportJsonOpen(true)} title="Import a template definition from a JSON file">
                    <FileJson className="h-3 w-3 mr-1" /> Import JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Import Template
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* RAMS section — auto-filled export */}
          {ramsTemplates.length > 0 && (
            <div className="mb-3 pb-3 border-b border-border/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                RAMS
              </p>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 min-h-[38px]">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{ramsTemplates[0]?.name || "RAMS"}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">Auto-fill</Badge>
                  {latestRams && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {latestRams.status === "submitted" ? "Completed" : "Draft"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <AiRamsAutoFill
                    jobName={jobInfo?.name || ""}
                    category={jobInfo?.category || ""}
                    address={jobInfo?.address || ""}
                    customer={jobInfo?.customer || ""}
                    ramsType={(() => {
                      const cat = jobInfo?.category || "";
                      if (cat === "sprinkler" || cat === "sprinkler_service") return "sprinkler";
                      if (cat === "extinguisher_service") return "fire_extinguisher";
                      if (cat === "hydrant_service" || cat === "fire_hydrant") return "fire_hydrant";
                      return "dry_riser";
                    })()}
                    onApply={(result) => {
                      const methodLines = (result.method_statement || "")
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean);
                      const hazards = result.hazards || [];
                      const controls = result.controls || [];
                      const rowCount = Math.max(hazards.length, controls.length);
                      const operationTask = (() => {
                        const cat = jobInfo?.category || "";
                        if (cat === "sprinkler" || cat === "sprinkler_service") return "Sprinkler System Servicing";
                        if (cat === "extinguisher_service") return "Fire Extinguisher Servicing";
                        if (cat === "hydrant_service" || cat === "fire_hydrant") return "Fire Hydrant Inspection";
                        return "Dry Riser Inspection";
                      })();
                      const riskRows = Array.from({ length: rowCount }).map((_, i) => [
                        operationTask,
                        hazards[i] || "",
                        "Operatives, other site personnel, public",
                        "3", "3", "9",
                        controls[i] || hazards[i] ? (controls[i] || "Refer to control measures") : "",
                        "1", "2", "2",
                        "",
                      ]);
                      setAiRamsData({
                        // Keys read by the RAMS PDF generator
                        _descriptionOfWork: result.description,
                        _sequenceOfOps: methodLines,
                        _significantRisks: hazards,
                        _ppeItems: result.ppe || [],
                        _riskRows: riskRows,
                        // Backwards-compatible plain keys
                        rams_description: result.description,
                        rams_description_of_work: result.description,
                        rams_method_statement: result.method_statement,
                        rams_hazards: hazards.join("\n"),
                        rams_controls: controls.join("\n"),
                        rams_ppe: (result.ppe || []).join(", "),
                      });
                    }}
                  />
                  <RamsPdfExport
                    formData={aiRamsData || (latestRams ? (latestRams.responses as any) : {})}
                    jobInfo={jobInfo}
                    jobId={jobId}
                    mode="preview"
                    ramsType={
                      jobInfo?.category === "sprinkler" || jobInfo?.category === "sprinkler_service" ? "sprinkler"
                      : jobInfo?.category === "fire_extinguisher" ? "fire_extinguisher"
                      : jobInfo?.category === "fire_hydrant" || jobInfo?.category === "hydrant_service" ? "fire_hydrant"
                      : jobInfo?.category === "installation" || jobInfo?.category === "dry_riser_installation" ? "installation"
                      : "dry_riser"
                    }
                  />
                </div>
              </div>
            </div>
          )}
          {/* Draft responses — exclude RAMS */}
          {(() => {
            const draftResps = responses.filter((r) => {
              const tpl = allTemplates.find((t) => t.id === r.template_id);
              return (tpl as any)?.category !== "rams" && r.status === "draft";
            });
            if (!draftResps.length) return null;
            return (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">In Progress</p>
                <div className="rounded-md border divide-y">
                  {draftResps.map((resp) => {
                    const tpl = allTemplates.find((t) => t.id === resp.template_id);
                    const canEdit = userRole === "admin" || resp.submitted_by === user?.id;
                    return (
                      <div key={resp.id} className="flex items-center justify-between px-3 py-2 min-h-[38px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="text-sm truncate">{tpl?.name || "Unknown Template"}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Draft</Badge>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => tpl && handleStartForm(tpl, canEdit ? resp : undefined)}>
                            {canEdit ? "Continue" : "Fill In"}
                          </Button>
                          {tpl && <BlankTemplatePdfExport template={tpl} jobInfo={jobInfo} />}
                          {canEdit && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Draft</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete this draft. This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteResponse(resp.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Completed responses — exclude RAMS */}
          {(() => {
            const completedResps = responses.filter((r) => {
              const tpl = allTemplates.find((t) => t.id === r.template_id);
              return (tpl as any)?.category !== "rams" && r.status === "submitted";
            });
            if (!completedResps.length) return null;
            return (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Completed Reports</p>
                <div className="rounded-md border divide-y">
                  {completedResps.map((resp) => {
                    const tpl = allTemplates.find((t) => t.id === resp.template_id);
                    // Submitted reports: only office admins can amend after submission.
                    // Engineers cannot re-edit their own once submitted — office reviews and edits.
                    const canEdit = userRole === "admin";
                    return (
                      <div key={resp.id} className="flex items-center justify-between px-3 py-2 min-h-[38px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                          <span className="text-sm truncate">{tpl?.name || "Unknown Template"}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Submitted</Badge>
                          {resp.submitted_by && profiles[resp.submitted_by] && (
                            <span className="text-[10px] text-muted-foreground shrink-0">by {profiles[resp.submitted_by]}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => tpl && handleStartForm(tpl, resp)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {tpl && (tpl as any).category !== "rams" && (
                            <JobSheetPdfExport
                              template={filterTemplateBySections({ ...tpl, fields: tpl.fields as any[], branding: tpl.branding as any }, resp.responses as Record<string, any>)}
                              formData={resp.responses as Record<string, any>}
                              jobInfo={jobInfo}
                              jobId={jobId}
                              submittedBy={profiles[resp.submitted_by] || ""}
                              submittedAt={resp.submitted_at}
                            />
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewResponse(resp)} title="View">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Report</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete this completed report. This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteResponse(resp.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Available templates — engineers only see templates matching the job category; RAMS hidden from this list */}
          {(() => {
            const normalizeSlug = (s: string | null) => {
              if (!s) return s;
              if (s === "sprinkler_service") return "sprinkler";
              if (s === "hydrant_service" || s === "fire_hydrant") return "fire_hydrant";
              if (s === "extinguisher_service") return "fire_extinguisher";
              if (s === "installation") return "dry_riser_installation";
              if (s === "dry_riser_pressure_test" || s === "dry_riser_visual" || s === "dry_riser_installation" || s === "dry_riser_remedial") return s;
              if (s === "dry_riser_service" || s === "dry_riser") return "dry_riser";
              return s;
            };
            const jobCategory = normalizeSlug(jobInfo?.category || "");
    const isInstallationJob = jobCategory?.includes("installation");
            // Engineers shouldn't be blocked by category mismatches on legacy/general jobs —
            // fall back to all published service templates so they can still fill something in.
            const publishedNonRams = allTemplates.filter((tpl: any) => {
              const status = tpl.status ?? "published";
              return status === "published" && tpl.category !== "rams";
            });
            const visibleByStatus = templates.filter((tpl) => {
              const status = (tpl as any).status ?? "published";
              return userRole === "admin" || status === "published";
            });
            const nonRamsTemplates = visibleByStatus.filter((tpl) => (tpl as any).category !== "rams");
            let visibleTemplates = isInstallationJob
              ? nonRamsTemplates.filter((tpl) => tpl.name.toLowerCase().includes("commissioning"))
              : nonRamsTemplates.filter((tpl) => {
                  const tplJobCategory = normalizeSlug((tpl as any).job_category);
                  return !tplJobCategory || tplJobCategory === jobCategory;
                });
            // Fallback: if the engineer has zero matched templates (legacy "general"/uncategorised
            // jobs, or no template exists for this job_category), show all published service
            // templates so they always have something to pick.
            if (visibleTemplates.length === 0 && userRole !== "admin" && publishedNonRams.length > 0) {
              visibleTemplates = publishedNonRams as any;
            }
            // Admins see all templates; show a badge indicating job category restriction
            if (visibleTemplates.length > 0) {
              return (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Available Templates</p>
                  <div className="rounded-md border divide-y">
                  {visibleTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between px-3 py-2 min-h-[38px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{tpl.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{tpl.fields.length} fields</span>
                    {userRole === "admin" && (tpl as any).job_category && (
                      <Badge variant="outline" className="text-[10px] h-4 shrink-0">{(tpl as any).job_category.replace(/_/g, " ")}</Badge>
                    )}
                    {userRole === "admin" && ((tpl as any).status ?? "published") === "draft" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 shrink-0 bg-amber-50 text-amber-700 border-amber-200"
                        title="Draft — hidden from new jobs"
                      >
                        Draft
                      </Badge>
                    )}
                  </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        const tplName = tpl.name.toLowerCase();
                        const isQtyTemplate = tplName.includes("pressure test") || tplName.includes("dry riser") || tplName.includes("visual");
                        if (isQtyTemplate && ((jobInfo?.pressure_test_qty || 0) + (jobInfo?.visual_qty || 0)) > 1) {
                          handleAutoCreateDrafts(tpl);
                        } else {
                          handleStartForm(tpl);
                        }
                      }}
                    >
                      Fill In
                    </Button>
                    <BlankTemplatePdfExport template={tpl} jobInfo={jobInfo} />
                    <ScanJobSheet
                      template={tpl}
                      jobId={jobId}
                      jobInfo={jobInfo}
                      onExtracted={(data) => {
                        handleStartForm(tpl);
                        setFormData((prev) => {
                          const merged = { ...prev };
                          const extracted = data as Record<string, any>;

                          // For drain / drop-leg fields, default to YES unless the scan returns an explicit false value
                          tpl.fields.forEach((field) => {
                            const lbl = field.label.toLowerCase();
                            const isDrainField = lbl.includes("drain") || lbl.includes("drop leg");
                            if (!isDrainField) return;

                            const raw = extracted[field.id];
                            const normalized = typeof raw === "string" ? raw.toLowerCase().trim() : raw;
                            const isYesNoSelect =
                              !!field.options &&
                              field.options.length <= 3 &&
                              field.options.some((opt) => opt.toLowerCase() === "yes") &&
                              field.options.some((opt) => opt.toLowerCase() === "no");
                            const isExplicitNo = raw === false || normalized === "false";

                            merged[field.id] = isExplicitNo
                              ? (field.type === "checkbox" ? false : isYesNoSelect ? "NO" : false)
                              : (field.type === "checkbox" ? true : isYesNoSelect ? "YES" : true);
                          });

                          // For outlet-related fields, map N/A from the scanned sheet to a positive value (good condition)
                          const outletMappedFieldIds = new Set<string>();
                          tpl.fields.forEach((field) => {
                            const lbl = field.label.toLowerCase();
                            const isOutletField = lbl.includes("outlet") && (lbl.includes("condition") || lbl.includes("good") || lbl.includes("cabinet") || lbl.includes("cap") || lbl.includes("valve") || lbl.includes("operational"));
                            if (!isOutletField) return;

                            const raw = extracted[field.id];
                            const normalized = typeof raw === "string" ? raw.toLowerCase().trim() : raw;
                            // Preserve descriptive text like "NOT VISIBLE" as-is
                            if (typeof normalized === "string" && (normalized.includes("not visible") || normalized.includes("not installed"))) {
                              merged[field.id] = raw;
                              outletMappedFieldIds.add(field.id);
                            } else if (normalized === "n/a" || normalized === "na") {
                              const isYesNoSelect =
                                !!field.options &&
                                field.options.some((opt) => opt.toLowerCase() === "yes") &&
                                field.options.some((opt) => opt.toLowerCase() === "no");
                              const isSatSelect =
                                !!field.options &&
                                field.options.some((opt) => opt.toLowerCase() === "satisfactory");
                              if (isYesNoSelect) {
                                merged[field.id] = "YES";
                                outletMappedFieldIds.add(field.id);
                              } else if (isSatSelect) {
                                merged[field.id] = "Satisfactory";
                                outletMappedFieldIds.add(field.id);
                              } else if (field.type === "pass_fail") {
                                merged[field.id] = "pass";
                                outletMappedFieldIds.add(field.id);
                              } else if (field.type === "checkbox") {
                                merged[field.id] = true;
                                outletMappedFieldIds.add(field.id);
                              }
                            }
                          });

                          Object.entries(extracted).forEach(([key, value]) => {
                            const field = tpl.fields.find((f) => f.id === key);
                            const lbl = field?.label.toLowerCase() || "";
                            const isDrainField = lbl.includes("drain") || lbl.includes("drop leg");
                            const isBlankish = value === "" || value == null || String(value).toLowerCase() === "undefined";
                            if (!isDrainField && !isBlankish && !outletMappedFieldIds.has(key)) {
                              merged[key] = value;
                            }
                          });
                          return merged;
                        });
                      }}
                    />
                    {userRole === "admin" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTogglePublish(tpl)}
                        title={
                          ((tpl as any).status ?? "published") === "published"
                            ? "Move back to draft (hide from new jobs)"
                            : "Publish (make available to new jobs)"
                        }
                      >
                        {((tpl as any).status ?? "published") === "published"
                          ? <Send className="h-3.5 w-3.5 text-emerald-600" />
                          : <Send className="h-3.5 w-3.5 text-amber-600" />}
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleLock(tpl)} title={tpl.locked ? "Unlock template" : "Lock template"}>
                        {tpl.locked ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Unlock className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {userRole === "admin" && !tpl.locked && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTemplate(tpl)} title="Edit template">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadTemplateJson(tpl as any)} title="Export template as JSON">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicateTemplate(tpl)} title="Duplicate template">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {userRole === "admin" && !tpl.locked && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={deletingTemplateId === tpl.id}>
                            {deletingTemplateId === tpl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Template</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete "{tpl.name}" and all associated responses across all jobs. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteTemplate(tpl.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No templates yet.{userRole === "admin" ? " Import a template to get started." : " Ask an admin to import a template."}
            </p>
          )}
        </CardContent>
      </Card>

      <ImportTemplateDialog open={importOpen} onOpenChange={setImportOpen} onCreated={fetchData} />
      <ImportTemplateJsonDialog open={importJsonOpen} onOpenChange={setImportJsonOpen} onImported={fetchData} />
      <EditTemplateDialog open={!!editingTemplate} onOpenChange={(v) => { if (!v) setEditingTemplate(null); }} template={editingTemplate} onSaved={fetchData} />

      {/* Fill In dialog */}
      <Dialog open={!!(activeTemplate && !viewingResponse)} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent
          className="max-w-2xl w-full p-0 gap-0 flex flex-col"
          style={{ height: "90vh" }}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> {activeTemplate?.name}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {activeResponse && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={mergePhotosFromSubmissions}
                    title="Append any photo uploads that aren't already attached to a dwelling row in this form (existing rows only)"
                  >
                    <Copy className="h-3 w-3" /> Merge photos
                  </Button>
                )}
                {activeResponse && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={restorePhotosFromSubmissions}
                    title="Re-link any photo files that were uploaded for this job but are missing from the form (recreates rows if needed)"
                  >
                    <RotateCcw className="h-3 w-3" /> Restore photos
                  </Button>
                )}
                <button onClick={closeForm} className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
            {activeResponse?.status === "submitted" && userRole === "admin" && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[11px] text-amber-900 flex items-start gap-2">
                <Pencil className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>Office amendment mode.</strong> This report has already been submitted. Every field change you save is logged to the job history (who, when, old &amp; new value){activeResponse.last_amended_at ? ` — last amended ${new Date(activeResponse.last_amended_at as any).toLocaleString("en-GB")}` : ""}.
                </span>
              </div>
            )}
            {sections.map((section) => {
              const omitted = isSectionOmitted(section);
              return (
              <div key={section}>
                <div className="bg-muted px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${omitted ? "text-muted-foreground line-through" : "text-foreground"}`}>{section}</span>
                  <button
                    type="button"
                    onClick={() => toggleSectionOmitted(section)}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border bg-background hover:bg-muted-foreground/10"
                    title={omitted ? "Include this section in the report" : "Omit this section from the report (e.g. system has no storage tank)"}
                  >
                    {omitted ? "Include in report" : "Omit from report"}
                  </button>
                </div>
                {!omitted && activeTemplate?.fields
                  .filter((f) => (f.section || "General") === section)
                  .map((field) => (
                    <div key={field.id} className="border-b border-border last:border-b-0">
                      <div className="grid grid-cols-[1fr,1fr]">
                        <div className="px-3 py-2 border-r border-border flex items-start">
                          <Label className="text-xs leading-tight">
                            {field.label}
                            {field.required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                        </div>
                        <div className="px-2 py-1.5 flex items-center">
                          {renderFormField(field, formData[field.id], (v) => handleFieldValue(field.id, v), lockedFieldIds.has(field.id), engineerOptions, jobId, user?.id)}
                        </div>
                      </div>
                      {(field.allow_notes || formData[`${field.id}_notes`]) && (
                        <div className="px-3 pb-1.5">
                          <Input
                            value={formData[`${field.id}_notes`] || ""}
                            onChange={(e) => handleFieldValue(`${field.id}_notes`, e.target.value)}
                            placeholder="Add note..."
                            className="h-6 text-[11px] border-dashed"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                {omitted && (
                  <div className="px-3 py-2 text-[11px] italic text-muted-foreground border-b border-border">
                    This section will be omitted from the report.
                  </div>
                )}
              </div>
              );
            })}

            {/* Site Photos Drop Zone */}
            <div className="px-3 py-3 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Site Photos
              </p>
              {/* Previously uploaded photos (from a prior submission) */}
              {Array.isArray(formData._site_photo_urls) && formData._site_photo_urls.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Previously uploaded — drag to reorder</p>
                  {(() => {
                    const urls = (formData._site_photo_urls as string[]) || [];
                    const paths = (formData._site_photo_paths as string[]) || [];
                    const caps = (formData._site_photo_captions as string[]) || [];
                    const rows = urls.map((url, i) => ({ url, path: paths[i] || "", caption: caps[i] || "", key: `${paths[i] || url}-${i}` }));
                    return (
                      <SortablePhotoGrid
                        items={rows}
                        getId={(r) => r.key}
                        onReorder={(next) => {
                          setFormData((prev) => ({
                            ...prev,
                            _site_photo_urls: next.map((r) => r.url),
                            _site_photo_paths: next.map((r) => r.path),
                            _site_photo_captions: next.map((r) => r.caption),
                          }));
                        }}
                        renderItem={(r, i) => (
                          <div className="space-y-1">
                            <div className="relative">
                              <img src={r.url} alt={`Existing site photo ${i + 1}`} className="rounded border object-cover w-full aspect-[4/3]" />
                              <button
                                type="button"
                                className="absolute top-1 right-1 rounded-full h-6 w-6 flex items-center justify-center text-sm leading-none bg-black/60 text-white hover:bg-destructive shadow-sm backdrop-blur-sm transition"
                                title="Remove this photo from the report"
                                aria-label="Remove photo"
                                onClick={() => {
                                  const nUrls = [...urls]; const nPaths = [...paths]; const nCaps = [...caps];
                                  nUrls.splice(i, 1); nPaths.splice(i, 1); nCaps.splice(i, 1);
                                  setFormData((prev) => ({
                                    ...prev,
                                    _site_photo_urls: nUrls,
                                    _site_photo_paths: nPaths,
                                    _site_photo_captions: nCaps,
                                  }));
                                }}
                              >×</button>

                            </div>
                            <input
                              type="text"
                              maxLength={100}
                              value={r.caption}
                              placeholder={`Caption (optional) — defaults to "Photo ${i + 1}"`}
                              onChange={(e) => {
                                const v = e.target.value;
                                const nCaps = [...caps];
                                while (nCaps.length <= i) nCaps.push("");
                                nCaps[i] = v;
                                setFormData((prev) => ({ ...prev, _site_photo_captions: nCaps }));
                              }}
                              className="w-full text-xs px-2 py-1 border rounded bg-background"
                            />
                          </div>
                        )}
                      />
                    );
                  })()}
                </div>
              )}
              <div
                className="border-2 border-dashed rounded-lg p-3 text-center transition-colors hover:bg-muted/30 cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                  if (files.length === 0) return;
                  const newPhotos = files.slice(0, 10 - sitePhotos.length).map(file => ({
                    file,
                    preview: URL.createObjectURL(file),
                    caption: "",
                  }));
                  setSitePhotos(prev => [...prev, ...newPhotos].slice(0, 10));
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.multiple = true;
                  input.onchange = () => {
                    const files = Array.from(input.files || []).filter(f => f.type.startsWith("image/"));
                    const newPhotos = files.slice(0, 10 - sitePhotos.length).map(file => ({
                      file,
                      preview: URL.createObjectURL(file),
                      caption: "",
                    }));
                    setSitePhotos(prev => [...prev, ...newPhotos].slice(0, 10));
                  };
                  input.click();
                }}
              >
                {sitePhotos.length === 0 ? (
                  <>
                    <Camera className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Drag & drop site photos here or click to browse</p>
                  </>
                ) : (
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                    <SortablePhotoGrid
                      items={sitePhotos}
                      getId={(p, i) => `pending-${p.preview}-${i}`}
                      onReorder={(next) => setSitePhotos(next)}
                      renderItem={(photo, i) => (
                        <div className="space-y-1">
                          <div className="relative">
                            <img src={photo.preview} alt={`Site ${i + 1}`} className="rounded border object-cover w-full aspect-[4/3]" />
                            <button
                              type="button"
                              className="absolute top-1 right-1 rounded-full h-6 w-6 flex items-center justify-center text-sm leading-none bg-black/60 text-white hover:bg-destructive shadow-sm backdrop-blur-sm transition"
                              aria-label="Remove photo"
                              onClick={() => {
                                URL.revokeObjectURL(photo.preview);
                                setSitePhotos(prev => prev.filter((_, idx) => idx !== i));
                              }}
                            >×</button>

                          </div>
                          <input
                            type="text"
                            maxLength={100}
                            value={photo.caption}
                            placeholder={`Caption (optional) — defaults to "Photo ${i + 1}"`}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSitePhotos(prev => prev.map((p, idx) => idx === i ? { ...p, caption: v } : p));
                            }}
                            className="w-full text-xs px-2 py-1 border rounded bg-background"
                          />
                        </div>
                      )}
                    />
                    {sitePhotos.length < 10 && (
                      <div
                        className="border border-dashed rounded flex items-center justify-center aspect-[4/3] text-muted-foreground hover:bg-muted/50 cursor-pointer max-w-[calc(50%-0.375rem)]"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.multiple = true;
                          input.onchange = () => {
                            const files = Array.from(input.files || []).filter(f => f.type.startsWith("image/"));
                            const newPhotos = files.slice(0, 10 - sitePhotos.length).map(file => ({
                              file,
                              preview: URL.createObjectURL(file),
                              caption: "",
                            }));
                            setSitePhotos(prev => [...prev, ...newPhotos].slice(0, 10));
                          };
                          input.click();
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                )}
              </div>
              {sitePhotos.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">{sitePhotos.length} photo(s) — will appear at the bottom of the PDF</p>
              )}
            </div>

            {/* Inline sign-off — engineer signs here so the flow is one continuous
                sequence (answer → sign → submit) without hunting for a separate tab.
                The Sign-off tab remains for adding/managing signatures later. */}
            <div className="mt-6 pt-4 border-t border-border space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Sign off</h3>
                <p className="text-xs text-muted-foreground">Sign here to complete the sheet. You can also collect an on-site customer signature.</p>
              </div>
              <SignatureCapture
                jobId={jobId}
                signerRole="engineer"
                filterByRole
                heading="Engineer signature"
              />
              <SignatureCapture
                jobId={jobId}
                signerRole="customer"
                filterByRole
                heading="Customer signature (optional)"
              />
            </div>
          </div>
          <div className="flex gap-2 px-4 py-3 border-t border-border bg-card">
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Draft
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Submit
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
              onClick={handleResetToTemplate}
              title="Reset all fields to the master template defaults"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Template Defaults
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View response dialog */}
      <Dialog open={!!(viewingResponse && activeTemplate)} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent
          className="max-w-2xl w-full p-0 gap-0 flex flex-col"
          style={{ height: "90vh" }}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> {activeTemplate?.name}
                {viewingResponse && <Badge variant="secondary" className="text-[10px]">{viewingResponse.status}</Badge>}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {activeTemplate && viewingResponse && (
                  <JobSheetPdfExport
                    template={filterTemplateBySections(activeTemplate, formData)}
                    formData={formData}
                    jobInfo={jobInfo}
                    jobId={jobId}
                    submittedBy={viewingResponse.submitted_by ? profiles[viewingResponse.submitted_by] : undefined}
                    submittedAt={viewingResponse.submitted_at}
                  />
                )}
                <button onClick={closeForm} className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
            {viewingResponse && activeTemplate && (
              <div className="px-3 pt-3">
                <PreviousReportPanel
                  currentJobId={jobId}
                  templateId={activeTemplate.id}
                  templateFields={activeTemplate.fields as any}
                  currentResponses={formData}
                  currentResponseId={viewingResponse.id}
                />
              </div>
            )}
            {sections.filter((s) => !isSectionOmitted(s)).map((section) => (
              <div key={section}>
                <div className="bg-muted px-3 py-1.5 border-b border-border">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">{section}</span>
                </div>
                {activeTemplate?.fields
                  .filter((f) => (f.section || "General") === section)
                  .map((field) => (
                    <div key={field.id} className="border-b border-border last:border-b-0">
                      <div className="grid grid-cols-[1fr,1fr]">
                        <div className="px-3 py-2 border-r border-border">
                          <span className="text-xs text-muted-foreground leading-tight">{field.label}</span>
                        </div>
                        <div className="px-3 py-2">
                          {field.type === "photo" ? (
                            formData[field.id] ? (
                              <PhotoPreview path={formData[field.id]} className="max-w-[180px] rounded" />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )
                          ) : field.type === "signature" ? (
                            formData[field.id] ? (
                              <img src={formData[field.id]} alt="Signature" data-uploaded="true" className="max-h-[60px] border rounded bg-background" />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )
                          ) : field.type === "repeating_table" ? (
                            <RepeatingTableReadOnly
                              columns={((field as any).columns || []) as any[]}
                              value={formData[field.id]}
                              label={field.label}
                            />
                          ) : (
                            <span className="text-xs font-medium whitespace-pre-wrap">
                              {field.type === "checkbox"
                                ? (() => {
                                    const rawValue = formData[field.id];
                                    const normalizedValue = typeof rawValue === "string" ? rawValue.toLowerCase().trim() : "";

                                    if (normalizedValue === "yes" || normalizedValue === "true" || rawValue === true) return "✓ Yes";
                                    if (normalizedValue === "no" || normalizedValue === "false" || rawValue === false) return "✗ No";
                                    if (normalizedValue === "n/a" || normalizedValue === "na") return "N/A";
                                    if (rawValue !== undefined && rawValue !== null && rawValue !== "") return String(rawValue);
                                    return "—";
                                  })()
                                : field.type === "pass_fail"
                                ? (formData[field.id] === "pass"
                                    ? <span className="text-green-600 font-semibold">✓ PASS</span>
                                    : formData[field.id] === "fail"
                                    ? <span className="text-destructive font-semibold">✗ FAIL</span>
                                    : formData[field.id] === "n/a"
                                    ? <span className="text-muted-foreground font-semibold">N/A</span>
                                    : formData[field.id]
                                    ? String(formData[field.id])
                                    : "—")
                                : (formData[field.id] || "—")}
                            </span>
                          )}
                        </div>
                      </div>
                      {formData[`${field.id}_notes`] && (
                        <div className="px-3 pb-1.5">
                          <span className="text-[11px] text-muted-foreground italic">Note: {formData[`${field.id}_notes`]}</span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function renderFormField(
  field: TemplateField,
  value: any,
  onChange: (value: any) => void,
  locked?: boolean,
  engineerOptions?: string[],
  jobId?: string,
  userId?: string,
) {
  switch (field.type) {
    case "text":
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full"
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full"
        />
      );
    case "textarea":
      return (
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          rows={2}
          className="text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 resize-none w-full min-h-[40px]"
        />
      );
    case "checkbox": {
      // Two explicit tick boxes — YES and NO — so the inspector must make a deliberate choice.
      // Tri-state: undefined/null = no answer yet; true = YES; false = NO.
      // Air release valve fields get a third "NO ACCESS" option.
      // Fields flagged with allow_na get an additional "N/A" option.
      const lbl = (field.label || "").toLowerCase();
      const isAirRelease = lbl.includes("air release");
      const allowNa = !!(field as any).allow_na;
      const isYes = value === true;
      const isNo = value === false;
      const isNoAccess = typeof value === "string" && value.toUpperCase() === "NO ACCESS";
      const isNa = typeof value === "string" && ["n/a", "na"].includes(value.toLowerCase());
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={isYes}
              onCheckedChange={(checked) => onChange(checked ? true : null)}
              aria-label="Yes"
            />
            <span className="text-xs text-muted-foreground">YES</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={isNo}
              onCheckedChange={(checked) => onChange(checked ? false : null)}
              aria-label="No"
            />
            <span className="text-xs text-muted-foreground">NO</span>
          </label>
          {allowNa && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={isNa}
                onCheckedChange={(checked) => onChange(checked ? "N/A" : null)}
                aria-label="N/A"
              />
              <span className="text-xs text-muted-foreground">N/A</span>
            </label>
          )}
          {isAirRelease && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={isNoAccess}
                onCheckedChange={(checked) => onChange(checked ? "NO ACCESS" : null)}
                aria-label="No Access"
              />
              <span className="text-xs text-muted-foreground">NO ACCESS</span>
            </label>
          )}
        </div>
      );
    }
    case "pass_fail": {
      const normalizedValue = typeof value === "string" ? value.toLowerCase().trim() : "";
      const hasCustomValue = typeof value === "string" && value.trim() !== "" && !["pass", "fail", "n/a"].includes(normalizedValue);

      if (hasCustomValue) {
        return (
          <Input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Custom result"
            className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full"
          />
        );
      }

      return (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={value === "pass" ? "default" : "outline"}
            className={`h-7 px-2.5 text-xs gap-1 ${value === "pass" ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
            onClick={() => onChange(value === "pass" ? null : "pass")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Pass
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value === "fail" ? "default" : "outline"}
            className={`h-7 px-2.5 text-xs gap-1 ${value === "fail" ? "bg-destructive hover:bg-destructive/90 text-white" : ""}`}
            onClick={() => onChange(value === "fail" ? null : "fail")}
          >
            <X className="h-3.5 w-3.5" />
            Fail
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value === "n/a" ? "default" : "outline"}
            className={`h-7 px-2.5 text-xs gap-1 ${value === "n/a" ? "bg-muted text-muted-foreground" : ""}`}
            onClick={() => onChange(value === "n/a" ? null : "n/a")}
          >
            N/A
          </Button>
        </div>
      );
    }
    case "select": {
      // Dynamically replace options for engineer/technician fields
      const isEngineerField =
        field.id === "technician_name" ||
        field.label.toLowerCase().includes("engineer") ||
        field.label.toLowerCase().includes("technician");
      const options =
        isEngineerField && engineerOptions && engineerOptions.length > 0
          ? engineerOptions
          : field.options || [];
      const hasCustomValue = typeof value === "string" && value.trim() !== "" && !options.includes(value);

      if (hasCustomValue) {
        return (
          <Input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "Custom value"}
            className={`h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full ${locked ? "opacity-70 cursor-not-allowed" : ""}`}
            disabled={locked}
          />
        );
      }

      return (
        <Select value={value || ""} onValueChange={onChange} disabled={locked}>
          <SelectTrigger className={`h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full ${locked ? "opacity-70 cursor-not-allowed" : ""}`}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "photo":
      return <PhotoField value={value} onChange={onChange} fieldId={field.id} jobId={jobId} userId={userId} />;
    case "signature":
      return <SignatureField value={value} onChange={onChange} />;
    case "repeating_table": {
      const cols = ((field as any).columns || []) as any[];
      return <RepeatingTableField columns={cols} value={value} onChange={onChange} jobId={jobId} userId={userId} fieldId={field.id} />;
    }
    default:
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full"
        />
      );
  }
}

/**
 * Live-sheet signature pad.
 * - Pointer Events (touch, stylus, mouse) so we can capture coalesced samples
 *   (event.getCoalescedEvents) — fast strokes weren't being sampled often
 *   enough with touchmove alone, producing jagged straight segments at the
 *   start of each stroke.
 * - Midpoint quadratic smoothing from the very first segment so ink looks
 *   smooth from the first millimetre.
 * - Backing store scaled to devicePixelRatio for crisp lines on tablets.
 */
function SignatureField({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSig, setHasSig] = useState(!!value);
  const drawing = useRef(false);
  const points = useRef<{ x: number; y: number }[]>([]);

  // Size the canvas backing store to the CSS box × devicePixelRatio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || 300;
    const cssH = rect.height || 80;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "#000";
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.drawImage(img, 0, 0, cssW, cssH);
        setHasSig(true);
      };
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (ev: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (ev as PointerEvent).clientX - rect.left, y: (ev as PointerEvent).clientY - rect.top };
  };

  const drawTip = (ctx: CanvasRenderingContext2D) => {
    const pts = points.current;
    const n = pts.length;
    if (n < 2) return;
    if (n === 2) {
      // First segment: short line — better than nothing, avoids jagged jump.
      const [p0, p1] = pts;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      return;
    }
    // Midpoint smoothing: quadratic curve between the midpoints of the last
    // three points, using the middle point as the control. This gives smooth
    // ink from the very first stroke.
    const p0 = pts[n - 3];
    const p1 = pts[n - 2];
    const p2 = pts[n - 1];
    const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(m1.x, m1.y);
    ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    drawing.current = true;
    points.current = [getPos(e)];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const events = typeof native.getCoalescedEvents === "function"
      ? native.getCoalescedEvents()
      : [native];
    for (const ev of events) {
      points.current.push(getPos(ev));
      drawTip(ctx);
    }
    setHasSig(true);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch {}
    points.current = [];
    const dataUrl = canvasRef.current?.toDataURL("image/png") || null;
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx?.clearRect(0, 0, rect.width, rect.height);
    setHasSig(false);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative border border-border rounded bg-background">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair rounded"
          style={{ display: "block", height: 80, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!hasSig && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground pointer-events-none">
            Sign here
          </span>
        )}
      </div>
      {hasSig && (
        <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px] self-start text-muted-foreground" onClick={clear}>
          Clear
        </Button>
      )}
    </div>
  );
}

function PhotoField({ value, onChange, fieldId, jobId, userId }: { value: any; onChange: (v: any) => void; fieldId: string; jobId?: string; userId?: string }) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  // Two inputs so the engineer can choose live camera OR the gallery.
  // capture="environment" tells the OS to open the rear camera directly.
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      supabase.storage.from("submissions").createSignedUrl(value, 3600).then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
    } else {
      setSignedUrl(null);
    }
  }, [value]);

  const handleUpload = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    // Gentle one-off cellular data notice; matches the recently added
    // mobile-data warnings on other upload surfaces.
    try {
      const { maybeShowMobileDataAdvisory } = await import("@/lib/mobileDataNotice");
      maybeShowMobileDataAdvisory("photo uploads");
    } catch {}
    // Client-side downscale + re-encode as JPEG to keep uploads reasonable
    // over cellular. Falls back to the original file if compression bails.
    let toUpload: Blob = file;
    let ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    let contentType = file.type || "image/jpeg";
    try {
      const { compressImageForUpload } = await import("@/lib/imageCompress");
      const compressed = await compressImageForUpload(file, 2000, 0.85);
      if (compressed) {
        toUpload = compressed;
        ext = "jpg";
        contentType = "image/jpeg";
      }
    } catch {}
    const fileName = `${fieldId}-${Date.now()}.${ext}`;
    const path = jobId ? `${jobId}/template-photos/${fileName}` : `template-photos/${fileName}`;
    const storagePath = await buildOrgPathAsync(path);
    const { error } = await supabase.storage.from("submissions").upload(storagePath, toUpload, { upsert: true, contentType });
    if (error) {
      console.error("Upload error:", error);
    } else {
      onChange(path);
      // Register as a job submission so it appears in the job folder/Documents
      if (jobId && userId) {
        const { error: subErr } = await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: userId,
          type: "photo",
          file_url: buildDurableRef("submissions", storagePath),
          file_name: fileName,
        } as any);
        if (subErr) console.error("Submission insert failed", subErr);
      }
    }
    setUploading(false);
  };

  const handleRemove = () => {
    onChange(null);
    setSignedUrl(null);
  };

  return (
    <div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      {signedUrl ? (
        <div className="relative inline-block">
          <img src={signedUrl} alt="Captured" className="max-w-[120px] max-h-[80px] rounded border object-cover" />
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            {uploading ? "Uploading..." : "Take photo"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
          >
            Choose existing
          </Button>
        </div>
      )}
    </div>
  );
}

function PhotoPreview({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    createSubmissionPhotoSignedUrl(path, undefined, 3600).then((signed) => {
      if (signed?.signedUrl) setUrl(signed.signedUrl);
    });
  }, [path]);

  if (!url) return <span className="text-xs text-muted-foreground">Loading photo...</span>;
  return <img src={url} alt="Attached" className={className || "max-w-[180px] rounded border object-cover"} />;
}
