import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Plus, GripVertical } from "lucide-react";
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
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
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
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [initialised, setInitialised] = useState(false);

  // Sync state when template changes or dialog opens
  if (open && template && !initialised) {
    setTemplateName(template.name);
    setTemplateDesc(template.description || "");
    setFields(template.fields.map(f => ({ ...f })));
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
    const { error } = await supabase.from("job_sheet_templates").update({
      name: templateName.trim(),
      description: templateDesc.trim() || null,
      fields: fields as any,
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
