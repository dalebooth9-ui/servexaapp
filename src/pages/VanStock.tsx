import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Truck, AlertCircle, RefreshCw, CheckCircle2, Loader2, ArrowRightLeft } from "lucide-react";
import VanStockGrid, { stockColour } from "@/components/VanStockGrid";
import { useToast } from "@/hooks/use-toast";

interface Engineer { user_id: string; full_name: string; org_id: string | null; }
interface VanRow { id: string; engineer_id: string; quantity: number; min_quantity: number; part_id: string; parts_library: { name: string } | null; }
interface RestockRequest { id: string; engineer_id: string; van_stock_id: string; notes: string | null; created_at: string; status: string; }

export default function VanStock() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [stocks, setStocks] = useState<VanRow[]>([]);
  const [requests, setRequests] = useState<RestockRequest[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Transfer dialog
  const [xferOpen, setXferOpen] = useState(false);
  const [xferStockId, setXferStockId] = useState("");
  const [xferTo, setXferTo] = useState("");
  const [xferQty, setXferQty] = useState("1");

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("org_id").eq("user_id", user.id).maybeSingle();
      setOrgId(prof?.org_id || null);

      if (isAdmin) {
        const [{ data: engs }, { data: st }, { data: rq }] = await Promise.all([
          supabase.from("profiles").select("user_id,full_name,org_id").order("full_name"),
          supabase.from("van_stock").select("id,engineer_id,quantity,min_quantity,part_id,parts_library(name)"),
          supabase.from("stock_transactions").select("id,engineer_id,van_stock_id,notes,created_at,status").eq("transaction_type", "restock_requested").eq("status", "pending").order("created_at", { ascending: false }),
        ]);
        setEngineers((engs as any) || []);
        setStocks((st as any) || []);
        setRequests((rq as any) || []);
        if (engs && engs[0]) setSelectedEngineer(engs[0].user_id);
      } else {
        setSelectedEngineer(user.id);
      }
      setLoading(false);
    })();
  }, [user, isAdmin]);

  const refresh = async () => {
    const [{ data: st }, { data: rq }] = await Promise.all([
      supabase.from("van_stock").select("id,engineer_id,quantity,min_quantity,part_id,parts_library(name)"),
      supabase.from("stock_transactions").select("id,engineer_id,van_stock_id,notes,created_at,status").eq("transaction_type", "restock_requested").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setStocks((st as any) || []);
    setRequests((rq as any) || []);
  };

  const approveRequest = async (req: RestockRequest) => {
    const stock = stocks.find((s) => s.id === req.van_stock_id);
    if (!stock) return;
    await supabase.from("van_stock").update({
      quantity: stock.quantity + Math.max(stock.min_quantity * 2 - stock.quantity, 1),
      last_restocked: new Date().toISOString(),
    }).eq("id", stock.id);
    await supabase.from("stock_transactions").update({ status: "completed" }).eq("id", req.id);
    await supabase.from("stock_transactions").insert({
      org_id: orgId, van_stock_id: stock.id, engineer_id: req.engineer_id,
      transaction_type: "restock_approved", quantity_change: 0, notes: "Approved by admin", status: "completed",
    });
    toast({ title: "Restock approved" });
    refresh();
  };

  const rejectRequest = async (req: RestockRequest) => {
    await supabase.from("stock_transactions").update({ status: "rejected" }).eq("id", req.id);
    toast({ title: "Request rejected" });
    refresh();
  };

  const doTransfer = async () => {
    const fromStock = stocks.find((s) => s.id === xferStockId);
    const qty = parseInt(xferQty || "0", 10);
    if (!fromStock || !xferTo || qty <= 0 || qty > fromStock.quantity) {
      toast({ title: "Invalid transfer", variant: "destructive" }); return;
    }
    // Find or create destination van_stock row
    const { data: existing } = await supabase.from("van_stock").select("*").eq("engineer_id", xferTo).eq("part_id", fromStock.part_id).maybeSingle();
    if (existing) {
      await supabase.from("van_stock").update({ quantity: existing.quantity + qty }).eq("id", existing.id);
    } else {
      await supabase.from("van_stock").insert({
        org_id: orgId, engineer_id: xferTo, part_id: fromStock.part_id, quantity: qty, min_quantity: fromStock.min_quantity,
      });
    }
    await supabase.from("van_stock").update({ quantity: fromStock.quantity - qty }).eq("id", fromStock.id);
    await supabase.from("stock_transactions").insert([
      { org_id: orgId, van_stock_id: fromStock.id, engineer_id: user!.id, transaction_type: "transferred", quantity_change: -qty, notes: `Transferred to engineer ${xferTo}` },
    ]);
    toast({ title: "Transfer complete" });
    setXferOpen(false); setXferStockId(""); setXferTo(""); setXferQty("1");
    refresh();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">My Van Stock</h1>
        </div>
        <VanStockGrid engineerId={user!.id} isOwnVan orgId={orgId} />
      </div>
    );
  }

  const lowStock = stocks.filter((s) => s.quantity === 0 || s.quantity < s.min_quantity);
  const lowByEngineer = engineers.map((e) => ({
    engineer: e, items: lowStock.filter((s) => s.engineer_id === e.user_id),
  })).filter((g) => g.items.length > 0);

  const selectedEng = engineers.find((e) => e.user_id === selectedEngineer);
  const engineerStocks = stocks.filter((s) => s.engineer_id === selectedEngineer);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Truck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Van Stock</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Engineers tracked</div>
          <div className="text-2xl font-bold">{new Set(stocks.map((s) => s.engineer_id)).size}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Low stock items</div>
          <div className="text-2xl font-bold text-amber-400">{lowStock.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Pending restock requests</div>
          <div className="text-2xl font-bold text-primary">{requests.length}</div>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">By Engineer</TabsTrigger>
          <TabsTrigger value="low">Low Stock Alerts</TabsTrigger>
          <TabsTrigger value="requests">Restock Requests {requests.length > 0 && <Badge className="ml-2">{requests.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="transfer">Transfer</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Engineer:</Label>
            <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {engineers.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name || "Unnamed"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedEng && <VanStockGrid engineerId={selectedEng.user_id} isAdmin orgId={orgId} />}
        </TabsContent>

        <TabsContent value="low" className="space-y-3 mt-4">
          {lowByEngineer.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">All vans are stocked above minimum levels.</div>
          ) : lowByEngineer.map(({ engineer, items }) => (
            <Card key={engineer.user_id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{engineer.full_name}</div>
                <Badge variant="outline" className="text-amber-400">{items.length} low</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map((it) => (
                  <div key={it.id} className={`text-sm p-2 rounded border ${stockColour(it.quantity, it.min_quantity)}`}>
                    <div className="flex justify-between">
                      <span>{it.parts_library?.name}</span>
                      <span className="font-bold">{it.quantity}/{it.min_quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="requests" className="space-y-3 mt-4">
          {requests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">No pending restock requests.</div>
          ) : requests.map((req) => {
            const eng = engineers.find((e) => e.user_id === req.engineer_id);
            const stock = stocks.find((s) => s.id === req.van_stock_id);
            return (
              <Card key={req.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{eng?.full_name || "Engineer"} — {stock?.parts_library?.name || "Part"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(req.created_at).toLocaleString()} · {req.notes}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => rejectRequest(req)}>Reject</Button>
                  <Button size="sm" onClick={() => approveRequest(req)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="transfer" className="space-y-3 mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="h-4 w-4" />
              <span className="font-medium">Transfer parts between vans</span>
            </div>
            <Button onClick={() => setXferOpen(true)}>New transfer</Button>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={xferOpen} onOpenChange={setXferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>From (engineer + part)</Label>
              <Select value={xferStockId} onValueChange={setXferStockId}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {stocks.filter((s) => s.quantity > 0).map((s) => {
                    const e = engineers.find((x) => x.user_id === s.engineer_id);
                    return <SelectItem key={s.id} value={s.id}>{e?.full_name} — {s.parts_library?.name} ({s.quantity})</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To engineer</Label>
              <Select value={xferTo} onValueChange={setXferTo}>
                <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>
                  {engineers.filter((e) => {
                    const src = stocks.find((s) => s.id === xferStockId);
                    return !src || e.user_id !== src.engineer_id;
                  }).map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" min={1} value={xferQty} onChange={(e) => setXferQty(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setXferOpen(false)}>Cancel</Button>
            <Button onClick={doTransfer}>Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
