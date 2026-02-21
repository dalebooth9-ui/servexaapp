import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  FileText, Plus, ClipboardCheck, Send, Loader2, CheckCircle2, Eye, Camera, X, Trash2, Pencil, Copy,
} from "lucide-react";
import JobSheetPdfExport from "./JobSheetPdfExport";
import ImportTemplateDialog from "./ImportTemplateDialog";
import EditTemplateDialog from "./EditTemplateDialog";

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
  reference_number: string;
  site?: { name: string; address: string | null; postcode: string | null } | null;
};

export default function JobSheetTemplates({ jobId }: { jobId: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeResponse, setActiveResponse] = useState<Response | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewingResponse, setViewingResponse] = useState<Response | null>(null);
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);

  const fetchData = async () => {
    const [tplRes, respRes, jobRes] = await Promise.all([
      supabase.from("job_sheet_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
      supabase.from("jobs").select("address, customer, reference_number, site_id, sites(name, address, postcode)").eq("id", jobId).single(),
    ]);
    const tpls = (tplRes.data || []).map((t: any) => ({
      ...t,
      fields: (typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields) as TemplateField[],
      branding: t.branding || {},
    }));
    setTemplates(tpls);
    setResponses((respRes.data || []) as Response[]);

    if (jobRes.data) {
      const jd = jobRes.data as any;
      setJobInfo({
        address: jd.address,
        customer: jd.customer,
        reference_number: jd.reference_number,
        site: jd.sites ? { name: jd.sites.name, address: jd.sites.address, postcode: jd.sites.postcode } : null,
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

    const siteAddress = jobInfo.site?.address || jobInfo.address || "";
    const sitePostcode = jobInfo.site?.postcode || "";
    const siteName = jobInfo.site?.name || "";
    const customerName = jobInfo.customer || "";
    const fullSiteDetails = [customerName, siteAddress].filter(Boolean).join("\n");

    template.fields.forEach((f) => {
      const label = f.label.toLowerCase();
      // Auto-fill site details (site name + address + postcode)
      if (
        (label.includes("site") && label.includes("detail")) ||
        label === "site address" ||
        label === "address"
      ) {
        const siteInfo = [siteName, siteAddress, sitePostcode].filter(Boolean).join("\n");
        prefilled[f.id] = siteInfo || "";
      // Auto-fill customer details
      } else if (
        (label.includes("customer") && label.includes("detail")) ||
        (label.includes("customer") && label.includes("site"))
      ) {
        prefilled[f.id] = customerName;
      } else if (label.includes("customer") && !label.includes("sign") && !label.includes("name")) {
        prefilled[f.id] = customerName;
      } else if (label === "customer name" || label === "customer name:") {
        prefilled[f.id] = customerName;
      } else if (label.includes("po number") || label.includes("reference")) {
        prefilled[f.id] = jobInfo.reference_number || "";
      } else if (label === "date" || label === "date:" || label === "inspection date") {
        prefilled[f.id] = new Date().toISOString().split("T")[0];
      }
    });
    return prefilled;
  };

  const handleStartForm = (template: Template, existingResponse?: Response) => {
    setActiveTemplate(template);
    setViewingResponse(null);
    if (existingResponse) {
      setActiveResponse(existingResponse);
      setFormData(existingResponse.responses as Record<string, any>);
    } else {
      setActiveResponse(null);
      const prefilled = getAutoPopulatedData(template);
      setFormData(prefilled);
    }
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
    const missing = activeTemplate.fields.filter((f) => f.required && !formData[f.id]);
    if (missing.length > 0) {
      toast({
        title: "Required fields missing",
        description: missing.map((f) => f.label).join(", "),
        variant: "destructive",
      });
      return;
    }

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
      toast({ title: "Report submitted" });
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

  const sections = activeTemplate
    ? [...new Set(activeTemplate.fields.map((f) => f.section || "General"))]
    : [];

  // Active form view — inspection sheet style
  if (activeTemplate && !viewingResponse) {
    return (
      <Card>
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> {activeTemplate.name}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => { setActiveTemplate(null); setFormData({}); }}>
              ← Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-y-auto border-t border-border" style={{ maxHeight: "calc(90vh - 200px)" }}>
              {sections.map((section) => (
                <div key={section}>
                  {/* Section header bar */}
                  <div className="bg-muted px-3 py-1.5 border-b border-border">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {section}
                    </span>
                  </div>
                  {/* Fields as table rows */}
                  {activeTemplate.fields
                    .filter((f) => (f.section || "General") === section)
                    .map((field) => (
                      <div key={field.id} className="border-b border-border last:border-b-0">
                        <div className="grid grid-cols-[1fr,1fr]">
                          {/* Label cell */}
                          <div className="px-3 py-2 border-r border-border flex items-start">
                            <Label className="text-xs leading-tight">
                              {field.label}
                              {field.required && <span className="text-destructive ml-0.5">*</span>}
                            </Label>
                          </div>
                          {/* Input cell */}
                          <div className="px-2 py-1.5 flex items-center">
                            {renderFormField(field, formData[field.id], (v) => handleFieldValue(field.id, v))}
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
          <div className="flex gap-2 p-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Draft
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Read-only view — inspection sheet style
  if (viewingResponse && activeTemplate) {
    return (
      <Card>
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> {activeTemplate.name}
              <Badge variant="secondary" className="text-[10px]">{viewingResponse.status}</Badge>
            </CardTitle>
            <div className="flex gap-1.5">
              <JobSheetPdfExport
                template={activeTemplate}
                formData={formData}
                jobInfo={jobInfo}
                jobId={jobId}
                submittedBy={viewingResponse.submitted_by ? profiles[viewingResponse.submitted_by] : undefined}
                submittedAt={viewingResponse.submitted_at}
              />
              <Button variant="ghost" size="sm" onClick={() => { setViewingResponse(null); setActiveTemplate(null); setFormData({}); }}>
                ← Back
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-y-auto border-t border-border" style={{ maxHeight: "calc(90vh - 200px)" }}>
              {sections.map((section) => (
                <div key={section}>
                  <div className="bg-muted px-3 py-1.5 border-b border-border">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {section}
                    </span>
                  </div>
                  {activeTemplate.fields
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
        </CardContent>
      </Card>
    );
  }

  // Main list view
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Job Sheet Templates
            </CardTitle>
            {userRole === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Import Template
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Existing responses */}
          {responses.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Completed Reports</p>
              {responses.map((resp) => {
                const tpl = templates.find((t) => t.id === resp.template_id);
                return (
                  <div
                    key={resp.id}
                    className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {resp.status === "submitted" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      <span className="text-sm">{tpl?.name || "Unknown Template"}</span>
                      <Badge variant="secondary" className="text-[10px] capitalize">{resp.status}</Badge>
                      {resp.submitted_by && profiles[resp.submitted_by] && (
                        <span className="text-[10px] text-muted-foreground">by {profiles[resp.submitted_by]}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {resp.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => tpl && handleStartForm(tpl, resp)}
                        >
                          Continue
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleViewResponse(resp)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Available templates */}
          {templates.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Available Templates</p>
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div>
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{tpl.fields.length} fields</span>
                  </div>
                    <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleStartForm(tpl)}
                    >
                      <ClipboardCheck className="h-3 w-3 mr-1" /> Fill In
                    </Button>
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTemplate(tpl)} title="Edit template">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicateTemplate(tpl)} title="Duplicate template">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {userRole === "admin" && (
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
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No templates yet.{userRole === "admin" ? " Import a template to get started." : " Ask an admin to import a template."}
            </p>
          )}
        </CardContent>
      </Card>

      <ImportTemplateDialog open={importOpen} onOpenChange={setImportOpen} onCreated={fetchData} />
      <EditTemplateDialog open={!!editingTemplate} onOpenChange={(v) => { if (!v) setEditingTemplate(null); }} template={editingTemplate} onSaved={fetchData} />
    </>
  );
}

function renderFormField(
  field: TemplateField,
  value: any,
  onChange: (value: any) => void
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
    case "select":
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-1 w-full">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "photo":
      return <PhotoField value={value} onChange={onChange} fieldId={field.id} />;
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
