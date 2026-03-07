import { useEffect, useState, useRef, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Search, Upload, FileText, Loader2, Pencil, ArrowLeft, Library, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface LibraryPart {
  id: string;
  name: string;
  description: string | null;
  unit_cost: number;
  sell_price: number;
  china_cost: number;
  uk_cost: number;
  category: string;
  supplier: string | null;
  part_number: string | null;
  created_at: string;
  sort_order: number;
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

// Inline add row between parts
const InlineAddRow = forwardRef<HTMLTableRowElement, {
  isAdmin: boolean;
  onAdd: (form: { name: string; unit_cost: string; sell_price: string; china_cost: string; uk_cost: string; category: string; supplier: string; part_number: string }) => Promise<void>;
  colSpan: number;
}>(function InlineAddRow({ isAdmin, onAdd, colSpan }, ref) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unit_cost: "0", sell_price: "0", china_cost: "0", uk_cost: "0", category: "general", supplier: "", part_number: "" });
  const [adding, setAdding] = useState(false);

  if (!open) {
    return (
      <tr ref={ref}>
        <td colSpan={colSpan}>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary py-1 px-2 w-full"
          >
            <Plus className="h-3 w-3" /> Add part here
          </button>
        </td>
      </tr>
    );
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setAdding(true);
    await onAdd(form);
    setForm({ name: "", unit_cost: "0", sell_price: "0", china_cost: "0", uk_cost: "0", category: "general", supplier: "", part_number: "" });
    setOpen(false);
    setAdding(false);
  };

  return (
    <tr ref={ref} className="bg-muted/30">
      <td colSpan={colSpan}>
        <div className="flex flex-wrap gap-2 items-center py-1 px-2">
          <Input placeholder="Part name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-sm flex-1 min-w-[120px]" autoFocus onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          <Input placeholder="Part #" value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} className="h-8 text-sm w-24" />
          <Input type="number" placeholder="Cost £" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className="h-8 text-sm w-20 text-right" />
          {isAdmin && (
            <>
              <Input type="number" placeholder="China £" min="0" step="0.01" value={form.china_cost} onChange={(e) => setForm({ ...form, china_cost: e.target.value })} className="h-8 text-sm w-20 text-right" />
              <Input type="number" placeholder="UK £" min="0" step="0.01" value={form.uk_cost} onChange={(e) => setForm({ ...form, uk_cost: e.target.value })} className="h-8 text-sm w-20 text-right" />
              <Input type="number" placeholder="Sell £" min="0" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} className="h-8 text-sm w-20 text-right" />
            </>
          )}
          <Input placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="h-8 text-sm w-24" />
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-8 text-sm w-24" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          <Button size="sm" className="h-8" onClick={handleSubmit} disabled={adding || !form.name.trim()}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
});

// Sortable table row
function SortableLibraryRow({
  part, isAdmin, isEditing, editForm, setEditForm, startEdit, saveEdit, cancelEdit,
  selected, toggleSelect, handleDelete,
}: {
  part: LibraryPart;
  isAdmin: boolean;
  isEditing: boolean;
  editForm: { name: string; unit_cost: string; sell_price: string; china_cost: string; uk_cost: string; supplier: string; part_number: string };
  setEditForm: (f: any) => void;
  startEdit: (p: LibraryPart) => void;
  saveEdit: () => void;
  cancelEdit: () => void;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  handleDelete: (ids: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: part.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const margin = part.sell_price > 0 ? ((part.sell_price - part.unit_cost) / part.sell_price) * 100 : 0;
  const costDiff = part.uk_cost - part.china_cost;

  return (
    <TableRow ref={setNodeRef} style={style} data-state={selected.has(part.id) ? "selected" : undefined}>
      <TableCell className="w-8 cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </TableCell>
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
        <>
          <TableCell className="text-right">
            {isEditing ? (
              <Input type="number" min="0" step="0.01" value={editForm.china_cost} onChange={(e) => setEditForm({ ...editForm, china_cost: e.target.value })} className="h-8 text-sm text-right w-24" />
            ) : <>£{Number(part.china_cost).toFixed(2)}</>}
          </TableCell>
          <TableCell className="text-right">
            {isEditing ? (
              <Input type="number" min="0" step="0.01" value={editForm.uk_cost} onChange={(e) => setEditForm({ ...editForm, uk_cost: e.target.value })} className="h-8 text-sm text-right w-24" />
            ) : <>£{Number(part.uk_cost).toFixed(2)}</>}
          </TableCell>
          <TableCell className={`text-right text-sm font-medium ${costDiff > 0 ? "text-green-600" : costDiff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {(part.china_cost > 0 || part.uk_cost > 0) ? (costDiff >= 0 ? `+£${costDiff.toFixed(2)}` : `-£${Math.abs(costDiff).toFixed(2)}`) : "—"}
          </TableCell>
          <TableCell className="text-right">
            {isEditing ? (
              <Input type="number" min="0" step="0.01" value={editForm.sell_price} onChange={(e) => setEditForm({ ...editForm, sell_price: e.target.value })} className="h-8 text-sm text-right w-24" />
            ) : <>£{Number(part.sell_price).toFixed(2)}</>}
          </TableCell>
          <TableCell className={`text-right text-sm font-medium ${margin > 0 ? "text-green-600" : margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {part.sell_price > 0 ? `${margin.toFixed(1)}%` : "—"}
          </TableCell>
        </>
      )}
      <TableCell>
        <div className="flex items-center gap-1 justify-end">
          {isAdmin && (
            isEditing ? (
              <>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={saveEdit}>Save</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelEdit}>Cancel</Button>
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
}

export default function PartsLibrary() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();
  const navigate = useNavigate();
  const isAdmin = userRole === "admin";

  const [parts, setParts] = useState<LibraryPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Add form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", unit_cost: "0", sell_price: "0", china_cost: "0", uk_cost: "0", category: "general", supplier: "", part_number: "" });

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unit_cost: "", sell_price: "", china_cost: "", uk_cost: "", supplier: "", part_number: "" });

  // Bulk import
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedParts, setParsedParts] = useState<ParsedLibraryPart[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fetchParts = async () => {
    const { data } = await supabase
      .from("parts_library")
      .select("*")
      .order("sort_order", { ascending: true });
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

  const isSearching = search.trim().length > 0;

  const handleAddAt = async (
    formData: { name: string; unit_cost: string; sell_price: string; china_cost: string; uk_cost: string; category: string; supplier: string; part_number: string },
    insertAfterIndex?: number,
  ) => {
    if (!formData.name.trim() || !user) return;
    let newSortOrder: number;
    if (insertAfterIndex !== undefined && insertAfterIndex >= 0 && parts.length > 0) {
      const afterPart = parts[insertAfterIndex];
      const nextPart = parts[insertAfterIndex + 1];
      if (nextPart) {
        newSortOrder = Math.floor((afterPart.sort_order + nextPart.sort_order) / 2);
        if (newSortOrder === afterPart.sort_order) {
          newSortOrder = afterPart.sort_order + 1;
          const updates = parts.slice(insertAfterIndex + 1).map((p, i) => ({
            id: p.id, sort_order: afterPart.sort_order + 2 + i,
          }));
          for (const u of updates) {
            await supabase.from("parts_library").update({ sort_order: u.sort_order } as any).eq("id", u.id);
          }
        }
      } else {
        newSortOrder = afterPart.sort_order + 1;
      }
    } else {
      newSortOrder = parts.length > 0 ? Math.max(...parts.map((p) => p.sort_order)) + 1 : 0;
    }

    const { error } = await supabase.from("parts_library").insert({
      name: formData.name.trim(),
      description: null,
      unit_cost: parseFloat(formData.unit_cost) || 0,
      sell_price: parseFloat(formData.sell_price) || 0,
      china_cost: parseFloat(formData.china_cost) || 0,
      uk_cost: parseFloat(formData.uk_cost) || 0,
      category: formData.category.trim() || "general",
      supplier: formData.supplier.trim() || null,
      part_number: formData.part_number.trim() || null,
      created_by: user.id,
      sort_order: newSortOrder,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchParts();
      toast({ title: "Part added to library" });
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !user) return;
    setAdding(true);
    await handleAddAt({
      name: form.name, unit_cost: form.unit_cost, sell_price: form.sell_price,
      china_cost: form.china_cost, uk_cost: form.uk_cost,
      category: form.category, supplier: form.supplier, part_number: form.part_number,
    });
    setForm({ name: "", description: "", unit_cost: "0", sell_price: "0", china_cost: "0", uk_cost: "0", category: "general", supplier: "", part_number: "" });
    setAdding(false);
  };

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    const deletedParts = parts.filter((p) => ids.includes(p.id));
    setParts((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelected(new Set());
    deleteWithUndo({
      key: `lib-${ids.join(",")}`,
      label: `${ids.length} part(s) removed`,
      onConfirm: async () => {
        const { error } = await supabase.from("parts_library").delete().in("id", ids);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setParts((prev) => [...prev, ...deletedParts].sort((a, b) => a.sort_order - b.sort_order));
        }
      },
      onUndo: () => setParts((prev) => [...prev, ...deletedParts].sort((a, b) => a.sort_order - b.sort_order)),
    });
  };

  const startEdit = (part: LibraryPart) => {
    setEditingId(part.id);
    setEditForm({
      name: part.name,
      unit_cost: String(part.unit_cost),
      sell_price: String(part.sell_price),
      china_cost: String(part.china_cost),
      uk_cost: String(part.uk_cost),
      supplier: part.supplier || "",
      part_number: part.part_number || "",
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    const oldPart = parts.find((p) => p.id === editingId);
    const oldPayload = oldPart ? {
      name: oldPart.name, unit_cost: oldPart.unit_cost, sell_price: oldPart.sell_price,
      china_cost: oldPart.china_cost, uk_cost: oldPart.uk_cost,
      supplier: oldPart.supplier, part_number: oldPart.part_number,
    } : null;
    const editId = editingId;
    const { error } = await supabase.from("parts_library").update({
      name: editForm.name.trim(),
      unit_cost: parseFloat(editForm.unit_cost) || 0,
      sell_price: parseFloat(editForm.sell_price) || 0,
      china_cost: parseFloat(editForm.china_cost) || 0,
      uk_cost: parseFloat(editForm.uk_cost) || 0,
      supplier: editForm.supplier.trim() || null,
      part_number: editForm.part_number.trim() || null,
    } as any).eq("id", editId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEditingId(null);
      fetchParts();
      editWithUndo({
        label: "Part updated",
        onUndo: async () => {
          if (oldPayload) {
            await supabase.from("parts_library").update(oldPayload as any).eq("id", editId);
            fetchParts();
          }
        },
      });
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parts.findIndex((p) => p.id === active.id);
    const newIndex = parts.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(parts, oldIndex, newIndex);

    setParts(reordered);

    const updates = reordered.map((p, i) => ({ id: p.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from("parts_library").update({ sort_order: u.sort_order } as any).eq("id", u.id);
    }
  };

  // Column count for inline add row
  const colCount = 7 + (isAdmin ? 3 : 0); // grip + checkbox(admin) + name + part# + supplier + category + cost + sell(admin) + margin(admin) + actions

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
    const maxOrder = parts.length > 0 ? Math.max(...parts.map((p) => p.sort_order)) : -1;
    const rows = items.map((p, i) => ({
      name: p.name.trim(),
      description: p.description.trim() || null,
      unit_cost: p.unit_cost || 0,
      sell_price: p.sell_price || 0,
      category: p.category.trim() || "general",
      supplier: p.supplier.trim() || null,
      part_number: p.part_number.trim() || null,
      created_by: user.id,
      sort_order: maxOrder + 1 + i,
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredParts.map((p) => p.id)} strategy={verticalListSortingStrategy} disabled={isSearching}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
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
                {!isSearching && (
                  <InlineAddRow
                    isAdmin={isAdmin}
                    colSpan={colCount}
                    onAdd={(f) => handleAddAt(f, -1)}
                  />
                )}
                {filteredParts.map((part, idx) => (
                  <>
                    <SortableLibraryRow
                      key={part.id}
                      part={part}
                      isAdmin={isAdmin}
                      isEditing={editingId === part.id}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      startEdit={startEdit}
                      saveEdit={saveEdit}
                      cancelEdit={cancelEdit}
                      selected={selected}
                      toggleSelect={toggleSelect}
                      handleDelete={handleDelete}
                    />
                    {!isSearching && (
                      <InlineAddRow
                        key={`add-${part.id}`}
                        isAdmin={isAdmin}
                        colSpan={colCount}
                        onAdd={(f) => handleAddAt(f, idx)}
                      />
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
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
