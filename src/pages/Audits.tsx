import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { useAuditCategories } from "@/hooks/useAuditCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ClipboardCheck, Plus, Pencil, Trash2, Play, CheckCircle2, XCircle, Minus, Search, Flame, Shield, Settings2,
} from "lucide-react";
import { format } from "date-fns";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AuditTemplate = {
  id: string; name: string; description: string | null; category: string; created_at: string;
};
type TemplateItem = {
  id: string; template_id: string; question: string; sort_order: number; required: boolean; item_type: string;
};
type Audit = {
  id: string; template_id: string; site_id: string | null; asset_id: string | null;
  auditor_id: string; status: string; score_percent: number | null;
  notes: string | null; completed_at: string | null; created_at: string;
};
type AuditResponse = {
  id: string; audit_id: string; item_id: string; result: string; notes: string | null;
};
type LookupOption = { id: string; name: string };

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  fire_safety: Flame,
};

const CATEGORY_COLORS: Record<string, string> = {
  fire_safety: "text-orange-500",
};

export default function Audits() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo } = useUndoAction();
  const { categories: auditCategories, refetch: refetchCategories } = useAuditCategories();
  const CATEGORIES = auditCategories.map((c) => c.slug);
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [templateItems, setTemplateItems] = useState<Record<string, TemplateItem[]>>({});
  const [audits, setAudits] = useState<Audit[]>([]);
  const [sites, setSites] = useState<LookupOption[]>([]);
  const [assets, setAssets] = useState<LookupOption[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Template dialog
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<AuditTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ name: "", description: "", category: "general" });
  const [tplItems, setTplItems] = useState<{ question: string; required: boolean }[]>([]);

  // Start audit dialog
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [auditSite, setAuditSite] = useState("");
  const [auditAsset, setAuditAsset] = useState("");

  // Conduct audit dialog
  const [conductDialogOpen, setConductDialogOpen] = useState(false);
  const [activeAudit, setActiveAudit] = useState<Audit | null>(null);
  const [activeItems, setActiveItems] = useState<TemplateItem[]>([]);
  const [responses, setResponses] = useState<Record<string, { result: string; notes: string }>>({});

  // Category management state
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");

  const toSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const slug = toSlug(name);
    if (auditCategories.some((c) => c.slug === slug)) {
      toast({ title: "Category already exists", variant: "destructive" });
      return;
    }
    setAddingCat(true);
    const maxOrder = auditCategories.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const { error } = await supabase.from("audit_categories" as any).insert({ name, slug, sort_order: maxOrder + 1 } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setNewCatName(""); toast({ title: "Category added" }); refetchCategories(); }
    setAddingCat(false);
  };

  const handleRenameCategory = async (id: string, oldName: string) => {
    const name = editCatName.trim();
    if (!name || name === oldName) { setEditingCatId(null); return; }
    const slug = toSlug(name);
    const { error } = await supabase.from("audit_categories" as any).update({ name, slug } as any).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Category renamed" }); refetchCategories(); }
    setEditingCatId(null);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const { error } = await supabase.from("audit_categories" as any).delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: `"${name}" removed` }); refetchCategories(); }
  };

  const fetchData = async () => {
    const [tplRes, auditRes, siteRes, assetRes] = await Promise.all([
      supabase.from("audit_templates").select("*").order("name"),
      supabase.from("audits").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("sites").select("id, name").order("name"),
      supabase.from("assets").select("id, name").order("name"),
    ]);
    setTemplates((tplRes.data as AuditTemplate[]) || []);
    setAudits((auditRes.data as Audit[]) || []);
    setSites((siteRes.data as LookupOption[]) || []);
    setAssets((assetRes.data as LookupOption[]) || []);

    // Fetch profiles for auditors
    const auditorIds = new Set((auditRes.data || []).map((a: any) => a.auditor_id));
    if (auditorIds.size > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(auditorIds));
      const map: Record<string, string> = {};
      (profs || []).forEach((p) => { map[p.user_id] = p.full_name; });
      setProfiles(map);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const siteLookup = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const assetLookup = Object.fromEntries(assets.map((a) => [a.id, a.name]));
  const tplLookup = Object.fromEntries(templates.map((t) => [t.id, t.name]));
  const tplCategoryLookup = Object.fromEntries(templates.map((t) => [t.id, t.category]));

  const filteredTemplates = categoryFilter === "all" ? templates : templates.filter((t) => t.category === categoryFilter);
  const filteredAudits = categoryFilter === "all" ? audits : audits.filter((a) => tplCategoryLookup[a.template_id] === categoryFilter);

  const fireSafetyTemplates = templates.filter((t) => t.category === "fire_safety");
  const otherTemplates = templates.filter((t) => t.category !== "fire_safety");

  // --- Template CRUD ---
  const openCreateTpl = () => {
    setEditingTpl(null);
    setTplForm({ name: "", description: "", category: "general" });
    setTplItems([{ question: "", required: true }]);
    setTplDialogOpen(true);
  };

  const openEditTpl = async (tpl: AuditTemplate) => {
    setEditingTpl(tpl);
    setTplForm({ name: tpl.name, description: tpl.description || "", category: tpl.category });
    const { data } = await supabase.from("audit_template_items").select("*").eq("template_id", tpl.id).order("sort_order");
    setTplItems((data || []).map((i: any) => ({ question: i.question, required: i.required })));
    setTplDialogOpen(true);
  };

  const saveTpl = async () => {
    if (!tplForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const validItems = tplItems.filter((i) => i.question.trim());
    if (validItems.length === 0) { toast({ title: "Add at least one checklist item", variant: "destructive" }); return; }

    let tplId = editingTpl?.id;
    if (editingTpl) {
      const { error } = await supabase.from("audit_templates").update({
        name: tplForm.name.trim(), description: tplForm.description || null, category: tplForm.category,
      }).eq("id", editingTpl.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await supabase.from("audit_template_items").delete().eq("template_id", editingTpl.id);
    } else {
      const { data, error } = await supabase.from("audit_templates").insert({
        name: tplForm.name.trim(), description: tplForm.description || null, category: tplForm.category,
      } as any).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      tplId = data.id;
    }

    const itemInserts = validItems.map((item, idx) => ({
      template_id: tplId!, question: item.question.trim(), sort_order: idx, required: item.required, item_type: "pass_fail",
    }));
    await supabase.from("audit_template_items").insert(itemInserts as any);

    toast({ title: editingTpl ? "Template updated" : "Template created" });
    setTplDialogOpen(false);
    fetchData();
  };

  const deleteTpl = async (id: string) => {
    const deletedTpl = templates.find((t) => t.id === id);
    if (!deletedTpl) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    deleteWithUndo({
      key: id,
      label: "Template deleted",
      onConfirm: async () => {
        const { error } = await supabase.from("audit_templates").delete().eq("id", id);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setTemplates((prev) => [...prev, deletedTpl]);
        }
      },
      onUndo: () => setTemplates((prev) => [...prev, deletedTpl]),
    });
  };

  // --- Delete audit ---
  const deleteAudit = (id: string) => {
    const deleted = audits.find((a) => a.id === id);
    if (!deleted) return;
    setAudits((prev) => prev.filter((a) => a.id !== id));
    deleteWithUndo({
      key: id,
      label: "Audit deleted",
      onConfirm: async () => {
        const { error } = await supabase.from("audits").delete().eq("id", id);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setAudits((prev) => [deleted, ...prev]);
        }
      },
      onUndo: () => setAudits((prev) => [deleted, ...prev]),
    });
  };

  // --- Start audit ---
  const startAudit = async () => {
    if (!selectedTemplate || !user) return;
    const { data, error } = await supabase.from("audits").insert({
      template_id: selectedTemplate,
      site_id: auditSite || null,
      asset_id: auditAsset || null,
      auditor_id: user.id,
      status: "in_progress",
    } as any).select("*").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // Create blank responses
    const { data: items } = await supabase.from("audit_template_items").select("*").eq("template_id", selectedTemplate).order("sort_order");
    if (items && items.length > 0) {
      const blankResponses = items.map((i: any) => ({ audit_id: data.id, item_id: i.id, result: "pending" }));
      await supabase.from("audit_responses").insert(blankResponses as any);
    }

    toast({ title: "Audit started" });
    setStartDialogOpen(false);
    fetchData();
    // Open conduct dialog
    openConduct(data as Audit);
  };

  // --- Conduct audit ---
  const openConduct = async (audit: Audit) => {
    setActiveAudit(audit);
    const [itemsRes, respRes] = await Promise.all([
      supabase.from("audit_template_items").select("*").eq("template_id", audit.template_id).order("sort_order"),
      supabase.from("audit_responses").select("*").eq("audit_id", audit.id),
    ]);
    setActiveItems((itemsRes.data as TemplateItem[]) || []);
    const respMap: Record<string, { result: string; notes: string }> = {};
    (respRes.data || []).forEach((r: any) => { respMap[r.item_id] = { result: r.result, notes: r.notes || "" }; });
    setResponses(respMap);
    setConductDialogOpen(true);
  };

  const submitAudit = async () => {
    if (!activeAudit) return;

    // Save responses
    for (const item of activeItems) {
      const resp = responses[item.id];
      if (resp) {
        await supabase.from("audit_responses").update({ result: resp.result, notes: resp.notes || null })
          .eq("audit_id", activeAudit.id).eq("item_id", item.id);
      }
    }

    // Calculate score
    const total = activeItems.length;
    const passed = activeItems.filter((i) => responses[i.id]?.result === "pass").length;
    const failed = activeItems.filter((i) => responses[i.id]?.result === "fail").length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;
    const status = failed > 0 ? "failed" : "completed";

    await supabase.from("audits").update({
      status, score_percent: score, completed_at: new Date().toISOString(),
    }).eq("id", activeAudit.id);

    toast({ title: `Audit ${status}`, description: `Score: ${score}%` });
    setConductDialogOpen(false);
    fetchData();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audits</h1>
          <p className="text-sm text-muted-foreground">Create checklist templates and conduct site/asset audits.</p>
        </div>
        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {auditCategories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { setSelectedTemplate(""); setAuditSite(""); setAuditAsset(""); setStartDialogOpen(true); }}>
            <Play className="mr-2 h-4 w-4" /> Start Audit
          </Button>
          {userRole === "admin" && (
            <Button onClick={openCreateTpl}><Plus className="mr-2 h-4 w-4" /> New Template</Button>
          )}
        </div>
      </div>

      {/* Inline Category Management */}
      {userRole === "admin" && (
        <Collapsible open={catOpen} onOpenChange={setCatOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="mr-1 h-4 w-4" /> Manage Categories
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="New category name"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                    className="max-w-xs"
                  />
                  <Button onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()} size="sm">
                    <Plus className="mr-1 h-4 w-4" /> Add
                  </Button>
                </div>
                {auditCategories.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditCategories.map((cat, i) => (
                        <TableRow key={cat.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            {editingCatId === cat.id ? (
                              <Input
                                value={editCatName}
                                onChange={(e) => setEditCatName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameCategory(cat.id, cat.name);
                                  if (e.key === "Escape") setEditingCatId(null);
                                }}
                                onBlur={() => handleRenameCategory(cat.id, cat.name)}
                                autoFocus
                                className="h-7 text-sm max-w-[200px]"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:underline"
                                onDoubleClick={() => { setEditingCatId(cat.id); setEditCatName(cat.name); }}
                                title="Double-click to rename"
                              >
                                {cat.name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">{cat.slug}</TableCell>
                          <TableCell>
                            <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Tabs defaultValue="audits">
        <TabsList>
          <TabsTrigger value="audits">Audits ({filteredAudits.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({filteredTemplates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="audits" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {filteredAudits.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No audits yet. Start one from a template.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Site / Asset</TableHead>
                      <TableHead>Auditor</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAudits.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">
                          {(() => {
                            const cat = tplCategoryLookup[a.template_id];
                            const CatIcon = CATEGORY_ICONS[cat];
                            const catColor = CATEGORY_COLORS[cat];
                            return (
                              <span className="flex items-center gap-1.5">
                                {CatIcon && <CatIcon className={`h-3.5 w-3.5 ${catColor}`} />}
                                {tplLookup[a.template_id] || "—"}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.site_id ? siteLookup[a.site_id] : a.asset_id ? assetLookup[a.asset_id] : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{profiles[a.auditor_id] || "Unknown"}</TableCell>
                        <TableCell>
                          {a.score_percent !== null ? (
                            <span className={`text-sm font-bold ${a.score_percent >= 80 ? "text-green-500" : a.score_percent >= 50 ? "text-amber-500" : "text-destructive"}`}>
                              {a.score_percent}%
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={a.status === "completed" ? "default" : a.status === "failed" ? "destructive" : "secondary"} className="text-[10px] capitalize">
                            {a.status === "in_progress" ? "In Progress" : a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(a.created_at), "dd MMM yy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {a.status === "in_progress" && (
                              <Button variant="ghost" size="sm" onClick={() => openConduct(a)}>
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {userRole === "admin" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteAudit(a.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {filteredTemplates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No templates match this category.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Created</TableHead>
                      {userRole === "admin" && <TableHead className="w-20" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.map((t) => {
                      const CatIcon = CATEGORY_ICONS[t.category];
                      const catColor = CATEGORY_COLORS[t.category];
                      return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <p className="font-medium text-sm flex items-center gap-1.5">
                            {CatIcon && <CatIcon className={`h-3.5 w-3.5 ${catColor}`} />}
                            {t.name}
                          </p>
                          {t.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{t.description}</p>}
                        </TableCell>
                        <TableCell><Badge variant={t.category === "fire_safety" ? "destructive" : "outline"} className="text-[10px] capitalize">{t.category.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(t.created_at), "dd MMM yy")}</TableCell>
                        {userRole === "admin" && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTpl(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTpl(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTpl ? "Edit" : "Create"} Audit Template</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <Input value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Fire Safety Inspection" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select value={tplForm.category} onValueChange={(v) => setTplForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {auditCategories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Checklist Items</label>
                <Button variant="ghost" size="sm" onClick={() => setTplItems((i) => [...i, { question: "", required: true }])}>
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
              {tplItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-6 shrink-0">{idx + 1}.</span>
                  <Input
                    value={item.question}
                    onChange={(e) => {
                      const next = [...tplItems];
                      next[idx] = { ...next[idx], question: e.target.value };
                      setTplItems(next);
                    }}
                    placeholder="Check item question..."
                    className="flex-1 text-sm"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setTplItems((i) => i.filter((_, j) => j !== idx))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTplDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveTpl}>{editingTpl ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Start Audit Dialog */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Start New Audit</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template *</label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {fireSafetyTemplates.length > 0 && (
                    <>
                      <SelectItem value="__fire_header" disabled className="text-xs font-semibold text-orange-500">🔥 Fire Safety</SelectItem>
                      {fireSafetyTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </>
                  )}
                  {otherTemplates.length > 0 && (
                    <>
                      {fireSafetyTemplates.length > 0 && <SelectItem value="__other_header" disabled className="text-xs font-semibold text-muted-foreground">Other</SelectItem>}
                      {otherTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Site</label>
                <Select value={auditSite} onValueChange={setAuditSite}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Asset</label>
                <Select value={auditAsset} onValueChange={setAuditAsset}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartDialogOpen(false)}>Cancel</Button>
              <Button onClick={startAudit} disabled={!selectedTemplate}><Play className="mr-2 h-4 w-4" /> Start</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conduct Audit Dialog */}
      <Dialog open={conductDialogOpen} onOpenChange={setConductDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conduct Audit: {activeAudit ? tplLookup[activeAudit.template_id] : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {activeItems.map((item, idx) => {
              const resp = responses[item.id] || { result: "pending", notes: "" };
              return (
                <div key={item.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground mt-1 shrink-0">{idx + 1}.</span>
                    <p className="text-sm font-medium flex-1">{item.question}</p>
                    {item.required && <Badge variant="outline" className="text-[9px] shrink-0">Required</Badge>}
                  </div>
                  <div className="flex gap-2 ml-5">
                    {["pass", "fail", "n_a"].map((r) => (
                      <Button
                        key={r}
                        size="sm"
                        variant={resp.result === r ? (r === "pass" ? "default" : r === "fail" ? "destructive" : "secondary") : "outline"}
                        onClick={() => setResponses((prev) => ({ ...prev, [item.id]: { ...resp, result: r } }))}
                        className="text-xs capitalize"
                      >
                        {r === "pass" ? <><CheckCircle2 className="mr-1 h-3 w-3" /> Pass</> :
                         r === "fail" ? <><XCircle className="mr-1 h-3 w-3" /> Fail</> : "N/A"}
                      </Button>
                    ))}
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={resp.notes}
                    onChange={(e) => setResponses((prev) => ({ ...prev, [item.id]: { ...resp, notes: e.target.value } }))}
                    className="ml-5 text-xs"
                  />
                </div>
              );
            })}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConductDialogOpen(false)}>Save & Close</Button>
              <Button onClick={submitAudit}>
                <ClipboardCheck className="mr-2 h-4 w-4" /> Complete Audit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
