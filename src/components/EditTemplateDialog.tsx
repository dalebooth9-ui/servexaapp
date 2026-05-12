import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Plus, GripVertical, Upload, Image as ImageIcon, Undo2, Settings2, List, Send, FileEdit, Eye, RefreshCw, PenLine } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { resolveFooterText } from "@/lib/pdfFooter";
import { runTemplateQa, summariseQa } from "@/lib/templateQa";
import { AlertTriangle } from "lucide-react";
import BlankTemplatePdfExport, { type BlankTemplatePdfExportHandle } from "@/components/BlankTemplatePdfExport";

type TemplateField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  section: string;
  options?: string[];
  placeholder?: string;
  allow_notes?: boolean;
  allow_na?: boolean;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  category?: string | null;
  status?: "draft" | "published" | string | null;
  branding?: {
    company_name?: string;
    company_subtitle?: string;
    logo_url?: string;
    footer_text?: string;
    declaration_text?: string;
    header_logo_max_height_px?: number;
    header_logo_spacing_after_pt?: number;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  onSaved: (updatedTemplate?: Template) => void;
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
  signature: "Signature",
};

function SortableFieldRow({ field, idx, onFieldChange, onRemove, onSectionChange, allSections }: {
  field: TemplateField;
  idx: number;
  onFieldChange: (idx: number, key: keyof TemplateField, value: any) => void;
  onRemove: (idx: number) => void;
  onSectionChange: (idx: number, section: string) => void;
  allSections: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [showOptions, setShowOptions] = useState(false);
  const [editingSection, setEditingSection] = useState(false);
  const [sectionInput, setSectionInput] = useState(field.section || "General");
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

  const commitSection = () => {
    const val = sectionInput.trim() || "General";
    onSectionChange(idx, val);
    setEditingSection(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-card hover:bg-muted/30 group mb-1.5">
      <div className="flex items-start gap-2 py-2 px-2">
        {/* Drag handle */}
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none shrink-0 mt-1.5">
          <GripVertical className="h-4 w-4 text-muted-foreground/40" />
        </button>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {/* Row 1: label + type */}
          <div className="flex items-center gap-2">
            <Input
              value={field.label}
              onChange={(e) => onFieldChange(idx, "label", e.target.value)}
              className="h-7 text-sm flex-1 min-w-0"
              placeholder="Field label"
            />
            <select
              value={field.type}
              onChange={(e) => onFieldChange(idx, "type", e.target.value)}
              className="h-7 text-xs border rounded px-1.5 bg-background shrink-0 max-w-[110px]"
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Row 2: section + flags */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Section badge / edit */}
            <div className="flex items-center gap-1">
              {editingSection ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={sectionInput}
                    onChange={(e) => setSectionInput(e.target.value)}
                    onBlur={commitSection}
                    onKeyDown={(e) => { if (e.key === "Enter") commitSection(); if (e.key === "Escape") setEditingSection(false); }}
                    className="h-5 text-[10px] w-24 px-1.5"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground border rounded px-1 hover:bg-muted"
                    onMouseDown={(e) => { e.preventDefault(); commitSection(); }}
                  >✓</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setSectionInput(field.section || "General"); setEditingSection(true); }}
                  className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 hover:bg-muted flex items-center gap-1 leading-none"
                  title="Click to change section"
                >
                  §&nbsp;{field.section || "General"}
                </button>
              )}
            </div>

            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={field.required} onChange={(e) => onFieldChange(idx, "required", e.target.checked)} className="h-3 w-3" />
              Required
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none" title="Allow notes field alongside this">
              <input type="checkbox" checked={!!field.allow_notes} onChange={(e) => onFieldChange(idx, "allow_notes", e.target.checked)} className="h-3 w-3" />
              Notes
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none" title="Show an N/A option alongside YES/NO on this field">
              <input type="checkbox" checked={!!field.allow_na} onChange={(e) => onFieldChange(idx, "allow_na", e.target.checked)} className="h-3 w-3" />
              N/A
            </label>
            {isDropdown && (
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="text-[10px] text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10 leading-none"
              >
                {options.length} option{options.length !== 1 ? "s" : ""} {showOptions ? "▲" : "▼"}
              </button>
            )}
          </div>
        </div>

        {/* Delete */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 mt-0.5"
          onClick={() => onRemove(idx)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {isDropdown && showOptions && (
        <div className="mx-3 mb-2 p-2 border rounded bg-muted/30 space-y-1.5">
          {options.length === 0 && (
            <p className="text-[10px] text-muted-foreground">No options yet. Add some below.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt, optIdx) => (
              <Badge key={optIdx} variant="secondary" className="text-[10px] gap-1">
                {opt}
                <button type="button" onClick={() => removeOption(optIdx)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
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
  const [jobCategory, setJobCategory] = useState<string>("");
  const [jobCategories, setJobCategories] = useState<{ slug: string; name: string }[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companySubtitle, setCompanySubtitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [declarationText, setDeclarationText] = useState("");
  // Per-template Word/PDF header logo tuning. Stored as strings so the user
  // can clear the field to fall back to the built-in defaults (100px / 0pt).
  const [headerLogoMaxH, setHeaderLogoMaxH] = useState("");
  const [headerLogoSpacingAfter, setHeaderLogoSpacingAfter] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Live PDF preview state ───────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHandfill, setPreviewHandfill] = useState(false);
  const [previewBuilding, setPreviewBuilding] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const pdfExportRef = useRef<BlankTemplatePdfExportHandle>(null);
  // Bumped on every relevant edit; the debounced effect below rebuilds the PDF.
  const [previewVersion, setPreviewVersion] = useState(0);

  // Build a "live" template object from the current dialog state so the
  // preview reflects unsaved edits.
  const livePreviewTemplate = useMemo(
    () => ({
      id: template?.id || "preview",
      name: templateName || (template?.name ?? "Untitled template"),
      description: templateDesc || null,
      fields: fields as any,
      footer_text: footerText || null,
      branding: {
        company_name: companyName || undefined,
        company_subtitle: companySubtitle || undefined,
        logo_url: logoUrl || undefined,
        footer_text: footerText || undefined,
        declaration_text: declarationText || undefined,
        header_logo_max_height_px:
          headerLogoMaxH.trim() && Number.isFinite(Number(headerLogoMaxH))
            ? Number(headerLogoMaxH)
            : undefined,
        header_logo_spacing_after_pt:
          headerLogoSpacingAfter.trim() && Number.isFinite(Number(headerLogoSpacingAfter))
            ? Number(headerLogoSpacingAfter)
            : undefined,
      },
    }),
    [template?.id, template?.name, templateName, templateDesc, fields, footerText, companyName, companySubtitle, logoUrl, declarationText, headerLogoMaxH, headerLogoSpacingAfter]
  );

  useEffect(() => {
    supabase.from("job_categories").select("slug, name").order("sort_order").then(({ data }) => {
      if (data) setJobCategories(data);
    });
  }, []);

  // Debounce: bump previewVersion shortly after edits settle, so we don't
  // rebuild the PDF on every keystroke.
  useEffect(() => {
    if (!previewOpen) return;
    const t = setTimeout(() => setPreviewVersion((v) => v + 1), 500);
    return () => clearTimeout(t);
  }, [previewOpen, livePreviewTemplate, previewHandfill]);

  // Rebuild the PDF whenever previewVersion changes.
  useEffect(() => {
    if (!previewOpen) return;
    if (!pdfExportRef.current) return;
    let cancelled = false;
    let prevUrl: string | null = null;
    setPreviewBuilding(true);
    setPreviewError(null);
    (async () => {
      try {
        const blob = await pdfExportRef.current!.getBlob({ handfill: previewHandfill });
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((old) => {
          prevUrl = old;
          return url;
        });
      } catch (err: any) {
        if (!cancelled) setPreviewError(err?.message || "Failed to build preview");
      } finally {
        if (!cancelled) setPreviewBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
      // Revoke the previous blob URL once the new one has replaced it.
      if (prevUrl) setTimeout(() => URL.revokeObjectURL(prevUrl!), 100);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersion, previewOpen]);

  // Clean up blob URL on close/unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When dialog closes, drop the preview state.
  useEffect(() => {
    if (!open) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPreviewOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (open && template && !initialised) {
    setTemplateName(template.name);
    setTemplateDesc(template.description || "");
    setTemplateCategory(template.category || "");
    setJobCategory((template as any).job_category || "");
    setFields(template.fields.map(f => ({ ...f })));
    const b = template.branding || {};
    setCompanyName(b.company_name || "");
    setCompanySubtitle(b.company_subtitle || "");
    setLogoUrl(b.logo_url || "");
    setFooterText((template as any).footer_text ?? b.footer_text ?? "");
    setDeclarationText(b.declaration_text ?? "");
    setHeaderLogoMaxH(
      typeof b.header_logo_max_height_px === "number" ? String(b.header_logo_max_height_px) : "",
    );
    setHeaderLogoSpacingAfter(
      typeof b.header_logo_spacing_after_pt === "number" ? String(b.header_logo_spacing_after_pt) : "",
    );
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
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  const handleRemoveField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFieldChange = (idx: number, key: keyof TemplateField, value: any) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  };

  const handleSectionChange = (idx: number, section: string) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, section } : f)));
  };

  const handleAddField = () => {
    const lastSection = fields.length > 0 ? fields[fields.length - 1].section || "General" : "General";
    setFields((prev) => [
      ...prev,
      { id: `custom_field_${Date.now()}`, label: "New Field", type: "text", required: false, section: lastSection },
    ]);
  };

  const allSections = [...new Set(fields.map(f => f.section || "General"))];

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

  const handleRevert = () => {
    if (!template) return;
    setTemplateName(template.name);
    setTemplateDesc(template.description || "");
    setTemplateCategory(template.category || "");
    setJobCategory((template as any).job_category || "");
    setFields(template.fields.map(f => ({ ...f })));
    const b = template.branding || {};
    setCompanyName(b.company_name || "");
    setCompanySubtitle(b.company_subtitle || "");
    setLogoUrl(b.logo_url || "");
    setFooterText((template as any).footer_text ?? b.footer_text ?? "");
    setDeclarationText(b.declaration_text ?? "");
    setHeaderLogoMaxH(
      typeof b.header_logo_max_height_px === "number" ? String(b.header_logo_max_height_px) : "",
    );
    setHeaderLogoSpacingAfter(
      typeof b.header_logo_spacing_after_pt === "number" ? String(b.header_logo_spacing_after_pt) : "",
    );
    toast({ title: "Reverted to saved version" });
  };

  const [qaOverride, setQaOverride] = useState(false);
  const qaReport = runTemplateQa(fields as any);

  const handleSave = async (targetStatus: "draft" | "published") => {
    if (!template) return;
    if (!templateName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (fields.length === 0) {
      toast({ title: "No fields", description: "Add at least one field.", variant: "destructive" });
      return;
    }

    // QA gate — block PUBLISH on errors unless explicitly overridden.
    // Drafts are allowed to save with QA issues so users can park work-in-progress.
    if (targetStatus === "published" && !qaReport.ok && !qaOverride) {
      toast({
        title: "Layout doesn't match reference style",
        description: `${qaReport.errors.length} blocking issue${qaReport.errors.length === 1 ? "" : "s"}. Save as Draft, fix the issues, or tick "Save anyway".`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const branding = {
      company_name: companyName.trim() || undefined,
      company_subtitle: companySubtitle.trim() || undefined,
      logo_url: logoUrl || undefined,
      footer_text: footerText.trim() || undefined,
      declaration_text: declarationText.trim() || undefined,
      header_logo_max_height_px:
        headerLogoMaxH.trim() && Number.isFinite(Number(headerLogoMaxH))
          ? Math.min(400, Math.max(20, Number(headerLogoMaxH)))
          : undefined,
      header_logo_spacing_after_pt:
        headerLogoSpacingAfter.trim() && Number.isFinite(Number(headerLogoSpacingAfter))
          ? Math.min(72, Math.max(0, Number(headerLogoSpacingAfter)))
          : undefined,
    };
    const { error } = await supabase.from("job_sheet_templates").update({
      name: templateName.trim(),
      description: templateDesc.trim() || null,
      category: templateCategory || null,
      job_category: jobCategory || null,
      fields: fields as any,
      branding: branding as any,
      footer_text: footerText.trim() || null,
      status: targetStatus,
    } as any).eq("id", template.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    } else {
      const updatedTemplate: Template = {
        ...(template as Template),
        name: templateName.trim(),
        description: templateDesc.trim() || null,
        category: templateCategory || null,
        status: targetStatus,
        fields: fields.map((field) => ({ ...field })),
        branding,
      };
      toast({
        title: targetStatus === "published" ? "Template published" : "Draft saved",
        description: targetStatus === "published"
          ? "New jobs will use this version."
          : "Not visible to new jobs until you publish.",
      });
      onSaved(updatedTemplate);
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${previewOpen ? "max-w-6xl" : "max-w-2xl"} flex flex-col transition-[max-width] duration-200`}
        style={{ height: "min(90vh, 820px)" }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Edit Template
            {templateName && <span className="text-sm font-normal text-muted-foreground truncate">— {templateName}</span>}
            <Button
              type="button"
              variant={previewOpen ? "default" : "outline"}
              size="sm"
              className="ml-auto h-7 text-xs gap-1.5"
              onClick={() => setPreviewOpen((v) => !v)}
              title={previewOpen ? "Hide live PDF preview" : "Show live PDF preview"}
            >
              <Eye className="h-3.5 w-3.5" />
              {previewOpen ? "Hide preview" : "Preview printed PDF"}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Editor + (optional) live preview, side-by-side */}
        <div className="flex flex-1 min-h-0 gap-3">
        {/* ─── LEFT: editor ─── */}
        <div className={`flex flex-col min-h-0 ${previewOpen ? "w-1/2 min-w-[420px]" : "flex-1"}`}>
        <Tabs defaultValue="fields" className="flex flex-col flex-1 min-h-0">
          <TabsList className="shrink-0 w-full grid grid-cols-2">
            <TabsTrigger value="fields" className="gap-1.5">
              <List className="h-3.5 w-3.5" /> Fields <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{fields.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Settings & Branding
            </TabsTrigger>
          </TabsList>

          {/* ── FIELDS TAB ── */}
          <TabsContent value="fields" className="flex flex-col flex-1 min-h-0 mt-3 gap-2 data-[state=inactive]:hidden">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-xs text-muted-foreground">
                Drag to reorder · Click section badge to rename · Req = required
              </p>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAddField}>
                <Plus className="h-3 w-3" /> Add Field
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-md p-2 min-h-0">
              {fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                  <List className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No fields yet</p>
                  <Button variant="outline" size="sm" onClick={handleAddField}>
                    <Plus className="h-3 w-3 mr-1" /> Add your first field
                  </Button>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, idx) => {
                      const section = field.section || "General";
                      const prevSection = idx > 0 ? (fields[idx - 1].section || "General") : null;
                      const showHeader = section !== prevSection;
                      return (
                        <div key={field.id}>
                          {showHeader && (
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1 px-1 first:mt-0">
                              {section}
                            </p>
                          )}
                          <SortableFieldRow
                            field={field}
                            idx={idx}
                            onFieldChange={handleFieldChange}
                            onRemove={handleRemoveField}
                            onSectionChange={handleSectionChange}
                            allSections={allSections}
                          />
                        </div>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </TabsContent>

          {/* ── SETTINGS TAB ── */}
          <TabsContent value="settings" className="flex-1 overflow-y-auto mt-3 min-h-0 data-[state=inactive]:hidden">
            <div className="space-y-4 pb-2">
              {/* Basic Info */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Template Info</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Template Name</Label>
                    <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Gas Safety Inspection" />
                  </div>
                  <div>
                    <Label className="text-xs">Description (optional)</Label>
                    <Input value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} placeholder="Brief description" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Template Type <span className="text-muted-foreground font-normal">(category)</span></Label>
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
                  <div>
                    <Label className="text-xs">Applies to Job Category <span className="text-muted-foreground font-normal">(blank = all)</span></Label>
                    <Select value={jobCategory || "all"} onValueChange={(v) => setJobCategory(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All job types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All job types</SelectItem>
                        {jobCategories.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Branding */}
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3" /> Company Branding (PDF)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Company Name</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. VIVAFIRE" />
                  </div>
                  <div>
                    <Label className="text-xs">Subtitle</Label>
                    <Input value={companySubtitle} onChange={(e) => setCompanySubtitle(e.target.value)} placeholder="e.g. Wet & Dry Riser Specialists" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Footer Declaration</Label>
                  <Textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="e.g. We have, today, carried out this inspection to the requirements of BS 9990:2015" rows={3} className="text-sm" />
                  <p className="text-[11px] text-muted-foreground">Overrides any automatic footer for this template. Leave blank to use the system default (or none).</p>
                  {(() => {
                    const resolved = resolveFooterText(
                      templateName,
                      { footer_text: undefined },
                      footerText,
                    );
                    const variant: "default" | "secondary" | "outline" =
                      resolved.source === "template" ? "default"
                      : resolved.source === "rule" ? "secondary"
                      : "outline";
                    return (
                      <div className="mt-2 rounded-md border bg-muted/40 p-2 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium text-muted-foreground">Footer rule:</span>
                          <Badge variant={variant} className="text-[10px] py-0 h-4">
                            {resolved.source === "template" ? "Custom (this template)"
                              : resolved.source === "rule" ? "Auto-matched"
                              : "None"}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{resolved.ruleLabel}</span>
                        </div>
                        {resolved.text ? (
                          <pre className="text-[11px] whitespace-pre-wrap text-foreground/80 font-sans leading-snug">{resolved.text}</pre>
                        ) : (
                          <p className="text-[11px] italic text-muted-foreground">No footer declaration will be rendered on PDFs for this template.</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label className="text-xs">Declaration Box (Dry Riser printable)</Label>
                  <Textarea
                    value={declarationText}
                    onChange={(e) => setDeclarationText(e.target.value)}
                    placeholder="e.g. Tested and inspected in accordance with BS 9990:2015"
                    rows={2}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Shown in the bordered band above the accreditation logos on the printable Dry Riser sheet. Leave blank for the default ("Tested and inspected in accordance with BS 9990:2015").
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Header logo height (px)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={20}
                      max={400}
                      step={5}
                      value={headerLogoMaxH}
                      onChange={(e) => setHeaderLogoMaxH(e.target.value)}
                      placeholder="100 (default)"
                      className="text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Caps the printed logo height. Width scales proportionally. Range 20–400.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Spacing after logo (pt)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={72}
                      step={1}
                      value={headerLogoSpacingAfter}
                      onChange={(e) => setHeaderLogoSpacingAfter(e.target.value)}
                      placeholder="0 (default)"
                      className="text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Vertical gap between the logo and the title. Range 0–72 pt.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                    {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {logoUrl ? "Change Logo" : "Upload Logo"}
                  </Button>
                  {logoUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={logoUrl} alt="Logo preview" className="h-8 rounded border object-contain" />
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLogoUrl("")}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo — will use default</span>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* QA panel — flags layout drift from the Dry Riser Visual reference */}
        <div className="shrink-0 border-t pt-2">
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              !qaReport.ok
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : qaReport.warnings.length > 0
                  ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                  : "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Layout QA — {summariseQa(qaReport)}</span>
            </div>
            {(qaReport.errors.length > 0 || qaReport.warnings.length > 0) && (
              <ul className="mt-1.5 ml-5 list-disc space-y-0.5 max-h-24 overflow-y-auto">
                {qaReport.errors.map((i, k) => (
                  <li key={`e${k}`}><span className="font-semibold">Blocker:</span> {i.message}</li>
                ))}
                {qaReport.warnings.map((i, k) => (
                  <li key={`w${k}`} className="opacity-80">{i.message}</li>
                ))}
              </ul>
            )}
            {!qaReport.ok && (
              <label className="mt-2 flex items-center gap-1.5 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={qaOverride}
                  onChange={(e) => setQaOverride(e.target.checked)}
                  className="h-3 w-3"
                />
                Save anyway (override QA)
              </label>
            )}
          </div>
        </div>
        </div>
        {/* ─── RIGHT: live PDF preview ─── */}
        {previewOpen && (
          <div className="flex flex-col w-1/2 min-w-[420px] min-h-0 border rounded-md overflow-hidden bg-muted/30">
            <div className="flex items-center gap-2 border-b px-2 py-1.5 bg-background">
              <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium truncate">Live PDF preview</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {previewBuilding ? "Rebuilding…" : "Up to date"}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant={previewHandfill ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[11px] px-2 gap-1"
                  onClick={() => setPreviewHandfill((v) => !v)}
                  title="Toggle printable handfill mode (no borders/underlines)"
                >
                  <PenLine className="h-3 w-3" />
                  Handfill
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setPreviewVersion((v) => v + 1)}
                  title="Refresh preview now"
                  disabled={previewBuilding}
                >
                  {previewBuilding
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 relative bg-neutral-200 dark:bg-neutral-900">
              {previewError ? (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-xs text-destructive text-center">
                  Preview failed: {previewError}
                </div>
              ) : previewUrl ? (
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  title="Template PDF preview"
                  className="w-full h-full bg-white"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building preview…
                </div>
              )}
              {previewBuilding && previewUrl && (
                <div className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-full px-2 py-0.5 text-[10px] flex items-center gap-1 shadow">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Headless PDF builder — exposes getBlob() via ref. Always mounted
            (when dialog is open) so the live preview can pull a fresh blob. */}
        <BlankTemplatePdfExport
          ref={pdfExportRef}
          template={livePreviewTemplate as any}
          jobInfo={null}
          headless
        />

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={handleRevert} disabled={!template}>
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Revert
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            {template && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  (template.status ?? "published") === "draft"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
                title={
                  (template.status ?? "published") === "draft"
                    ? "Draft — not visible to new jobs"
                    : "Published — used by new jobs"
                }
              >
                {(template.status ?? "published") === "draft" ? "Draft" : "Published"}
              </span>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="secondary"
              onClick={() => handleSave("draft")}
              disabled={saving}
              title="Save changes as a draft. New jobs will keep using the last published version."
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileEdit className="h-4 w-4 mr-1" />}
              Save Draft
            </Button>
            <Button
              onClick={() => handleSave("published")}
              disabled={saving || (!qaReport.ok && !qaOverride)}
              title="Make this version available to new jobs."
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Publish
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
