import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Stock { id: string; quantity: number; part_id: string; parts_library: { name: string; unit_cost: number } | null; }
interface UsedRow { id: string; quantity_change: number; van_stock_id: string; notes: string | null; parts?: { name: string } | null; }

export default function JobPartsUsed({ jobId }: { jobId: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [used, setUsed] = useState<UsedRow[]>([]);
  const [selStock, setSelStock] = useState("");
  const [qty, setQty] = useState("1");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("org_id").eq("user_id", user.id).maybeSingle();
      setOrgId(prof?.org_id || null);
      const isAdmin = userRole === "admin";
      const stockQ = supabase.from("van_stock").select("id,quantity,part_id,parts_library(name,unit_cost)");
      const { data: stk } = isAdmin ? await stockQ : await stockQ.eq("engineer_id", user.id);
      setStocks((stk as any) || []);
      await loadUsed();
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [user, jobId]);

  const loadUsed = async () => {
    const { data } = await supabase
      .from("stock_transactions")
      .select("id,quantity_change,van_stock_id,notes")
      .eq("job_id", jobId)
      .eq("transaction_type", "used")
      .order("created_at", { ascending: false });
    if (!data) { setUsed([]); return; }
    // hydrate part names
    const stockIds = [...new Set(data.map((d) => d.van_stock_id).filter(Boolean))];
    let nameMap: Record<string, string> = {};
    if (stockIds.length) {
      const { data: rows } = await supabase.from("van_stock").select("id,parts_library(name)").in("id", stockIds);
      (rows as any[] | null)?.forEach((r) => { nameMap[r.id] = r.parts_library?.name; });
    }
    setUsed(data.map((d) => ({ ...d, parts: nameMap[d.van_stock_id] ? { name: nameMap[d.van_stock_id] } : null })));
  };

  const logUsage = async () => {
    const stock = stocks.find((s) => s.id === selStock);
    const q = parseInt(qty || "0", 10);
    if (!stock || q <= 0) return;
    if (q > stock.quantity) { toast({ title: `Only ${stock.quantity} in van`, variant: "destructive" }); return; }
    await supabase.from("van_stock").update({ quantity: stock.quantity - q }).eq("id", stock.id);
    await supabase.from("stock_transactions").insert({
      org_id: orgId, van_stock_id: stock.id, engineer_id: user!.id, job_id: jobId,
      transaction_type: "used", quantity_change: -q, notes: `Used on job`,
    });
    toast({ title: "Part recorded" });
    setSelStock(""); setQty("1");
    // refresh stocks + used
    const stockQ = supabase.from("van_stock").select("id,quantity,part_id,parts_library(name,unit_cost)");
    const { data: stk } = userRole === "admin" ? await stockQ : await stockQ.eq("engineer_id", user!.id);
    setStocks((stk as any) || []);
    loadUsed();
  };

  const removeUsage = async (row: UsedRow) => {
    // restore stock
    const stock = stocks.find((s) => s.id === row.van_stock_id);
    if (stock) await supabase.from("van_stock").update({ quantity: stock.quantity + Math.abs(row.quantity_change) }).eq("id", stock.id);
    await supabase.from("stock_transactions").delete().eq("id", row.id);
    loadUsed();
  };

  if (loading) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Parts Used</h3>
        <Badge variant="outline">{used.length}</Badge>
      </div>

      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Part from van</Label>
          <Select value={selStock} onValueChange={setSelStock}>
            <SelectTrigger><SelectValue placeholder={stocks.length ? "Select part" : "No van stock"} /></SelectTrigger>
            <SelectContent>
              {stocks.map((s) => (
                <SelectItem key={s.id} value={s.id} disabled={s.quantity <= 0}>
                  {s.parts_library?.name} ({s.quantity} in van)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Label className="text-xs">Qty</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <Button onClick={logUsage} disabled={!selStock}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {used.length === 0 ? (
        <div className="text-sm text-muted-foreground">No parts logged for this job yet.</div>
      ) : (
        <div className="space-y-1">
          {used.map((u) => (
            <div key={u.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
              <span>{u.parts?.name || "Part"} × {Math.abs(u.quantity_change)}</span>
              <Button size="sm" variant="ghost" onClick={() => removeUsage(u)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
