import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, AlertTriangle, FileText, Sparkles, CheckCircle2 } from "lucide-react";

export type ImportedDraftInfo = {
  id: string;
  name: string;
  description: string | null;
  fields: any[];
  category: string | null;
  job_category: string | null;
  branding: Record<string, any>;
  footer_text: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the imported draft is created. If the parent provides a
   * handler that accepts a draft, it can open the existing template editor
   * immediately. If it accepts no argument, it should refetch its template
   * list.
   */
  onCreated: (draft?: ImportedDraftInfo) => void;
};

const MAX_BYTES = 20 * 1024 * 1024;

type Field = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  section?: string;
  options?: string[];
  placeholder?: string;
};

function sanitiseFields(raw: any[]): Field[] {
  const used = new Set<string>();
  return raw
    .filter((f) => f && typeof f === "object")
    .map((f, i) => {
      let id = String(f.id || f.label || `field_${i + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64) || `field_${i + 1}`;
      let unique = id;
      let n = 2;
      while (used.has(unique)) unique = `${id}_${n++}`;
      used.add(unique);
      const type = String(f.type || "text").toLowerCase();
      const allowed = new Set([
        "text", "number", "date", "checkbox", "pass_fail",
        "select", "textarea", "photo", "signature",
      ]);
      return {
        id: unique,
        label: String(f.label || `Field ${i + 1}`).slice(0, 200),
        type: allowed.has(type) ? type : "text",
        required: !!f.required,
        section: (f.section && String(f.section).trim()) || "General",
        options: Array.isArray(f.options) ? f.options.map(String) : undefined,
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
      };
    });
}

function buildFallbackFields(rawText: string, fileName: string): Field[] {
  const trimmed = (rawText || "").trim();
  const preview = trimmed.slice(0, 8000);
  return [
    {
      id: "imported_content",
      label: `Imported content from ${fileName}`,
      type: "textarea",
      required: false,
      section: "Imported document",
      placeholder: preview || "Add your form fields here — this template was imported without recognisable structure.",
    },
  ];
}

export default function ImportTemplateDialog({ open, onOpenChange, onCreated }: Props) {
  const { user, orgId } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<"idle" | "uploading" | "converting" | "saving" | "done">("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase("idle");
    setFileName("");
    setError(null);
  };

  const handleFile = async (file: File) => {
    setError(null);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".docx", ".pdf"].includes(ext)) {
      setError("Only .docx (recommended) and .pdf are supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File is larger than 20 MB. Please upload a smaller document.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }

    setFileName(file.name);
    setPhase("uploading");

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || "");
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      setPhase("converting");
      const { data, error: fnError } = await supabase.functions.invoke("parse-template-document", {
        body: { file_base64: base64, file_name: file.name },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const rawFields = Array.isArray(data?.fields) ? data.fields : [];
      const rawText: string = typeof data?.raw_text === "string" ? data.raw_text : "";
      let fields = sanitiseFields(rawFields);
      let usedFallback = false;
      if (fields.length === 0) {
        fields = buildFallbackFields(rawText, file.name);
        usedFallback = true;
      }

      setPhase("saving");
      const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Imported template";
      const importedAt = new Date().toISOString();
      const insertRow: Record<string, any> = {
        name: baseName,
        description: `Imported from ${file.name}`,
        fields: fields as any,
        created_by: user.id,
        status: "draft",
        branding: {
          imported: {
            source_file: file.name,
            imported_at: importedAt,
            used_fallback: usedFallback,
          },
        },
      };
      // Set org_id explicitly for tenant orgs so RLS accepts the write.
      // Platform-admin (Viva) global templates keep org_id NULL.
      if (orgId) insertRow.org_id = orgId;

      const { data: created, error: insertError } = await supabase
        .from("job_sheet_templates")
        .insert(insertRow as any)
        .select("id, name, description, fields, category, job_category, branding, footer_text")
        .single();

      if (insertError || !created) {
        throw new Error(insertError?.message || "Could not save the imported template.");
      }

      setPhase("done");
      toast({
        title: usedFallback ? "Imported as blank draft" : "Template imported",
        description: usedFallback
          ? "We couldn't detect form fields — a starter draft is open for you to shape."
          : `Extracted ${fields.length} field${fields.length === 1 ? "" : "s"}. Review and save the draft.`,
      });

      const draft: ImportedDraftInfo = {
        id: (created as any).id,
        name: (created as any).name,
        description: (created as any).description ?? null,
        fields: (created as any).fields ?? fields,
        category: (created as any).category ?? null,
        job_category: (created as any).job_category ?? null,
        branding: (created as any).branding ?? {},
        footer_text: (created as any).footer_text ?? null,
      };

      onCreated(draft);
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error("Template import failed:", err);
      setError(err?.message || "Something went wrong while importing.");
      setPhase("idle");
    }
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected after an error.
    e.target.value = "";
  };

  const isBusy = phase === "uploading" || phase === "converting" || phase === "saving";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isBusy) return; // don't allow closing mid-import
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Import from document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload an existing form and we'll convert it into a <strong>draft template</strong> in your organisation.
            You'll be dropped straight into the editor to tidy up field types and add sections before publishing.
          </p>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p><strong>.docx</strong> gives the best results (headings, tables and Yes/No patterns are detected).</p>
              <p><strong>.pdf</strong> is accepted but the conversion will be rougher — expect to spend more time editing the draft.</p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf"
            className="hidden"
            onChange={onSelectFile}
          />

          {phase === "idle" && (
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={!user}
            >
              <Upload className="h-4 w-4" />
              Choose a .docx or .pdf
            </Button>
          )}

          {phase !== "idle" && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="truncate font-medium">{fileName || "document"}</span>
              </div>
              <ol className="space-y-1.5 text-sm">
                <StepRow label="Uploading document" done={phase !== "uploading"} active={phase === "uploading"} />
                <StepRow label="Converting with AI (this can take ~20s)" done={phase === "saving" || phase === "done"} active={phase === "converting"} />
                <StepRow label="Saving draft template" done={phase === "done"} active={phase === "saving"} />
              </ol>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive border border-destructive/40 rounded-md p-2">
              {error}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Max 20 MB. Imported drafts are private to your organisation and never auto-published.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-primary" />
      ) : active ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
      )}
      <span className={done ? "text-muted-foreground line-through" : active ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </li>
  );
}
