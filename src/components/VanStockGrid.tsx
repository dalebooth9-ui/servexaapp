import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, RefreshCw, AlertCircle, Loader2, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export interface VanStockRow {
  id: string;
  engineer_id: string;
  part_id: string;
  quantity: number;
  min_quantity: number;
  last_restocked: string | null;
  parts_library: { name: string; part_number: string | null; unit_cost: number } | null;
}

export function stockColour(qty: number, min: number) {
  if (qty <= 0 || qty < min) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (qty === min) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
}

interface Props {
  engineerId: string;
  isOwnVan?: boolean;
  isAdmin?: boolean;
  orgId?: string | null;
}

export default function VanStockGrid({ engineerId, isOwnVan, isAdmin, orgId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<VanStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [parts, setParts] = useState<{ id: string; name: string; part_number: string | null }[]>([]);
  const [newPartId, setNewPartId] = useState("");
  const [newQty, setNewQty] = useState("5");
  const [newMin, setNewMin] = useState("2");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("van_stock")
      .select("id,engineer_id,part_id,quantity,min_quantity,last_restocked,parts_library(name,part_number,unit_cost)")
      .eq("engineer_id", engineerId)
      .order("created_at", { ascending: true });
    setRows((data as any) || []);
    setLoading(false);
  }, [engineerId]);

  useEffect(() => { load(); }, [load]);

  const loadParts = async () => {
    const { data } = await supabase.from("parts_library").select("id,name,part_number").order("name");
    setParts(data || []);
  };

  const logTx = async (row: VanStockRow, type: string, change: number, notes?: string, status: "pending" | "completed" = "completed") => {
    await supabase.from("stock_transactions").insert({
      org_id: orgId ?? null,
      van_stock_id: row.id,
      engineer_id: user!.id,
      transaction_type: type,
      quantity_change: change,
      notes: notes ?? null,
      status,
    });
  };

  const adjust = async (row: VanStockRow, delta: number, type: "used" | "restocked" | "adjustment") => {
    const next = Math.max(0, row.quantity + delta);
    const updates: any = { quantity: next };
    if (type === "restocked") updates.last_restocked = new Date().toISOString();
    const { error } = await supabase.from("van_stock").update(updates).eq("id", row.id);
    if (error) { toast({ title: "Update failed", variant: "destructive" }); return; }
    await logTx(row, type, delta);
    toast({ title: type === "used" ? "Part used" : type === "restocked" ? "Restocked" : "Adjusted" });
    load();
  };

  const requestRestock = async (row: VanStockRow) => {
    await logTx(row, "restock_requested", 0, `Restock requested for ${row.parts_library?.name}`, "pending");
    toast({ title: "Restock requested", description: "An admin has been notified." });
  };

  const addPart = async () => {
    if (!newPartId) return;
    const { error } = await supabase.from("van_stock").insert({
      org_id: orgId ?? null,
      engineer_id: engineerId,
      part_id: newPartId,
      quantity: parseInt(newQty || "0", 10),
      min_quantity: parseInt(newMin || "2", 10),
      last_restocked: new Date().toISOString(),
    });
    if (error) { toast({ title: "Add failed", description: error.message, variant: "destructive" }); return; }
    setAddOpen(false); setNewPartId(""); setNewQty("5"); setNewMin("2");
    load();
  };

  const removeRow = async (row: VanStockRow) => {
    await supabase.from("van_stock").delete().eq("id", row.id);
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Truck className="h-4 w-4" /> {rows.length} parts tracked
        </div>
        {(isOwnVan || isAdmin) && (
          <Button size="sm" onClick={() => { loadParts(); setAddOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add Part
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No parts assigned to this van yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => {
            const low = r.quantity < r.min_quantity || r.quantity === 0;
            return (
              <Card key={r.id} className={`p-4 border ${stockColour(r.quantity, r.min_quantity)}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-foreground">{r.parts_library?.name}</div>
                    {r.parts_library?.part_number && (
                      <div className="text-xs text-muted-foreground">#{r.parts_library.part_number}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-base font-bold">{r.quantity}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-3">Min: {r.min_quantity}</div>
                <div className="flex flex-wrap gap-2">
                  {(isOwnVan || isAdmin) && (
                    <>
                      <Button size="sm" variant="secondary" className="h-9" onClick={() => adjust(r, -1, "used")} disabled={r.quantity <= 0}>
                        <Minus className="h-4 w-4 mr-1" /> Use
                      </Button>
                      <Button size="sm" variant="secondary" className="h-9" onClick={() => adjust(r, 1, "restocked")}>
                        <Plus className="h-4 w-4 mr-1" /> Restock
                      </Button>
                    </>
                  )}
                  {isOwnVan && low && (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => requestRestock(r)}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Request
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" className="h-9 text-destructive" onClick={() => removeRow(r)}>
                      Remove
                    </Button>
                  )}
                </div>
                {low && (
                  <div className="flex items-center gap-1 mt-2 text-xs">
                    <AlertCircle className="h-3 w-3" /> Below minimum
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add part to van</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Part</Label>
              <Select value={newPartId} onValueChange={setNewPartId}>
                <SelectTrigger><SelectValue placeholder="Select a part" /></SelectTrigger>
                <SelectContent>
                  {parts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.part_number ? ` (#${p.part_number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity</Label><Input type="number" min={0} value={newQty} onChange={(e) => setNewQty(e.target.value)} /></div>
              <div><Label>Min level</Label><Input type="number" min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addPart} disabled={!newPartId}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
