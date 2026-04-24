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
import { FileText, Plus, Trash2, Upload, Loader2, FolderOpen, ExternalLink, Printer, Download, MoreVertical } from "lucide-react";
import { useJobCategories } from "@/hooks/useJobCategories";
import BlankTemplatePdfExport, { type BlankTemplatePdfExportHandle } from "./BlankTemplatePdfExport";
import BlankTemplateWordExport, { type BlankTemplateWordExportHandle } from "./BlankTemplateWordExport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type JobSheetTemplate = {
  id: string;
  name: string;
  description: string | null;
  standard?: string | null;
  fields: any;
  branding?: any;
  category?: string | null;
};

function normalizeName(s: string | null | undefined) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

type DocTemplate = {
  id: string;
  category_slug: string;
  document_type: "rams_pdf" | "blank_job_sheet" | "uploaded_file" | "quote" | "purchase_order" | "site_drawing";
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
  quote: "Quote",
  purchase_order: "Purchase Order",
  site_drawing: "Site Drawing",
};

const DOC_TYPE_DESCRIPTIONS: Record<string, string> = {
  rams_pdf: "Auto-generate a RAMS method statement PDF with job & site details filled in",
  blank_job_sheet: "Generate a blank job sheet PDF for the engineer to fill out on site",
  uploaded_file: "Attach a specific uploaded file (e.g. SOP, risk assessment template)",
  quote: "Upload slot for your company quote document",
  purchase_order: "Upload slot for the client's purchase order",
  site_drawing: "Upload slot for site drawings or floor plans",
};

export default function CategoryDocumentTemplateSettings() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const { categories } = useJobCategories();
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [jobSheetTemplates, setJobSheetTemplates] = useState<JobSheetTemplate[]>([]);
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
    const [{ data }, { data: jst }] = await Promise.all([
      supabase
        .from("category_document_templates" as any)
        .select("*")
        .order("category_slug")
        .order("sort_order"),
      supabase
        .from("job_sheet_templates")
        .select("id,name,description,standard,fields,branding,category"),
    ]);
    setTemplates((data as unknown as DocTemplate[]) || []);
    const parsed = ((jst as any[]) || []).map((t) => ({
      ...t,
      fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields,
    })) as JobSheetTemplate[];
    setJobSheetTemplates(parsed);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const resolveTemplate = (row: DocTemplate): JobSheetTemplate | null => {
    const target = normalizeName(row.label);
    if (!target) return null;
    const candidates = jobSheetTemplates.filter((t) => normalizeName(t.name) === target);
    if (candidates.length === 0) {
      // Fallback: contains match
      const partial = jobSheetTemplates.find((t) =>
        normalizeName(t.name).includes(target) || target.includes(normalizeName(t.name)),
      );
      return partial || null;
    }
    // Prefer same category
    const sameCat = candidates.find((t) => (t.category || "") === row.category_slug);
    return sameCat || candidates[0];
  };

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
                        <TemplateRow
                          key={t.id}
                          t={t}
                          linked={(t.document_type === "blank_job_sheet" || t.document_type === "rams_pdf") ? resolveTemplate(t) : null}
                          uploading={uploadingFor === t.id}
                          onUpload={() => handleUploadFile(t.id)}
                        >
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
                        </TemplateRow>
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

type DocTemplateRow = {
  id: string;
  category_slug: string;
  document_type: string;
  label: string;
  file_url: string | null;
  file_name: string | null;
};

function TemplateRow({
  t,
  linked,
  uploading,
  onUpload,
  children,
}: {
  t: DocTemplateRow;
  linked: JobSheetTemplate | null;
  uploading: boolean;
  onUpload: () => void;
  children: React.ReactNode;
}) {
  const pdfRef = useRef<BlankTemplatePdfExportHandle>(null);
  const wordRef = useRef<BlankTemplateWordExportHandle>(null);

  const isFileRow = !!t.file_url && (
    t.document_type === "uploaded_file" ||
    t.document_type === "quote" ||
    t.document_type === "purchase_order" ||
    t.document_type === "site_drawing"
  );
  const isGenerated = (t.document_type === "blank_job_sheet" || t.document_type === "rams_pdf") && !!linked;
  const supportsUpload =
    t.document_type === "uploaded_file" ||
    t.document_type === "quote" ||
    t.document_type === "purchase_order" ||
    t.document_type === "site_drawing";

  const viewFile = () => t.file_url && window.open(t.file_url, "_blank", "noopener,noreferrer");
  const printFile = () => {
    if (!t.file_url) return;
    const win = window.open(t.file_url, "_blank", "noopener,noreferrer");
    if (win) win.addEventListener("load", () => { try { win.print(); } catch { /* noop */ } });
  };
  const downloadFile = () => {
    if (!t.file_url) return;
    const a = document.createElement("a");
    a.href = t.file_url;
    a.download = t.file_name || t.label;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
      onClick={() => { if (t.file_url) window.open(t.file_url, "_blank", "noopener,noreferrer"); }}
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{t.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-[10px]">{DOC_TYPE_LABELS[t.document_type]}</Badge>
          {t.file_name && (
            <span className="text-[10px] text-muted-foreground truncate">{t.file_name}</span>
          )}
          {(t.document_type === "blank_job_sheet" || t.document_type === "rams_pdf") && !linked && (
            <span className="text-[10px] text-muted-foreground italic">No matching template</span>
          )}
        </div>
      </div>

      {/* Single mounted instance — buttons visible on sm+, hidden on mobile but refs still work */}
      {isGenerated && linked && (
        <div className="items-center [&>div]:flex hidden sm:flex" onClick={(e) => e.stopPropagation()}>
          <BlankTemplatePdfExport
            ref={pdfRef}
            template={{
              id: linked.id,
              name: linked.name,
              description: linked.description,
              standard: linked.standard,
              fields: linked.fields,
              branding: linked.branding || {},
            }}
            jobInfo={null}
            showPrint
          />
          <BlankTemplateWordExport
            ref={wordRef}
            template={{
              name: linked.name,
              description: linked.description || undefined,
              standard: linked.standard || undefined,
              fields: linked.fields,
            }}
          />
        </div>
      )}
      {/* Mobile-only: keep the export components mounted (off-screen) so refs are attached */}
      {isGenerated && linked && (
        <div className="sm:hidden absolute -left-[9999px] top-0 pointer-events-none" aria-hidden>
          <BlankTemplatePdfExport
            ref={pdfRef}
            template={{
              id: linked.id,
              name: linked.name,
              description: linked.description,
              standard: linked.standard,
              fields: linked.fields,
              branding: linked.branding || {},
            }}
            jobInfo={null}
            showPrint
          />
          <BlankTemplateWordExport
            ref={wordRef}
            template={{
              name: linked.name,
              description: linked.description || undefined,
              standard: linked.standard || undefined,
              fields: linked.fields,
            }}
          />
        </div>
      )}

      {/* Desktop inline file actions */}
      {isFileRow && (
        <div className="hidden sm:flex items-center" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={viewFile} title="View file">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={printFile} title="Print now">
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={downloadFile} title="Download file">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Desktop upload */}
      {supportsUpload && (
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex h-7 text-xs px-2 gap-1 shrink-0 ml-1"
          onClick={(e) => { e.stopPropagation(); onUpload(); }}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {t.file_name ? "Replace" : "Upload"}
        </Button>
      )}

      {/* Mobile collapsed menu */}
      {(isFileRow || isGenerated || supportsUpload) && (
        <div className="sm:hidden" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" title="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              {isFileRow && (
                <>
                  <DropdownMenuItem onClick={viewFile}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" /> View
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={printFile}>
                    <Printer className="mr-2 h-3.5 w-3.5" /> Print now
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadFile}>
                    <Download className="mr-2 h-3.5 w-3.5" /> Download
                  </DropdownMenuItem>
                </>
              )}
              {isGenerated && (
                <>
                  <DropdownMenuItem onClick={() => pdfRef.current?.download()}>
                    <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => pdfRef.current?.print()}>
                    <Printer className="mr-2 h-3.5 w-3.5" /> Print now
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => wordRef.current?.openPreview()}>
                    <FileText className="mr-2 h-3.5 w-3.5" /> Save as Word
                  </DropdownMenuItem>
                </>
              )}
              {supportsUpload && (
                <>
                  {(isFileRow || isGenerated) && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={onUpload} disabled={uploading}>
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {t.file_name ? "Replace file" : "Upload file"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {children}
    </div>
  );
}
