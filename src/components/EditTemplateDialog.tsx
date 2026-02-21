import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Plus, GripVertical, Upload, Image as ImageIcon, Undo2 } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  category?: string | null;
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  onSaved: () => void;
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
  const [showOptions, setShowOptions] = useState(false);
  const [newOption, setNewOption] = useState("");

  const isDropdown = field.type === "select";
  const options = field.options || [];

  const addOption = () => {
    if (!newOption.trim()) return;
    onFieldChange(idx, "options", [...options, newOption.trim()]);
    setNewOption("");
  };

  const removeOption = (optIdx: number) => {
    onFieldChange(idx, "options", options.filter((_, i) => i !== optIdx));
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded hover:bg-muted/50 group">
      <div className="flex items-center gap-2 py-1.5 px-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none shrink-0">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
        </button>
        <Input value={field.label} onChange={(e) => onFieldChange(idx, "label", e.target.value)} className="h-7 text-sm flex-1" />
        <select value={field.type} onChange={(e) => onFieldChange(idx, "type", e.target.value)} className="h-7 text-xs border rounded px-1.5 bg-background">
          {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
        </select>
        {isDropdown && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => setShowOptions(!showOptions)}>
            {options.length} opt{options.length !== 1 ? "s" : ""}
          </Button>
        )}
        <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
          <input type="checkbox" checked={field.required} onChange={(e) => onFieldChange(idx, "required", e.target.checked)} />
          Req
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap" title="Allow notes next to this field">
          <input type="checkbox" checked={!!field.allow_notes} onChange={(e) => onFieldChange(idx, "allow_notes", e.target.checked)} />
          Notes
        </label>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onRemove(idx)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {isDropdown && showOptions && (
        <div className="ml-8 mr-2 mb-2 p-2 border rounded bg-background space-y-1.5">
          {options.length === 0 && (
            <p className="text-[10px] text-muted-foreground">No options yet. Add some below.</p>
          )}
          {options.map((opt, optIdx) => (
            <div key={optIdx} className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] gap-1">
                {opt}
                <button type="button" onClick={() => removeOption(optIdx)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-1">
            <Input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
              placeholder="Add option..."
              className="h-6 text-xs flex-1"
            />
            <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={addOption} disabled={!newOption.trim()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditTemplateDialog({ open, onOpenChange, template, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateCategory, setTemplateCategory] = useState<string>("");
  const [jobCategories, setJobCategories] = useState<{ slug: string; name: string }[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companySubtitle, setCompanySubtitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Fetch job categories once
  useEffect(() => {
    supabase.from("job_categories").select("slug, name").order("sort_order").then(({ data }) => {
      if (data) setJobCategories(data);
    });
  }, []);

  // Sync state when template changes or dialog opens
  if (open && template && !initialised) {
    setTemplateName(template.name);
    setTemplateDesc(template.description || "");
    setTemplateCategory(template.category || "");
    setFields(template.fields.map(f => ({ ...f })));
    const b = template.branding || {};
    setCompanyName(b.company_name || "");
    setCompanySubtitle(b.company_subtitle || "");
    setLogoUrl(b.logo_url || "");
    setFooterText(b.footer_text || "");
    setInitialised(true);
  }
  if (!open && initialised) {
    setInitialised(false);
  }

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
        const reordered = arrayMove(prev, oldIndex, newIndex);
        const movedField = reordered[newIndex];
        const neighbour = reordered[newIndex > 0 ? newIndex - 1 : newIndex + 1];
        if (neighbour && neighbour.section !== movedField.section) {
          reordered[newIndex] = { ...movedField, section: neighbour.section };
        }
        return reordered;
      });
    }
  }, []);

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

  const handleLogoUpload = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `template-logos/${template?.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } else {
      const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (data?.signedUrl) setLogoUrl(data.signedUrl);
    }
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    if (!template) return;
    if (!templateName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (fields.length === 0) {
      toast({ title: "No fields", description: "Add at least one field.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const branding = {
      company_name: companyName.trim() || undefined,
      company_subtitle: companySubtitle.trim() || undefined,
      logo_url: logoUrl || undefined,
      footer_text: footerText.trim() || undefined,
    };
    const { error } = await supabase.from("job_sheet_templates").update({
      name: templateName.trim(),
      description: templateDesc.trim() || null,
      category: templateCategory || null,
      fields: fields as any,
      branding: branding as any,
    } as any).eq("id", template.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    } else {
      toast({ title: "Template updated" });
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
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
            <div>
              <Label>Job Category <span className="text-muted-foreground text-xs font-normal">(auto-attach)</span></Label>
              <Select value={templateCategory || "none"} onValueChange={(v) => setTemplateCategory(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {jobCategories.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Company Branding */}
          <div className="border rounded-md p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Company Branding (PDF)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. VIVAFIRE" className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Subtitle</Label>
                <Input value={companySubtitle} onChange={(e) => setCompanySubtitle(e.target.value)} placeholder="e.g. Wet & Dry Riser Specialists" className="h-7 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Footer Declaration</Label>
              <Textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="e.g. We have carried out..." rows={2} className="text-xs min-h-[40px]" />
            </div>
            <div className="flex items-center gap-2">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                {logoUrl ? "Change Logo" : "Upload Logo"}
              </Button>
              {logoUrl && (
                <div className="flex items-center gap-1.5">
                  <img src={logoUrl} alt="Logo" className="h-6 rounded border" />
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setLogoUrl("")}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {!logoUrl && <span className="text-[10px] text-muted-foreground">No logo — will use default</span>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {fields.length} field{fields.length !== 1 ? "s" : ""}
            </p>
            <Button variant="outline" size="sm" onClick={handleAddField}>
              <Plus className="h-3 w-3 mr-1" /> Add Field
            </Button>
          </div>

          <div className="overflow-y-auto border rounded-md" style={{ maxHeight: "calc(90vh - 280px)" }}>
            <div className="p-3 space-y-1">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  {fields.map((field, idx) => {
                    const section = field.section || "General";
                    const prevSection = idx > 0 ? (fields[idx - 1].section || "General") : null;
                    const showHeader = section !== prevSection;
                    return (
                      <div key={field.id}>
                        {showHeader && (
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1 first:mt-0">
                            {section}
                          </p>
                        )}
                        <SortableFieldRow
                          field={field}
                          idx={idx}
                          onFieldChange={handleFieldChange}
                          onRemove={handleRemoveField}
                        />
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!template) return;
                setTemplateName(template.name);
                setTemplateDesc(template.description || "");
                setTemplateCategory(template.category || "");
                setFields(template.fields.map(f => ({ ...f })));
                const b = template.branding || {};
                setCompanyName(b.company_name || "");
                setCompanySubtitle(b.company_subtitle || "");
                setLogoUrl(b.logo_url || "");
                setFooterText(b.footer_text || "");
                toast({ title: "Reverted to saved version" });
              }}
            >
              <Undo2 className="h-4 w-4 mr-1" /> Revert
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
