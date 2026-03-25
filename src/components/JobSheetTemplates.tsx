import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobCategories } from "@/hooks/useJobCategories";
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
  FileText, Plus, ClipboardCheck, Send, Loader2, CheckCircle2, Eye, Camera, X, Trash2, Pencil, Copy, Lock, Unlock,
} from "lucide-react";
import JobSheetPdfExport from "./JobSheetPdfExport";
import BlankTemplatePdfExport from "./BlankTemplatePdfExport";
import ScanJobSheet from "./ScanJobSheet";
import ImportTemplateDialog from "./ImportTemplateDialog";
import EditTemplateDialog from "./EditTemplateDialog";
import RamsPdfExport from "./RamsPdfExport";
import AiRamsAutoFill from "./AiRamsAutoFill";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  placeholder?: string;
  allow_notes?: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  created_at: string;
  locked?: boolean;
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
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { categories: jobCategories } = useJobCategories();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [engineerOptions, setEngineerOptions] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeResponse, setActiveResponse] = useState<Response | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewingResponse, setViewingResponse] = useState<Response | null>(null);
  const [aiRamsData, setAiRamsData] = useState<Record<string, any> | null>(null);
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string>("");

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
    const [tplRes, respRes, jobRes, schedRes] = await Promise.all([
      supabase.from("job_sheet_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
      supabase.from("jobs").select("name, address, customer, reference_number, category, status, priority, visual_qty, pressure_test_qty, other_qty, other_service_type, customer_id, site_id, customers(name, email, phone, logo_url), sites(name, address, postcode, contact_name, contact_phone, contact_email, riser_location)").eq("id", jobId).single(),
      supabase.from("job_schedule").select("schedule_date").eq("job_id", jobId).order("schedule_date", { ascending: true }).limit(1),
    ]);
    // Store earliest scheduled date for RAMS attendance date auto-fill
    if (schedRes.data && schedRes.data.length > 0) {
      setScheduledDate(new Date(schedRes.data[0].schedule_date).toLocaleDateString("en-GB"));
    }
    const rawJobCategory = (jobRes.data as any)?.category || null;
    // Normalize legacy slug aliases to canonical slugs
    const normalizeCategory = (cat: string | null) => {
      if (!cat) return null;
      if (cat === "sprinkler_service") return "sprinkler";
      if (cat === "hydrant_service" || cat === "fire_hydrant") return "fire_hydrant";
      if (cat === "extinguisher_service") return "fire_extinguisher";
      // "installation" jobs map to "dry_riser_installation" so commissioning templates are included
      if (cat === "installation") return "dry_riser_installation";
      // All dry riser service/maintenance variants → canonical "dry_riser"
      if (cat === "dry_riser_service" || cat === "dry_riser") return "dry_riser";
      if (cat.startsWith("dry_riser_") && cat !== "dry_riser_installation") return "dry_riser";
      return cat;
    };
    const jobCategory = normalizeCategory(rawJobCategory);
    const allTpls = (tplRes.data || []).map((t: any) => ({
      ...t,
      fields: (typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields) as TemplateField[],
      branding: t.branding || {},
    }));
    // Only show templates that match the job's canonical category (or global "rams" category which spans all jobs)
    const filteredTpls = allTpls.filter((t: any) => {
      if (!t.job_category) return t.category === "rams"; // RAMS templates are global; uncategorised non-RAMS templates are hidden
      return normalizeCategory(t.job_category) === jobCategory;
    });
    setTemplates(filteredTpls);
    setResponses((respRes.data || []) as Response[]);

    let engineerNames: string[] = [];
    if (jobRes.data) {
      const jd = jobRes.data as any;
      // Fetch assigned engineers
      const { data: assigns } = await supabase
        .from("job_assignments")
        .select("engineer_id")
        .eq("job_id", jobId);
      if (assigns && assigns.length > 0) {
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

    // Fetch profile names
    const userIds = new Set<string>();
    (respRes.data || []).forEach((r: any) => r.submitted_by && userIds.add(r.submitted_by));
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", Array.from(userIds));
      const map: Record<string, string> = {};
      (profs || []).forEach((p) => { map[p.user_id] = p.full_name; });
      setProfiles(map);
    }
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

  const getAutoPopulatedData = (template: Template): Record<string, any> => {
    const prefilled: Record<string, any> = {};
    if (!jobInfo) return prefilled;

    const jobAddress = jobInfo.address || jobInfo.site?.address || "";
    const siteName = jobInfo.site?.name || "";
    const customerName = jobInfo.customer || "";
    const sitePostcode = jobInfo.site?.postcode || "";
    const siteContact = jobInfo.site?.contact_name || "";
    const siteContactPhone = jobInfo.site?.contact_phone || "";
    const siteContactEmail = jobInfo.site?.contact_email || "";
    const engineerList = (jobInfo.engineers || []).join(", ");

    template.fields.forEach((f) => {
      // Never auto-fill fields that have options — leave blank for engineer to select
      if (f.options && f.options.length > 0) return;
      const label = f.label.toLowerCase().replace(/[:\s]+$/g, "").trim();

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
        prefilled[f.id] = [customerName, jobInfo.customer_email, jobInfo.customer_phone].filter(Boolean).join("\n");
      // Customer / client name
      } else if (label === "customer name" || label === "client name" || label === "customer" || label === "client") {
        prefilled[f.id] = customerName;
      } else if (label.includes("customer") && !label.includes("sign") && !label.includes("email") && !label.includes("phone")) {
        prefilled[f.id] = customerName;
      // Customer email
      } else if ((label.includes("customer") || label.includes("client")) && label.includes("email")) {
        prefilled[f.id] = jobInfo.customer_email || "";
      // Customer phone
      } else if ((label.includes("customer") || label.includes("client")) && (label.includes("phone") || label.includes("tel"))) {
        prefilled[f.id] = jobInfo.customer_phone || "";
      // Reference / PO number
      } else if (label.includes("po number") || label.includes("reference") || label.includes("ref no") || label.includes("job ref") || label.includes("job number") || label.includes("order number")) {
        prefilled[f.id] = jobInfo.reference_number || "";
      // Job name / description — extended for commissioning certs
      } else if (
        label === "job name" || label === "job title" || label === "job description" ||
        label === "description of work" || label === "works description" ||
        label === "project name" || label === "project title" || label === "contract" ||
        label.includes("project description") || label === "works"
      ) {
        prefilled[f.id] = jobInfo.name || "";
      // Address / location — extended for commissioning certs
      } else if (
        label === "site address" || label === "address" || label === "location" ||
        label === "site location" || label === "property address" || label === "premises address" ||
        label === "installation address" || label === "premises"
      ) {
        prefilled[f.id] = [jobInfo.address || jobInfo.site?.address, jobInfo.site?.postcode].filter(Boolean).join(", ");
      // Number of systems (commissioning cert specific)
      } else if (
        label.includes("number of") && (label.includes("system") || label.includes("riser")) ||
        label.includes("no. of") || label.includes("no of") && (label.includes("system") || label.includes("riser")) ||
        label === "qty" || label === "quantity of systems" || label === "number of risers"
      ) {
        prefilled[f.id] = String(jobInfo.other_qty || 1);
      // Date fields — use scheduled planner date if available, else today
      } else if (label === "date" || label === "inspection date" || label === "service date" || label === "visit date" || label === "work date" || label === "commissioning date" || label === "installation date" || label === "completion date") {
        prefilled[f.id] = scheduledDate || new Date().toISOString().split("T")[0];
      // Attendance date — always use the planner-booked date
      } else if (label.includes("attendance date") || label === "rams_attendance_date" || label === "attendance") {
        prefilled[f.id] = scheduledDate || new Date().toLocaleDateString("en-GB");
      // Category / scope / type of work — auto-set from PT/Visual quantities, fallback to category
      } else if (label.includes("scope") || label.includes("type of work") || label.includes("work type") || label.includes("job type") || label.includes("category") || label.includes("service type")) {
        const scopeParts: string[] = [];
        if ((jobInfo.pressure_test_qty ?? 0) > 0) scopeParts.push(`Pressure Test ×${jobInfo.pressure_test_qty}`);
        if ((jobInfo.visual_qty ?? 0) > 0) scopeParts.push(`Visual Inspection ×${jobInfo.visual_qty}`);
        if ((jobInfo.other_qty ?? 0) > 0 && jobInfo.other_service_type) scopeParts.push(`${jobInfo.other_service_type} ×${jobInfo.other_qty}`);
        const categoryName = jobCategories.find(c => c.slug === jobInfo.category)?.name
          || (jobInfo.category ? jobInfo.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "");
        prefilled[f.id] = scopeParts.length > 0 ? scopeParts.join(", ") : categoryName;
      // Priority
      } else if (label === "priority" || label === "job priority") {
        prefilled[f.id] = jobInfo.priority || "";
      // Engineer / technician
      } else if (label.includes("engineer") || label.includes("technician") || label.includes("operative") || label.includes("carried out by") || label.includes("completed by") || label.includes("attended by")) {
        prefilled[f.id] = engineerList;
      // PT / Visual quantities
      } else if (label.includes("pressure test") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
        prefilled[f.id] = String(jobInfo.pressure_test_qty ?? 0);
      } else if (label.includes("visual") && (label.includes("qty") || label.includes("quantity") || label.includes("number"))) {
        prefilled[f.id] = String(jobInfo.visual_qty ?? 0);
      } else if (label.includes("riser location") || label.includes("riser loc")) {
        prefilled[f.id] = jobInfo.site?.riser_location || "";
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

  const handleStartForm = (template: Template, existingResponse?: Response) => {
    setActiveTemplate(template);
    setViewingResponse(null);
    const prefilled = getAutoPopulatedData(template);
    // Determine which field IDs are auto-populated from job data
    const autoPopulatedIds = new Set(Object.keys(prefilled));
    if (existingResponse) {
      setActiveResponse(existingResponse);
      const saved = existingResponse.responses as Record<string, any>;
      const merged: Record<string, any> = { ...prefilled };
      Object.entries(saved).forEach(([key, val]) => {
        // Always use fresh job data for auto-populated fields (never stale saved values)
        if (autoPopulatedIds.has(key)) return;
        if (val !== undefined && val !== null && val !== "") {
          merged[key] = val;
        }
      });
      setFormData(merged);
    } else {
      setActiveResponse(null);
      setFormData(prefilled);
    }
  };

  // Reset form data back to master template defaults, preserving job auto-populated fields
  const handleResetToTemplate = () => {
    if (!activeTemplate) return;
    const prefilled = getAutoPopulatedData(activeTemplate);
    const templateDefaults: Record<string, any> = {};
    activeTemplate.fields.forEach((f) => {
      if (f.type === "checkbox") templateDefaults[f.id] = false;
      else templateDefaults[f.id] = "";
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
      if (activeResponse) {
        await supabase.from("job_sheet_responses").update({
          responses: formData as any,
        } as any).eq("id", activeResponse.id);
      } else {
        const { data } = await supabase.from("job_sheet_responses").insert({
          job_id: jobId,
          template_id: activeTemplate.id,
          responses: formData as any,
          submitted_by: user?.id,
          status: "draft",
        } as any).select().single();
        if (data) setActiveResponse(data as Response);
      }
      toast({ title: "Draft saved" });
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
      if (activeResponse) {
        await supabase.from("job_sheet_responses").update({
          responses: formData as any,
          status: "submitted",
          submitted_at: new Date().toISOString(),
        } as any).eq("id", activeResponse.id);
      } else {
        await supabase.from("job_sheet_responses").insert({
          job_id: jobId,
          template_id: activeTemplate.id,
          responses: formData as any,
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
    const tpl = templates.find((t) => t.id === resp.template_id);
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

  const closeForm = () => { setActiveTemplate(null); setActiveResponse(null); setFormData({}); setViewingResponse(null); };

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
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Import Template
                </Button>
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
                    onApply={(result) => setAiRamsData({
                      rams_description: result.description,
                      rams_method_statement: result.method_statement,
                      rams_hazards: result.hazards.join("\n"),
                      rams_controls: result.controls.join("\n"),
                      rams_ppe: result.ppe.join(", "),
                    })}
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
              const tpl = templates.find((t) => t.id === r.template_id);
              return (tpl as any)?.category !== "rams" && r.status === "draft";
            });
            if (!draftResps.length) return null;
            return (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">In Progress</p>
                <div className="rounded-md border divide-y">
                  {draftResps.map((resp) => {
                    const tpl = templates.find((t) => t.id === resp.template_id);
                    const canEdit = userRole === "admin" || resp.submitted_by === user?.id;
                    return (
                      <div key={resp.id} className="flex items-center justify-between px-3 py-2 min-h-[38px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="text-sm truncate">{tpl?.name || "Unknown Template"}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Draft</Badge>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => tpl && handleStartForm(tpl, resp)}>
                            Continue
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
              const tpl = templates.find((t) => t.id === r.template_id);
              return (tpl as any)?.category !== "rams" && r.status === "submitted";
            });
            if (!completedResps.length) return null;
            return (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Completed Reports</p>
                <div className="rounded-md border divide-y">
                  {completedResps.map((resp) => {
                    const tpl = templates.find((t) => t.id === resp.template_id);
                    const canEdit = userRole === "admin" || resp.submitted_by === user?.id;
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
                              template={{ ...tpl, fields: tpl.fields as any[], branding: tpl.branding as any }}
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
              // All dry riser maintenance variants → "dry_riser"; installation stays distinct
              if (s === "dry_riser_service" || s === "dry_riser") return "dry_riser";
              if (s.startsWith("dry_riser_") && s !== "dry_riser_installation") return "dry_riser";
              return s;
            };
            const jobCategory = normalizeSlug(jobInfo?.category || "");
    const isInstallationJob = jobCategory?.includes("installation");
            const nonRamsTemplates = templates.filter((tpl) => (tpl as any).category !== "rams");
            const visibleTemplates = isInstallationJob
              // Installation jobs: only show the Dry Riser Commissioning Certificate template
              ? nonRamsTemplates.filter((tpl) => tpl.name.toLowerCase().includes("commissioning"))
              : userRole === "admin"
              ? nonRamsTemplates
              : nonRamsTemplates.filter((tpl) => {
                  const tplJobCategory = normalizeSlug((tpl as any).job_category);
                  // Show template if it has no job_category restriction, or it matches the job's canonical category
                  return !tplJobCategory || tplJobCategory === jobCategory;
                });
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
                        setTimeout(() => setFormData((prev) => ({ ...prev, ...data })), 100);
                      }}
                    />
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
              <button onClick={closeForm} className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
            {sections.map((section) => (
              <div key={section}>
                <div className="bg-muted px-3 py-1.5 border-b border-border">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">{section}</span>
                </div>
                {activeTemplate?.fields
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
                          {renderFormField(field, formData[field.id], (v) => handleFieldValue(field.id, v), lockedFieldIds.has(field.id), engineerOptions)}
                        </div>
                      </div>
                      {field.allow_notes && (
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
              </div>
            ))}
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
                    template={activeTemplate}
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
            {sections.map((section) => (
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
                              <img src={formData[field.id]} alt="Signature" className="max-h-[60px] border rounded bg-background" />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )
                          ) : (
                            <span className="text-xs font-medium whitespace-pre-wrap">
                              {field.type === "checkbox"
                                ? (formData[field.id] ? "✓ Yes" : "✗ No")
                                : field.type === "pass_fail"
                                ? (formData[field.id] === "pass" ? <span className="text-green-600 font-semibold">✓ PASS</span> : formData[field.id] === "fail" ? <span className="text-destructive font-semibold">✗ FAIL</span> : formData[field.id] === "n/a" ? <span className="text-muted-foreground font-semibold">N/A</span> : "—")
                                : (formData[field.id] || "—")}
                            </span>
                          )}
                        </div>
                      </div>
                      {field.allow_notes && formData[`${field.id}_notes`] && (
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
  engineerOptions?: string[]
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
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-xs text-muted-foreground">{value ? "YES" : "NO"}</span>
        </div>
      );
    case "pass_fail":
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
      return <PhotoField value={value} onChange={onChange} fieldId={field.id} />;
    case "signature":
      return <SignatureField value={value} onChange={onChange} />;
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

function SignatureField({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(!!value);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Restore existing signature on mount
  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(img, 0, 0);
          setHasSig(true);
        }
      };
      img.src = value;
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
    setHasSig(true);
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(false);
    lastPos.current = null;
    // Save as data URL
    const dataUrl = canvasRef.current?.toDataURL("image/png") || null;
    if (hasSig || dataUrl) onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative border border-border rounded bg-background">
        <canvas
          ref={canvasRef}
          width={300}
          height={80}
          className="w-full touch-none cursor-crosshair rounded"
          style={{ display: "block" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
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

function PhotoField({ value, onChange, fieldId }: { value: any; onChange: (v: any) => void; fieldId: string }) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const ext = file.name.split(".").pop() || "jpg";
    const path = `template-photos/${fieldId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
    if (error) {
      console.error("Upload error:", error);
    } else {
      onChange(path);
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
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
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
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          {uploading ? "Uploading..." : "Take Photo"}
        </Button>
      )}
    </div>
  );
}

function PhotoPreview({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from("submissions").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  if (!url) return <span className="text-xs text-muted-foreground">Loading photo...</span>;
  return <img src={url} alt="Attached" className={className || "max-w-[180px] rounded border object-cover"} />;
}
