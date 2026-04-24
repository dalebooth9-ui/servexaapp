import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Pencil, FileText } from "lucide-react";
import EditTemplateDialog from "./EditTemplateDialog";
import BlankTemplatePdfExport from "./BlankTemplatePdfExport";
import BlankTemplateWordExport from "./BlankTemplateWordExport";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  allow_notes?: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  category?: string | null;
  branding?: Record<string, any>;
};

export default function RamsTemplateSettings() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [template, setTemplate] = useState<Template | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTemplate = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("job_sheet_templates")
      .select("*")
      .eq("category", "rams")
      .limit(1)
      .maybeSingle();

    if (data) {
      setTemplate({
        ...data,
        fields: (typeof data.fields === "string" ? JSON.parse(data.fields) : data.fields) as TemplateField[],
        branding: (data.branding as Record<string, any>) || {},
      });
    }
    setLoading(false);
  };

  useEffect(() => { fetchTemplate(); }, []);

  if (userRole !== "admin") return null;

  // Group fields by section
  const sections = template
    ? [...new Set(template.fields.map((f) => f.section || "General"))]
    : [];

  const FIELD_TYPE_LABELS: Record<string, string> = {
    text: "Short Text", number: "Number", date: "Date",
    checkbox: "Checkbox", pass_fail: "Pass/Fail", select: "Dropdown",
    textarea: "Long Text", photo: "Photo", signature: "Signature",
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">RAMS Template</CardTitle>
                <CardDescription className="mt-0.5">
                  Risk Assessment &amp; Method Statement fields auto-attached to dry riser jobs.
                </CardDescription>
              </div>
            </div>
            {template && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Fields
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !template ? (
            <p className="text-sm text-muted-foreground">No RAMS template found.</p>
          ) : (
            <div className="space-y-4">
              {sections.map((section) => {
                const sectionFields = template.fields.filter(
                  (f) => (f.section || "General") === section
                );
                return (
                  <div key={section}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section}
                    </p>
                    <div className="rounded-md border divide-y">
                      {sectionFields.map((field) => (
                        <div key={field.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="text-sm truncate">{field.label}</span>
                            {field.required && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Required</Badge>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                            {FIELD_TYPE_LABELS[field.type] || field.type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-1">
                These fields are auto-populated from job details (client name, dates, contract name) when a dry riser job is created.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <EditTemplateDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        template={template}
        onSaved={() => { fetchTemplate(); toast({ title: "RAMS template updated" }); }}
      />
    </>
  );
}
