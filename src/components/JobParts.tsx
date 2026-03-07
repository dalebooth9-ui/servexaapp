import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Package, Upload, Download, Pencil, Library, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUndoAction } from "@/hooks/useUndoAction";
import ImportPartsDialog from "@/components/ImportPartsDialog";
import PartsLibraryPicker from "@/components/PartsLibraryPicker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


interface JobPart {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  sell_price: number;
  total_cost: number;
  notes: string | null;
  added_by: string;
  created_at: string;
  sort_order: number;
}

// Inline add row shown between parts
function InlineAddRow({
  isAdmin,
  onAdd,
  colSpan,
}: {
  isAdmin: boolean;
  onAdd: (form: { name: string; quantity: string; unit_cost: string; sell_price: string; notes: string }) => Promise<void>;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: "1", unit_cost: "0", sell_price: "0", notes: "" });
  const [adding, setAdding] = useState(false);

  if (!open) {
    return (
      <tr>
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
    setForm({ name: "", quantity: "1", unit_cost: "0", sell_price: "0", notes: "" });
    setOpen(false);
    setAdding(false);
  };

  return (
    <tr className="bg-muted/30">
      <td colSpan={colSpan}>
        <div className="flex flex-wrap gap-2 items-center py-1 px-2">
          <Input
            placeholder="Part name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-sm flex-1 min-w-[120px]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <Input
            type="number" placeholder="Qty" min="0" step="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="h-8 text-sm w-16 text-right"
          />
          {isAdmin && (
            <>
              <Input
                type="number" placeholder="Unit £" min="0" step="0.01"
                value={form.unit_cost}
                onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                className="h-8 text-sm w-20 text-right"
              />
              <Input
                type="number" placeholder="Sell £" min="0" step="0.01"
                value={form.sell_price}
                onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                className="h-8 text-sm w-20 text-right"
              />
            </>
          )}
          <Input
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="h-8 text-sm flex-1 min-w-[80px]"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <Button size="sm" className="h-8" onClick={handleSubmit} disabled={adding || !form.name.trim()}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
}

// Sortable table row
function SortablePartRow({
  part, isAdmin, isEditing, editForm, setEditForm, startEdit, cancelEdit, saveEdit,
  selected, toggleSelect, handleDelete, user,
}: {
  part: JobPart;
  isAdmin: boolean;
  isEditing: boolean;
  editForm: { quantity: string; unit_cost: string; sell_price: string };
  setEditForm: (f: any) => void;
  startEdit: (p: JobPart) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  handleDelete: (id: string) => void;
  user: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: part.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sellPrice = part.sell_price || 0;
  const sellTotal = sellPrice * part.quantity;
  const profit = (sellPrice - part.unit_cost) * part.quantity;
  const margin = sellTotal > 0 ? (profit / sellTotal) * 100 : 0;

  return (
    <TableRow ref={setNodeRef} style={style} data-state={selected.has(part.id) ? "selected" : undefined}>
      <TableCell className="w-8 cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      <TableCell>
        <Checkbox checked={selected.has(part.id)} onCheckedChange={() => toggleSelect(part.id)} />
      </TableCell>
      <TableCell className="font-medium">{part.name}</TableCell>
      <TableCell className="text-right">
        {isEditing ? (
          <Input type="number" min="0" step="1" className="w-20 h-8 text-right text-sm"
            value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
        ) : part.quantity}
      </TableCell>
      {isAdmin && (
        <>
          <TableCell className="text-right">
            {isEditing ? (
              <Input type="number" min="0" step="0.01" className="w-24 h-8 text-right text-sm"
                value={editForm.unit_cost} onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })} />
            ) : <>£{Number(part.unit_cost).toFixed(2)}</>}
          </TableCell>
          <TableCell className="text-right font-medium">£{Number(part.total_cost).toFixed(2)}</TableCell>
          <TableCell className="text-right">
            {isEditing ? (
              <Input type="number" min="0" step="0.01" className="w-24 h-8 text-right text-sm"
                value={editForm.sell_price} onChange={(e) => setEditForm({ ...editForm, sell_price: e.target.value })} />
            ) : <>£{Number(sellPrice).toFixed(2)}</>}
          </TableCell>
          <TableCell className="text-right font-medium">£{sellTotal.toFixed(2)}</TableCell>
          <TableCell className={`text-right font-semibold ${profit > 0 ? "text-green-600" : profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            £{profit.toFixed(2)}
          </TableCell>
          <TableCell className={`text-right text-sm font-medium ${margin > 0 ? "text-green-600" : margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {sellTotal > 0 ? `${margin.toFixed(1)}%` : "—"}
          </TableCell>
        </>
      )}
      <TableCell className="text-muted-foreground text-sm">{part.notes || "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 justify-end">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={saveEdit}>Save</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelEdit}>Cancel</Button>
            </>
          ) : (
            <button onClick={() => startEdit(part)} className="text-muted-foreground hover:text-primary">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {(isAdmin || part.added_by === user?.id) && !isEditing && (
            <button onClick={() => handleDelete(part.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function JobParts({ jobId, jobCategory }: { jobId: string; jobCategory?: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { deleteWithUndo, editWithUndo } = useUndoAction();
  const [parts, setParts] = useState<JobPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: "", unit_cost: "0", sell_price: "0", notes: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", unit_cost: "", sell_price: "" });

  const isAdmin = userRole === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fetchParts = async () => {
    const { data } = await supabase
      .from("job_parts" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true });
    setParts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchParts(); }, [jobId]);

  const handleAddAt = async (
    formData: { name: string; quantity: string; unit_cost: string; sell_price: string; notes: string },
    insertAfterIndex?: number,
  ) => {
    if (!formData.name.trim() || !user) return;
    // Calculate sort_order
    let newSortOrder: number;
    if (insertAfterIndex === -1 && parts.length > 0) {
      // Insert before the first item
      const firstPart = parts[0];
      newSortOrder = firstPart.sort_order - 1;
    } else if (insertAfterIndex !== undefined && insertAfterIndex >= 0 && parts.length > 0) {
      const afterPart = parts[insertAfterIndex];
      const nextPart = parts[insertAfterIndex + 1];
      if (nextPart) {
        newSortOrder = Math.floor((afterPart.sort_order + nextPart.sort_order) / 2);
        // If they're adjacent integers, re-index everything
        if (newSortOrder === afterPart.sort_order) {
          newSortOrder = afterPart.sort_order + 1;
          // Shift all subsequent parts
          const updates = parts.slice(insertAfterIndex + 1).map((p, i) => ({
            id: p.id,
            sort_order: afterPart.sort_order + 2 + i,
          }));
          for (const u of updates) {
            await supabase.from("job_parts" as any).update({ sort_order: u.sort_order } as any).eq("id", u.id);
          }
        }
      } else {
        newSortOrder = afterPart.sort_order + 1;
      }
    } else {
      newSortOrder = parts.length > 0 ? Math.max(...parts.map((p) => p.sort_order)) + 1 : 0;
    }

    const { error } = await supabase.from("job_parts" as any).insert({
      job_id: jobId,
      name: formData.name.trim(),
      quantity: parseFloat(formData.quantity) || 1,
      unit_cost: parseFloat(formData.unit_cost) || 0,
      sell_price: parseFloat(formData.sell_price) || 0,
      notes: formData.notes.trim() || null,
      added_by: user.id,
      sort_order: newSortOrder,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchParts();
      toast({ title: "Part added" });
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !user) return;
    setAdding(true);
    await handleAddAt(form);
    setForm({ name: "", quantity: "", unit_cost: "0", sell_price: "0", notes: "" });
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    const deletedPart = parts.find((p) => p.id === id);
    if (!deletedPart) return;
    setParts((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    deleteWithUndo({
      key: id,
      label: "Part removed",
      onConfirm: async () => {
        const { error } = await supabase.from("job_parts" as any).delete().eq("id", id);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setParts((prev) => [...prev, deletedPart].sort((a, b) => a.sort_order - b.sort_order));
        }
      },
      onUndo: () => setParts((prev) => [...prev, deletedPart].sort((a, b) => a.sort_order - b.sort_order)),
    });
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!ids.length) return;
    const deletedParts = parts.filter((p) => ids.includes(p.id));
    setParts((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelected(new Set());
    deleteWithUndo({
      key: `bulk-parts-${ids.join(",")}`,
      label: `${ids.length} part(s) removed`,
      onConfirm: async () => {
        const { error } = await supabase.from("job_parts" as any).delete().in("id", ids);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          setParts((prev) => [...prev, ...deletedParts].sort((a, b) => a.sort_order - b.sort_order));
        }
      },
      onUndo: () => setParts((prev) => [...prev, ...deletedParts].sort((a, b) => a.sort_order - b.sort_order)),
    });
  };

  const startEdit = (part: JobPart) => {
    setEditingId(part.id);
    setEditForm({
      quantity: String(part.quantity),
      unit_cost: String(part.unit_cost),
      sell_price: String(part.sell_price || 0),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ quantity: "", unit_cost: "", sell_price: "" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const oldPart = parts.find((p) => p.id === editingId);
    const oldPayload = oldPart ? {
      quantity: oldPart.quantity, unit_cost: oldPart.unit_cost, sell_price: oldPart.sell_price || 0,
    } : null;
    const editId = editingId;
    const qty = parseFloat(editForm.quantity) || 0;
    const unitCost = parseFloat(editForm.unit_cost) || 0;
    const sellPrice = parseFloat(editForm.sell_price) || 0;

    const { error } = await supabase
      .from("job_parts" as any)
      .update({ quantity: qty, unit_cost: unitCost, sell_price: sellPrice } as any)
      .eq("id", editId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      cancelEdit();
      fetchParts();
      editWithUndo({
        label: "Part updated",
        onUndo: async () => {
          if (oldPayload) {
            await supabase.from("job_parts" as any).update(oldPayload as any).eq("id", editId);
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
    if (selected.size === parts.length) setSelected(new Set());
    else setSelected(new Set(parts.map((p) => p.id)));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parts.findIndex((p) => p.id === active.id);
    const newIndex = parts.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(parts, oldIndex, newIndex);

    // Optimistic update
    setParts(reordered);

    // Persist new order
    const updates = reordered.map((p, i) => ({ id: p.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from("job_parts" as any).update({ sort_order: u.sort_order } as any).eq("id", u.id);
    }
  };

  const totalCost = parts.reduce((sum, p) => sum + (p.total_cost || 0), 0);
  const totalSellValue = parts.reduce((sum, p) => sum + ((p.sell_price || 0) * p.quantity), 0);
  const totalProfit = totalSellValue - totalCost;

  // Column count for inline add row span
  const colCount = 5 + (isAdmin ? 6 : 0); // grip + checkbox + name + qty + notes + actions + admin cols

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading parts...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[150px]">
          <Input placeholder="Part / material name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="w-20">
          <Input type="number" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} min="0" step="1" />
        </div>
        {isAdmin && (
          <>
            <div className="w-24">
              <Input type="number" placeholder="Unit £" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} min="0" step="0.01" />
            </div>
            <div className="w-24">
              <Input type="number" placeholder="Sell £" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} min="0" step="0.01" />
            </div>
          </>
        )}
        <div className="flex-1 min-w-[120px]">
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Button onClick={handleAdd} disabled={adding || !form.name.trim()} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1 h-4 w-4" /> Import
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
          <Library className="mr-1 h-4 w-4" /> From Library
        </Button>
        {parts.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => {
            const headers = ["Part / Material", "Quantity", "Unit Cost", "Sell Price", "Total Cost", "Profit", "Notes"];
            const rows = parts.map(p => {
              const sell = p.sell_price || 0;
              const profit = (sell - p.unit_cost) * p.quantity;
              return [
                `"${(p.name || "").replace(/"/g, '""')}"`,
                p.quantity,
                Number(p.unit_cost).toFixed(2),
                Number(sell).toFixed(2),
                Number(p.total_cost).toFixed(2),
                profit.toFixed(2),
                `"${(p.notes || "").replace(/"/g, '""')}"`,
              ].join(",");
            });
            const csv = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `parts-${jobId.slice(0, 8)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        )}
      </div>

      {parts.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No parts or materials logged yet.</p>
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-1 h-4 w-4" /> Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selected.size} part(s)?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleBulkDelete(Array.from(selected))}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                    <Trash2 className="mr-1 h-4 w-4" /> Delete All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all {parts.length} parts?</AlertDialogTitle>
                    <AlertDialogDescription>This will remove every part and material from this job. This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleBulkDelete(parts.map((p) => p.id))}>Delete All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={parts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="w-10">
                      <Checkbox checked={selected.size === parts.length && parts.length > 0} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Part / Material</TableHead>
                    <TableHead className="text-right w-20">Qty</TableHead>
                    {isAdmin && (
                      <>
                        <TableHead className="text-right w-24">Unit Cost</TableHead>
                        <TableHead className="text-right w-24">Total Cost</TableHead>
                        <TableHead className="text-right w-24">Sell Price</TableHead>
                        <TableHead className="text-right w-24">Sell Total</TableHead>
                        <TableHead className="text-right w-24">Profit</TableHead>
                        <TableHead className="text-right w-20">Margin</TableHead>
                      </>
                    )}
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <InlineAddRow
                    key="add-top"
                    isAdmin={isAdmin}
                    colSpan={colCount}
                    onAdd={(f) => handleAddAt(f, -1)}
                  />
                  {parts.map((part, idx) => (
                    <>
                      <SortablePartRow
                        key={part.id}
                        part={part}
                        isAdmin={isAdmin}
                        isEditing={editingId === part.id}
                        editForm={editForm}
                        setEditForm={setEditForm}
                        startEdit={startEdit}
                        cancelEdit={cancelEdit}
                        saveEdit={saveEdit}
                        selected={selected}
                        toggleSelect={toggleSelect}
                        handleDelete={handleDelete}
                        user={user}
                      />
                      <InlineAddRow
                        key={`add-${part.id}`}
                        isAdmin={isAdmin}
                        colSpan={colCount}
                        onAdd={(f) => handleAddAt(f, idx)}
                      />
                    </>
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>

          {isAdmin && (
            <div className="flex justify-end gap-6 text-sm font-semibold">
              <span>Cost: £{totalCost.toFixed(2)}</span>
              <span>Sell: £{totalSellValue.toFixed(2)}</span>
              <span className={totalProfit > 0 ? "text-green-600" : totalProfit < 0 ? "text-destructive" : ""}>
                Profit: £{totalProfit.toFixed(2)}
              </span>
              <span className={totalSellValue > 0 ? (totalProfit / totalSellValue * 100 > 0 ? "text-green-600" : "text-destructive") : "text-muted-foreground"}>
                Margin: {totalSellValue > 0 ? `${(totalProfit / totalSellValue * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          )}
        </>
      )}
  <ImportPartsDialog open={importOpen} onOpenChange={setImportOpen} jobId={jobId} onImported={fetchParts} />
      <PartsLibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        jobId={jobId}
        onAdded={fetchParts}
        listType={jobCategory?.includes("install") ? "install" : "general"}
      />
    </div>
  );
}
