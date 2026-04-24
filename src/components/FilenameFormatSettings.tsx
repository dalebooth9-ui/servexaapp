import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FilenameConfig {
  template: string;
  separator: string;
}

export const DEFAULT_FILENAME_CONFIG: FilenameConfig = {
  template: "{type} - {reference} - {customer}",
  separator: " - ",
};

export const FILENAME_TOKENS = [
  { token: "{type}", desc: "Document type (Photo / Document)" },
  { token: "{reference}", desc: "Job reference number (e.g. VFP-00123)" },
  { token: "{job_name}", desc: "Job name / description" },
  { token: "{customer}", desc: "Customer name" },
  { token: "{date}", desc: "Today's date (YYYY-MM-DD)" },
  { token: "{engineer}", desc: "Engineer's full name" },
];

const PRESETS: { label: string; value: string }[] = [
  { label: "Type - Reference - Customer", value: "{type} - {reference} - {customer}" },
  { label: "Reference - Type - Customer", value: "{reference} - {type} - {customer}" },
  { label: "Customer - Reference - Type", value: "{customer} - {reference} - {type}" },
  { label: "Job name - Type - Date", value: "{job_name} - {type} - {date}" },
];

export default function FilenameFormatSettings() {
  const [config, setConfig] = useState<FilenameConfig>(DEFAULT_FILENAME_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "filename_format")
        .maybeSingle();
      if (data?.value) {
        const v = data.value as Partial<FilenameConfig>;
        setConfig({
          template: v.template || DEFAULT_FILENAME_CONFIG.template,
          separator: v.separator || DEFAULT_FILENAME_CONFIG.separator,
        });
      }
      setLoaded(true);
    })();
  }, []);

  const previewName = (() => {
    const sample: Record<string, string> = {
      "{type}": "Photo",
      "{reference}": "VFP-00123",
      "{job_name}": "Annual Dry Riser Service",
      "{customer}": "Acme Property Ltd",
      "{date}": new Date().toISOString().slice(0, 10),
      "{engineer}": "John Smith",
    };
    let out = config.template;
    Object.entries(sample).forEach(([k, v]) => { out = out.split(k).join(v); });
    return `${out.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.jpg`;
  })();

  const handleSave = async () => {
    if (!config.template.trim()) {
      toast.error("Template cannot be empty");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "filename_format", value: config as any }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Filename format saved");
    }
  };

  if (!loaded) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> Filename Format
        </CardTitle>
        <CardDescription>
          Choose how files uploaded via WhatsApp (and other automated sources) are named. Applies workspace-wide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Quick presets</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={config.template === p.value ? "default" : "outline"}
                onClick={() => setConfig({ ...config, template: p.value })}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="template">Template</Label>
          <Input
            id="template"
            value={config.template}
            onChange={(e) => setConfig({ ...config, template: e.target.value })}
            placeholder="{type} - {reference} - {customer}"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {FILENAME_TOKENS.map((t) => (
              <Badge
                key={t.token}
                variant="secondary"
                className="cursor-pointer text-xs"
                title={t.desc}
                onClick={() =>
                  setConfig({ ...config, template: (config.template + " " + t.token).trim() })
                }
              >
                {t.token}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Click a token to append it. Empty values are skipped automatically.</p>
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-1">Preview</p>
          <p className="font-mono text-sm">{previewName}</p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save format
        </Button>
      </CardContent>
    </Card>
  );
}
