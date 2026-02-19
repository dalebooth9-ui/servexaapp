import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Package, Upload, Download, Pencil, Library } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImportPartsDialog from "@/components/ImportPartsDialog";
import PartsLibraryPicker from "@/components/PartsLibraryPicker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
}

export default function JobParts({ jobId }: { jobId: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [parts, setParts] = useState<JobPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: "1", unit_cost: "0", sell_price: "0", notes: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", unit_cost: "", sell_price: "" });

  const isAdmin = userRole === "admin";

  const fetchParts = async () => {
    const { data } = await supabase
      .from("job_parts" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setParts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchParts(); }, [jobId]);

  const handleAdd = async () => {
    if (!form.name.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from("job_parts" as any).insert({
      job_id: jobId,
      name: form.name.trim(),
      quantity: parseFloat(form.quantity) || 1,
      unit_cost: parseFloat(form.unit_cost) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      notes: form.notes.trim() || null,
      added_by: user.id,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setForm({ name: "", quantity: "1", unit_cost: "0", sell_price: "0", notes: "" });
      fetchParts();
      toast({ title: "Part added" });
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("job_parts" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setParts((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast({ title: "Part removed" });
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("job_parts" as any).delete().in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setParts((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelected(new Set());
      toast({ title: `${ids.length} part(s) removed` });
    }
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
    const qty = parseFloat(editForm.quantity) || 0;
    const unitCost = parseFloat(editForm.unit_cost) || 0;
    const sellPrice = parseFloat(editForm.sell_price) || 0;

    const { error } = await supabase
      .from("job_parts" as any)
      .update({ quantity: qty, unit_cost: unitCost, sell_price: sellPrice } as any)
      .eq("id", editingId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Part updated" });
      cancelEdit();
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
    if (selected.size === parts.length) setSelected(new Set());
    else setSelected(new Set(parts.map((p) => p.id)));
  };

  const totalCost = parts.reduce((sum, p) => sum + (p.total_cost || 0), 0);
  const totalSellValue = parts.reduce((sum, p) => sum + ((p.sell_price || 0) * p.quantity), 0);
  const totalProfit = totalSellValue - totalCost;

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
        <div className="w-24">
          <Input type="number" placeholder="Unit £" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} min="0" step="0.01" />
        </div>
        {isAdmin && (
          <div className="w-24">
            <Input type="number" placeholder="Sell £" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} min="0" step="0.01" />
          </div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === parts.length && parts.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Part / Material</TableHead>
                <TableHead className="text-right w-20">Qty</TableHead>
                <TableHead className="text-right w-24">Unit Cost</TableHead>
                <TableHead className="text-right w-24">Total Cost</TableHead>
                {isAdmin && (
                  <>
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
              {parts.map((part) => {
                const isEditing = editingId === part.id;
                const sellPrice = part.sell_price || 0;
                const sellTotal = sellPrice * part.quantity;
                const profit = (sellPrice - part.unit_cost) * part.quantity;
                const margin = sellTotal > 0 ? (profit / sellTotal) * 100 : 0;

                return (
                  <TableRow key={part.id} data-state={selected.has(part.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(part.id)} onCheckedChange={() => toggleSelect(part.id)} />
                    </TableCell>
                    <TableCell className="font-medium">{part.name}</TableCell>

                    {/* Quantity */}
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number" min="0" step="1"
                          className="w-20 h-8 text-right text-sm"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                        />
                      ) : part.quantity}
                    </TableCell>

                    {/* Unit Cost */}
                    <TableCell className="text-right">
                      {isEditing && isAdmin ? (
                        <Input
                          type="number" min="0" step="0.01"
                          className="w-24 h-8 text-right text-sm"
                          value={editForm.unit_cost}
                          onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })}
                        />
                      ) : (
                        <>£{Number(part.unit_cost).toFixed(2)}</>
                      )}
                    </TableCell>

                    {/* Total Cost */}
                    <TableCell className="text-right font-medium">
                      £{Number(part.total_cost).toFixed(2)}
                    </TableCell>

                    {/* Admin-only: Sell Price, Sell Total, Profit */}
                    {isAdmin && (
                      <>
                        <TableCell className="text-right">
                          {isEditing && isAdmin ? (
                            <Input
                              type="number" min="0" step="0.01"
                              className="w-24 h-8 text-right text-sm"
                              value={editForm.sell_price}
                              onChange={(e) => setEditForm({ ...editForm, sell_price: e.target.value })}
                            />
                          ) : (
                            <>£{Number(sellPrice).toFixed(2)}</>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          £{sellTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${profit > 0 ? "text-green-600" : profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          £{profit.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right text-sm font-medium ${margin > 0 ? "text-green-600" : margin < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {sellTotal > 0 ? `${margin.toFixed(1)}%` : "—"}
                        </TableCell>
                      </>
                    )}

                    <TableCell className="text-muted-foreground text-sm">{part.notes || "—"}</TableCell>

                    {/* Actions */}
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
              })}
            </TableBody>
          </Table>

          {/* Totals row */}
          <div className="flex justify-end gap-6 text-sm font-semibold">
            <span>Cost: £{totalCost.toFixed(2)}</span>
            {isAdmin && (
              <>
                <span>Sell: £{totalSellValue.toFixed(2)}</span>
                <span className={totalProfit > 0 ? "text-green-600" : totalProfit < 0 ? "text-destructive" : ""}>
                  Profit: £{totalProfit.toFixed(2)}
                </span>
                <span className={totalSellValue > 0 ? (totalProfit / totalSellValue * 100 > 0 ? "text-green-600" : "text-destructive") : "text-muted-foreground"}>
                  Margin: {totalSellValue > 0 ? `${(totalProfit / totalSellValue * 100).toFixed(1)}%` : "—"}
                </span>
              </>
            )}
          </div>
        </>
      )}
      <ImportPartsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        jobId={jobId}
        onImported={fetchParts}
      />
      <PartsLibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        jobId={jobId}
        onAdded={fetchParts}
      />
    </div>
  );
}
