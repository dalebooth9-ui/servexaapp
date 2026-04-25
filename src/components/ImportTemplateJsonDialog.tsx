import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileJson } from "lucide-react";
import {
  parseTemplateJson,
  type ExportableTemplate,
} from "@/lib/templateJson";

type ExistingTemplate = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

type Mode = "create" | "update";

export default function ImportTemplateJsonDialog({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ExportableTemplate | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [existing, setExisting] = useState<ExistingTemplate[]>([]);
  const [mode, setMode] = useState<Mode>("create");
  const [targetId, setTargetId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("job_sheet_templates")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setExisting((data || []) as ExistingTemplate[]));
  }, [open]);

  const reset = () => {
    setParsed(null);
    setFileName("");
    setMode("create");
    setTargetId("");
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const matchingByName = useMemo(() => {
    if (!parsed) return null;
    return existing.find((e) => e.name.trim().toLowerCase() === parsed.name.trim().toLowerCase()) || null;
  }, [parsed, existing]);

  const matchingById = useMemo(() => {
    if (!parsed?.id) return null;
    return existing.find((e) => e.id === parsed.id) || null;
  }, [parsed, existing]);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const { template } = parseTemplateJson(text);
      setParsed(template);
      setFileName(file.name);
      const auto = (template.id && existing.find((e) => e.id === template.id))
        || existing.find((e) => e.name.trim().toLowerCase() === template.name.trim().toLowerCase());
      if (auto) {
        setMode("update");
        setTargetId(auto.id);
      } else {
        setMode("create");
        setTargetId("");
      }
    } catch (err: any) {
      toast({ title: "Couldn't read file", description: err.message, variant: "destructive" });
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const payload: any = {
        name: parsed.name,
        description: parsed.description ?? null,
        fields: parsed.fields as any,
        branding: parsed.branding ?? null,
        status: parsed.status ?? "published",
        locked: !!parsed.locked,
      };
      if (parsed.category) payload.category = parsed.category;
      if (parsed.job_category) payload.job_category = parsed.job_category;

      if (mode === "update") {
        if (!targetId) {
          toast({ title: "Pick a template to update", variant: "destructive" });
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("job_sheet_templates")
          .update(payload)
          .eq("id", targetId);
        if (error) throw error;
        toast({ title: "Template updated", description: `Replaced fields on "${parsed.name}".` });
      } else {
        const { error } = await supabase
          .from("job_sheet_templates")
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast({ title: "Template imported", description: `Created "${parsed.name}".` });
      }
      onImported();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message || String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-4 w-4" /> Import template from JSON
          </DialogTitle>
          <DialogDescription>
            Upload a <code>.json</code> file exported from another environment. You can create a new template or replace the fields on an existing one.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onPick}
        />

        {!parsed ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6 border border-dashed rounded-md">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Choose JSON file
            </Button>
            <p className="text-xs text-muted-foreground">Accepts files exported from Servexa.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{parsed.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {parsed.fields.length} field{parsed.fields.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              {parsed.description && (
                <p className="text-xs text-muted-foreground">{parsed.description}</p>
              )}
              <p className="text-[11px] text-muted-foreground">From <span className="font-mono">{fileName}</span></p>
              {(matchingById || matchingByName) && (
                <p className="text-[11px] text-amber-600">
                  Matches existing template{matchingById ? " (by ID)" : " (by name)"}.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">What should we do?</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-2 space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="create" id="imp-create" className="mt-1" />
                  <span>
                    <span className="font-medium">Create new template</span>
                    <span className="block text-xs text-muted-foreground">Adds a brand new template using this definition.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="update" id="imp-update" className="mt-1" />
                  <span className="flex-1">
                    <span className="font-medium">Update existing template</span>
                    <span className="block text-xs text-muted-foreground">Replaces fields, branding, name and description.</span>
                  </span>
                </label>
              </RadioGroup>

              {mode === "update" && (
                <div className="mt-3">
                  <Label className="text-xs">Target template</Label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                  >
                    <option value="">Select a template…</option>
                    {existing.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          {parsed && (
            <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>Choose different file</Button>
          )}
          <Button onClick={handleSave} disabled={!parsed || saving || (mode === "update" && !targetId)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {mode === "update" ? "Update template" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
