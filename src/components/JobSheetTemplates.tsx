import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, ClipboardCheck, Send, Loader2, CheckCircle2, Eye,
} from "lucide-react";
import ImportTemplateDialog from "./ImportTemplateDialog";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  placeholder?: string;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  created_at: string;
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

export default function JobSheetTemplates({ jobId }: { jobId: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeResponse, setActiveResponse] = useState<Response | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewingResponse, setViewingResponse] = useState<Response | null>(null);

  const fetchData = async () => {
    const [tplRes, respRes] = await Promise.all([
      supabase.from("job_sheet_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
    ]);
    const tpls = (tplRes.data || []).map((t: any) => ({
      ...t,
      fields: (typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields) as TemplateField[],
    }));
    setTemplates(tpls);
    setResponses((respRes.data || []) as Response[]);

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

  const handleStartForm = (template: Template, existingResponse?: Response) => {
    setActiveTemplate(template);
    setViewingResponse(null);
    if (existingResponse) {
      setActiveResponse(existingResponse);
      setFormData(existingResponse.responses as Record<string, any>);
    } else {
      setActiveResponse(null);
      setFormData({});
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
    // Validate required fields
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

  // Active form view
  if (activeTemplate && !viewingResponse) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> {activeTemplate.name}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => { setActiveTemplate(null); setFormData({}); }}>
              ← Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-4 pr-2">
              {sections.map((section) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {section}
                  </p>
                  <div className="space-y-3">
                    {activeTemplate.fields
                      .filter((f) => (f.section || "General") === section)
                      .map((field) => (
                        <div key={field.id} className="space-y-1">
                          <Label className="text-sm">
                            {field.label}
                            {field.required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                          {renderFormField(field, formData[field.id], (v) => handleFieldValue(field.id, v))}
                        </div>
                      ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex gap-2 mt-4">
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

  // Read-only view of submitted response
  if (viewingResponse && activeTemplate) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> {activeTemplate.name}
              <Badge variant="secondary" className="text-[10px]">{viewingResponse.status}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => { setViewingResponse(null); setActiveTemplate(null); setFormData({}); }}>
              ← Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3 pr-2">
              {sections.map((section) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {section}
                  </p>
                  {activeTemplate.fields
                    .filter((f) => (f.section || "General") === section)
                    .map((field) => (
                      <div key={field.id} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                        <span className="text-sm text-muted-foreground">{field.label}</span>
                        <span className="text-sm font-medium">
                          {field.type === "checkbox"
                            ? (formData[field.id] ? "✓ Yes" : "✗ No")
                            : (formData[field.id] || "—")}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </ScrollArea>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleStartForm(tpl)}
                  >
                    <ClipboardCheck className="h-3 w-3 mr-1" /> Fill In
                  </Button>
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
          className="h-8 text-sm"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className="h-8 text-sm"
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      );
    case "textarea":
      return (
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          rows={3}
          className="text-sm"
        />
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-sm text-muted-foreground">Yes</span>
        </div>
      );
    case "select":
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-sm">
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
      return (
        <div className="text-xs text-muted-foreground italic">
          Photo capture — coming soon
        </div>
      );
    default:
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      );
  }
}
