import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, X, Plus, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TemplateField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "checkbox" | "select" | "textarea" | "photo";
  required: boolean;
  section: string;
  options?: string[];
  placeholder?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Short Text",
  number: "Number",
  date: "Date",
  checkbox: "Checkbox",
  pass_fail: "Pass/Fail",
  select: "Dropdown",
  textarea: "Long Text",
  photo: "Photo",
};

function SortableFieldRow({ field, idx, onFieldChange, onRemove }: {
  field: TemplateField;
  idx: number;
  onFieldChange: (idx: number, key: keyof TemplateField, value: any) => void;
  onRemove: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group">
      <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none shrink-0">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
      </button>
      <Input value={field.label} onChange={(e) => onFieldChange(idx, "label", e.target.value)} className="h-7 text-sm flex-1" />
      <select value={field.type} onChange={(e) => onFieldChange(idx, "type", e.target.value)} className="h-7 text-xs border rounded px-1.5 bg-background">
        {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
      </select>
      <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
        <input type="checkbox" checked={field.required} onChange={(e) => onFieldChange(idx, "required", e.target.checked)} />
        Req
      </label>
      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onRemove(idx)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function ImportTemplateDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [fileName, setFileName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  const resetState = () => {
    setStep("upload");
    setParsing(false);
    setSaving(false);
    setTemplateName("");
    setTemplateDesc("");
    setFields([]);
    setFileName("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".docx", ".doc"].includes(ext)) {
      toast({ title: "Unsupported file", description: "Please upload a PDF or Word document.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 20MB.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setTemplateName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setParsing(true);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("parse-template-document", {
        body: { file_base64: base64, file_name: file.name },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const parsed = (data.fields || []) as TemplateField[];
      if (parsed.length === 0) {
        toast({ title: "No fields found", description: "AI couldn't extract form fields from this document.", variant: "destructive" });
        setParsing(false);
        return;
      }

      setFields(parsed);
      setStep("review");
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message || "Could not parse document.", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handleRemoveField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFieldChange = (idx: number, key: keyof TemplateField, value: any) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  };

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `custom_field_${Date.now()}`,
        label: "New Field",
        type: "text",
        required: false,
        section: prev.length > 0 ? prev[prev.length - 1].section : "General",
      },
    ]);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (fields.length === 0) {
      toast({ title: "No fields", description: "Add at least one field.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("job_sheet_templates").insert({
      name: templateName.trim(),
      description: templateDesc.trim() || null,
      fields: fields as any,
      created_by: user?.id,
    } as any);

    if (error) {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    } else {
      toast({ title: "Template saved" });
      onCreated();
      onOpenChange(false);
      resetState();
    }
    setSaving(false);
  };

  

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" ? "Import Job Sheet Template" : "Review & Edit Template Fields"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload a PDF or Word document containing your job sheet or report template.
                AI will extract the form fields for engineers to complete on-site.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="gap-2"
            >
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing {fileName}...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Choose File
                </>
              )}
            </Button>
            {parsing && (
              <p className="text-xs text-muted-foreground">
                AI is extracting form fields from your document...
              </p>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Gas Safety Inspection"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="Brief description"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {fields.length} field{fields.length !== 1 ? "s" : ""} extracted from <span className="font-medium">{fileName}</span>
              </p>
              <Button variant="outline" size="sm" onClick={handleAddField}>
                <Plus className="h-3 w-3 mr-1" /> Add Field
              </Button>
            </div>

            <div className="overflow-y-auto border rounded-md" style={{ maxHeight: "calc(90vh - 280px)" }}>
              <div className="p-3 space-y-1">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, idx) => (
                      <SortableFieldRow
                        key={field.id}
                        field={field}
                        idx={idx}
                        onFieldChange={handleFieldChange}
                        onRemove={handleRemoveField}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { resetState(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Template
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
