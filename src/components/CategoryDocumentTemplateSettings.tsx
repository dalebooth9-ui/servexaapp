import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Trash2, Upload, Loader2, FolderOpen, ExternalLink } from "lucide-react";
import { useJobCategories } from "@/hooks/useJobCategories";

type DocTemplate = {
  id: string;
  category_slug: string;
  document_type: "rams_pdf" | "blank_job_sheet" | "uploaded_file";
  label: string;
  file_url: string | null;
  file_name: string | null;
  description: string | null;
  enabled: boolean;
  sort_order: number;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  rams_pdf: "RAMS PDF",
  blank_job_sheet: "Blank Job Sheet",
  uploaded_file: "Uploaded File",
};

const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  rams_pdf: "Auto-generate a RAMS method statement PDF with job & site details filled in",
  blank_job_sheet: "Generate a blank job sheet PDF for the engineer to fill out on site",
  uploaded_file: "Attach a specific uploaded file (e.g. SOP, risk assessment template)",
};

export default function CategoryDocumentTemplateSettings() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const { categories } = useJobCategories();
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [newDocType, setNewDocType] = useState<string>("rams_pdf");
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadId = useRef<string | null>(null);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("category_document_templates" as any)
      .select("*")
      .order("category_slug")
      .order("sort_order");
    setTemplates((data as unknown as DocTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    setSaving(id);
    await supabase.from("category_document_templates" as any).update({ enabled } as any).eq("id", id);
    setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, enabled } : t));
    setSaving(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("category_document_templates" as any).delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast({ title: "Removed" });
  };

  const handleAdd = async () => {
    if (!newCategory || !newLabel.trim()) {
      toast({ title: "Please select a category and enter a label", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from("category_document_templates" as any)
      .insert({
        category_slug: newCategory,
        document_type: newDocType,
        label: newLabel.trim(),
        enabled: true,
        sort_order: templates.filter((t) => t.category_slug === newCategory).length,
      } as any)
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: "Failed to add template.", variant: "destructive" });
    } else {
      setTemplates((prev) => [...prev, data as unknown as DocTemplate]);
      setNewLabel("");
      toast({ title: "Template added" });
    }
    setAdding(false);
  };

  const handleUploadFile = (templateId: string) => {
    pendingUploadId.current = templateId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = pendingUploadId.current;
    if (!file || !id) return;
    e.target.value = "";

    setUploadingFor(id);
    const ext = file.name.split(".").pop() || "pdf";
    const path = `category-doc-templates/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } else {
      const { data: urlData } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (urlData?.signedUrl) {
        await supabase
          .from("category_document_templates" as any)
          .update({ file_url: urlData.signedUrl, file_name: file.name } as any)
          .eq("id", id);
        setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, file_url: urlData.signedUrl, file_name: file.name } : t));
        toast({ title: "File uploaded" });
      }
    }
    setUploadingFor(null);
  };

  if (userRole !== "admin") return null;

  // Group by category
  const grouped = categories.reduce<Record<string, DocTemplate[]>>((acc, cat) => {
    acc[cat.slug] = templates.filter((t) => t.category_slug === cat.slug);
    return acc;
  }, {});
  // Also include templates for categories not in the list
  templates.forEach((t) => {
    if (!grouped[t.category_slug]) grouped[t.category_slug] = [];
    if (!grouped[t.category_slug].find((x) => x.id === t.id)) grouped[t.category_slug].push(t);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Category Document Templates</CardTitle>
        </div>
        <CardDescription>
          Configure which documents auto-attach to jobs when a specific category is assigned. Engineers will see these in a dedicated Documents panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} />

        {/* Add new template row */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">Add Document Template</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Job Category</Label>
              <Select value={newCategory || "none"} onValueChange={(v) => setNewCategory(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select category…</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Document Type</Label>
              <Select value={newDocType} onValueChange={setNewDocType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={DOC_TYPE_LABELS[newDocType] || "Label"}
                className="mt-1"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
          </div>
          {newDocType && (
            <p className="text-xs text-muted-foreground">{DOC_TYPE_DESCRIPTIONS[newDocType]}</p>
          )}
          <Button size="sm" onClick={handleAdd} disabled={adding || !newCategory || !newLabel.trim()}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Add Template
          </Button>
        </div>

        {/* Grouped list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : Object.entries(grouped).filter(([, list]) => list.length > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">No document templates configured yet. Add one above.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped)
              .filter(([, list]) => list.length > 0)
              .map(([slug, list]) => {
                const cat = categories.find((c) => c.slug === slug);
                return (
                  <div key={slug}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {cat?.name || slug}
                    </p>
                    <div className="space-y-2">
                      {list.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => {
                            if (t.file_url) window.open(t.file_url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.label}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px]">{DOC_TYPE_LABELS[t.document_type]}</Badge>
                              {t.file_name && (
                                <span className="text-[10px] text-muted-foreground truncate">{t.file_name}</span>
                              )}
                            </div>
                          </div>
                          {t.file_url && t.document_type === "uploaded_file" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground"
                              onClick={(e) => { e.stopPropagation(); window.open(t.file_url!, "_blank", "noopener,noreferrer"); }}
                              title="View file"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {t.document_type === "uploaded_file" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2 gap-1 shrink-0"
                              onClick={(e) => { e.stopPropagation(); handleUploadFile(t.id); }}
                              disabled={uploadingFor === t.id}
                            >
                              {uploadingFor === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              {t.file_name ? "Replace" : "Upload"}
                            </Button>
                          )}
                          <div onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={t.enabled}
                              onCheckedChange={(v) => handleToggle(t.id, v)}
                              disabled={saving === t.id}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
