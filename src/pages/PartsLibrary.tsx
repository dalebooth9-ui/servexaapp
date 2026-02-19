import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Search, Upload, FileText, Loader2, Pencil, ArrowLeft, Library } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface LibraryPart {
  id: string;
  name: string;
  description: string | null;
  unit_cost: number;
  sell_price: number;
  category: string;
  supplier: string | null;
  part_number: string | null;
  created_at: string;
}

interface ParsedLibraryPart {
  name: string;
  description: string;
  unit_cost: number;
  sell_price: number;
  category: string;
  supplier: string;
  part_number: string;
  selected: boolean;
}

export default function PartsLibrary() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = userRole === "admin";

  const [parts, setParts] = useState<LibraryPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Add form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", unit_cost: "0", sell_price: "0", category: "general", supplier: "", part_number: "" });

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unit_cost: "", sell_price: "", supplier: "", part_number: "" });

  // Bulk import
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedParts, setParsedParts] = useState<ParsedLibraryPart[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchParts = async () => {
    const { data } = await supabase
      .from("parts_library")
      .select("*")
      .order("name", { ascending: true });
    setParts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchParts(); }, []);

  const filteredParts = parts.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) ||
      (p.part_number || "").toLowerCase().includes(q) ||
      (p.supplier || "").toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q);
  });

  const handleAdd = async () => {
    if (!form.name.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from("parts_library").insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      unit_cost: parseFloat(form.unit_cost) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      category: form.category.trim() || "general",
      supplier: form.supplier.trim() || null,
      part_number: form.part_number.trim() || null,
      created_by: user.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ name: "", description: "", unit_cost: "0", sell_price: "0", category: "general", supplier: "", part_number: "" });
      fetchParts();
      toast({ title: "Part added to library" });
    }
    setAdding(false);
  };

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("parts_library").delete().in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setParts((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelected(new Set());
      toast({ title: `${ids.length} part(s) removed` });
    }
  };

  const startEdit = (part: LibraryPart) => {
    setEditingId(part.id);
    setEditForm({
      name: part.name,
      unit_cost: String(part.unit_cost),
      sell_price: String(part.sell_price),
      supplier: part.supplier || "",
      part_number: part.part_number || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("parts_library").update({
      name: editForm.name.trim(),
      unit_cost: parseFloat(editForm.unit_cost) || 0,
      sell_price: parseFloat(editForm.sell_price) || 0,
      supplier: editForm.supplier.trim() || null,
      part_number: editForm.part_number.trim() || null,
    } as any).eq("id", editingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Part updated" });
      setEditingId(null);
      fetchParts();
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredParts.length) setSelected(new Set());
    else setSelected(new Set(filteredParts.map((p) => p.id)));
  };

  // Bulk import handlers
  const handleParse = async () => {
    if (!importFile) return;
    setParsing(true);
    try {
      const buffer = await importFile.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-import-parts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ file_base64: base64, file_name: importFile.name }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Parse failed" }));
        throw new Error(err.error || "Failed to parse document");
      }

      const { parts: parsed } = await res.json();
      setParsedParts(
        (parsed || []).map((p: any) => ({
          name: p.name || p.part || p.material || "",
          description: p.notes || p.description || "",
          unit_cost: parseFloat(p.unit_cost ?? p.cost ?? p.price ?? 0),
          sell_price: parseFloat(p.sell_price ?? 0),
          category: p.category || "general",
          supplier: p.supplier || "",
          part_number: p.part_number || p.sku || "",
          selected: true,
        }))
      );
    } catch (err: any) {
      toast({ title: "Parse Error", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handleBulkImport = async () => {
    if (!user) return;
    const items = parsedParts.filter((p) => p.selected && p.name.trim());
    if (items.length === 0) {
      toast({ title: "No parts selected", variant: "destructive" });
      return;
    }
    setImporting(true);
    const rows = items.map((p) => ({
      name: p.name.trim(),
      description: p.description.trim() || null,
      unit_cost: p.unit_cost || 0,
      sell_price: p.sell_price || 0,
      category: p.category.trim() || "general",
      supplier: p.supplier.trim() || null,
      part_number: p.part_number.trim() || null,
      created_by: user.id,
    }));

    const { error } = await supabase.from("parts_library").insert(rows as any);
    if (error) {
      toast({ title: "Import Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${items.length} part(s) imported to library` });
      setImportOpen(false);
      setParsedParts([]);
      setImportFile(null);
      fetchParts();
    }
    setImporting(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading parts library...</p>;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <div className="flex items-center gap-3 mb-6">
        <Library className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Parts Library</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Add Part to Library</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <Input placeholder="Part name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="w-28">
              <Input placeholder="Part #" value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} />
            </div>
            <div className="w-24">
              <Input type="number" placeholder="Cost £" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} min="0" step="0.01" />
            </div>
            {isAdmin && (
              <div className="w-24">
                <Input type="number" placeholder="Sell £" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} min="0" step="0.01" />
              </div>
            )}
            <div className="w-28">
              <Input placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div className="w-24">
              <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <Button onClick={handleAdd} disabled={adding || !form.name.trim()} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1 h-4 w-4" /> Bulk Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search + bulk actions */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search parts, suppliers, part numbers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{filteredParts.length} part(s)</span>
      </div>

      {selected.size > 0 && isAdmin && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-4">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm"><Trash2 className="mr-1 h-4 w-4" /> Delete Selected</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.size} part(s) from library?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(Array.from(selected))}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {filteredParts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Library className="mx-auto mb-2 h-10 w-10 opacity-50" />
          <p className="text-sm">{parts.length === 0 ? "No parts in library yet. Add parts or bulk import." : "No matching parts found."}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === filteredParts.length && filteredParts.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
              )}
              <TableHead>Part Name</TableHead>
              <TableHead>Part #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              {isAdmin && <TableHead className="text-right">Sell Price</TableHead>}
              {isAdmin && <TableHead className="text-right">Margin</TableHead>}
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredParts.map((part) => {
              const isEditing = editingId === part.id;
              const margin = part.sell_price > 0 ? ((part.sell_price - part.unit_cost) / part.sell_price) * 100 : 0;

              return (
                <TableRow key={part.id} data-state={selected.has(part.id) ? "selected" : undefined}>
                  {isAdmin && (
                    <TableCell>
                      <Checkbox checked={selected.has(part.id)} onCheckedChange={() => toggleSelect(part.id)} />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    {isEditing ? (
                      <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-8 text-sm" />
                    ) : part.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {isEditing ? (
                      <Input value={editForm.part_number} onChange={(e) => setEditForm({ ...editForm, part_number: e.target.value })} className="h-8 text-sm w-28" />
                    ) : (part.part_number || "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {isEditing ? (
                      <Input value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} className="h-8 text-sm w-28" />
                    ) : (part.supplier || "—")}
                  </TableCell>
                  <TableCell className="text-sm">{part.category}</TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input type="number" min="0" step="0.01" value={editForm.unit_cost} onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })} className="h-8 text-sm text-right w-24" />
                    ) : <>£{Number(part.unit_cost).toFixed(2)}</>}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input type="number" min="0" step="0.01" value={editForm.sell_price} onChange={(e) => setEditForm({ ...editForm, sell_price: e.target.value })} className="h-8 text-sm text-right w-24" />
                      ) : <>£{Number(part.sell_price).toFixed(2)}</>}
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell className={`text-right text-sm font-medium ${margin > 0 ? "text-green-600" : margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {part.sell_price > 0 ? `${margin.toFixed(1)}%` : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {isAdmin && (
                        isEditing ? (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={saveEdit}>Save</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(part)} className="text-muted-foreground hover:text-primary">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete([part.id])} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Bulk Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import Parts to Library</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.csv,.xlsx,.xls,.txt" onChange={(e) => { setImportFile(e.target.files?.[0] || null); setParsedParts([]); }} />
              </div>
              <Button onClick={handleParse} disabled={!importFile || parsing} size="sm">
                {parsing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
                {parsing ? "Parsing…" : "Extract Parts"}
              </Button>
            </div>
            {importFile && !parsing && parsedParts.length === 0 && (
              <p className="text-sm text-muted-foreground">Upload a supplier list, price sheet, or parts document, then click Extract Parts.</p>
            )}
            {parsedParts.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">{parsedParts.filter((p) => p.selected).length} of {parsedParts.length} parts selected.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={parsedParts.every((p) => p.selected)} onCheckedChange={(c) => setParsedParts((prev) => prev.map((p) => ({ ...p, selected: !!c })))} />
                      </TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead className="w-24">Part #</TableHead>
                      <TableHead className="w-24 text-right">Cost £</TableHead>
                      <TableHead className="w-24">Supplier</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedParts.map((part, idx) => (
                      <TableRow key={idx} className={part.selected ? "" : "opacity-50"}>
                        <TableCell>
                          <Checkbox checked={part.selected} onCheckedChange={() => setParsedParts((prev) => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p))} />
                        </TableCell>
                        <TableCell>
                          <Input value={part.name} onChange={(e) => setParsedParts((prev) => prev.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell>
                          <Input value={part.part_number} onChange={(e) => setParsedParts((prev) => prev.map((p, i) => i === idx ? { ...p, part_number: e.target.value } : p))} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={part.unit_cost} onChange={(e) => setParsedParts((prev) => prev.map((p, i) => i === idx ? { ...p, unit_cost: parseFloat(e.target.value) || 0 } : p))} className="h-8 text-sm text-right w-24" min="0" step="0.01" />
                        </TableCell>
                        <TableCell>
                          <Input value={part.supplier} onChange={(e) => setParsedParts((prev) => prev.map((p, i) => i === idx ? { ...p, supplier: e.target.value } : p))} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell>
                          <button onClick={() => setParsedParts((prev) => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
          {parsedParts.length > 0 && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkImport} disabled={importing || parsedParts.filter((p) => p.selected).length === 0}>
                {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                Import {parsedParts.filter((p) => p.selected).length} Parts
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
