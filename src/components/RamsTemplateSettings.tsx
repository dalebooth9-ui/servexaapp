import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Pencil, FileText, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

  const [error, setError] = useState<string | null>(null);

  const fetchTemplate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from("job_sheet_templates")
        .select("*")
        .eq("category", "rams")
        .limit(1)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (data) {
        setTemplate({
          ...data,
          fields: (typeof data.fields === "string" ? JSON.parse(data.fields) : data.fields) as TemplateField[],
          branding: (data.branding as Record<string, any>) || {},
        });
      } else {
        setTemplate(null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load RAMS template.");
    } finally {
      setLoading(false);
    }
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
              <div className="flex items-center gap-1.5">
                <BlankTemplatePdfExport
                  template={{
                    id: template.id,
                    name: template.name,
                    description: template.description,
                    fields: template.fields as any,
                    branding: (template.branding as any) || {},
                  }}
                  jobInfo={null}
                  showPrint
                />
                <BlankTemplateWordExport
                  template={{
                    name: template.name,
                    description: template.description || undefined,
                    fields: template.fields as any,
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Fields
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <Skeleton className="h-3 w-32" />
              <div className="rounded-md border divide-y">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn’t load RAMS template</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{error}</span>
                <Button size="sm" variant="outline" onClick={fetchTemplate}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : !template ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <Shield className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No RAMS template found</p>
              <p className="text-xs text-muted-foreground mt-1">
                A RAMS template will appear here once it’s created.
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={fetchTemplate}>
                Refresh
              </Button>
            </div>
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
