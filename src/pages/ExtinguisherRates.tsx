import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FireExtinguisher, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isExtinguisherRate, groupRates, RateItem } from "@/lib/extinguisherRates";

export default function ExtinguisherRates() {
  const [items, setItems] = useState<RateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<RateItem | null>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows<RateItem>("price_book_items", "id,description,unit,unit_price,rate_list,customer_id,pricing_kind,price_needed,is_active,org_id", "id");
      setItems(rows.filter(isExtinguisherRate));
    } catch (e: any) { toast.error(e.message || "Could not load rates"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => groupRates(items), [items]);

  const savePrice = async (it: RateItem) => {
    const v = Number(edits[it.id]);
    if (!Number.isFinite(v) || v < 0) return toast.error("Enter a valid price");
    const { error } = await supabase.from("price_book_items").update({ unit_price: v, price_needed: false } as any).eq("id", it.id);
    if (error) return toast.error(error.message);
    toast.success(`${it.description} saved at £${v.toFixed(2)}`);
    setEdits(e => { const n = { ...e }; delete n[it.id]; return n; });
    load();
  };

  const openAdd = async (it: RateItem) => {
    setAdding(it); setQty("1"); setQuoteId("");
    let q = supabase.from("invoices").select("id,invoice_number,customer_id,customers(name),tax_rate,org_id").eq("document_type", "quote").eq("status", "draft").order("created_at", { ascending: false }).limit(200);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    const list = (data || []) as any[];
    setQuotes(it.customer_id ? [...list.filter(x => x.customer_id === it.customer_id), ...list.filter(x => x.customer_id !== it.customer_id)] : list);
  };

  const addToQuote = async () => {
    if (!adding || !quoteId) return;
    const quantity = Number(qty);
    if (!(quantity > 0)) return toast.error("Enter a quantity");
    setBusy(true);
    try {
      const quote = quotes.find(q => q.id === quoteId);
      const { count } = await supabase.from("invoice_line_items").select("id", { count: "exact", head: true }).eq("invoice_id", quoteId);
      const { error } = await supabase.from("invoice_line_items").insert({
        invoice_id: quoteId, org_id: quote.org_id, description: adding.description, quantity,
        unit_price: adding.unit_price, amount: (quantity * adding.unit_price).toFixed(2),
        sort_order: count || 0, price_book_item_id: adding.id,
      } as any);
      if (error) throw error;
      const { data: lines } = await supabase.from("invoice_line_items").select("quantity,unit_price").eq("invoice_id", quoteId);
      const sub = (lines || []).reduce((s, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0);
      const tax = sub * (Number(quote.tax_rate) / 100);
      const { error: e2 } = await supabase.from("invoices").update({ subtotal: sub.toFixed(2), tax_amount: tax.toFixed(2), total: (sub + tax).toFixed(2) } as any).eq("id", quoteId);
      if (e2) throw e2;
      toast.success(`Added to ${quote.invoice_number}`);
      setAdding(null);
    } catch (e: any) { toast.error(e.message || "Could not add to quote"); }
    setBusy(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FireExtinguisher className="h-6 w-6" /> Extinguisher servicing rates</h1>
          <p className="text-sm text-muted-foreground">Servicing rates and extinguisher removal prices per customer, in pounds excluding VAT.</p>
        </div>
        <Button variant="outline" asChild><Link to="/settings/price-book">Back to Price Book</Link></Button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : groups.length === 0 ? <p className="text-muted-foreground">No extinguisher rates yet.</p> : groups.map(g => (
        <Card key={g.name}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">{g.name}{g.unassigned && <Badge variant="secondary">Not linked to a customer</Badge>}</CardTitle>
            {g.unassigned && <CardDescription>Link this list to a customer in the Price Book before quotes pick it up automatically. You can still add these rates to a quote by hand.</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {(["servicing", "removal"] as const).map(sec => g[sec].length > 0 && (
              <div key={sec}>
                <h3 className="text-sm font-semibold mb-1">{sec === "servicing" ? "Servicing" : "Extinguisher removal"}</h3>
                <div className="divide-y border rounded-md">
                  {g[sec].map(it => (
                    <div key={it.id} className="flex flex-wrap items-center gap-2 p-2">
                      <div className="flex-1 min-w-[10rem]"><p className="font-medium text-sm">{it.description}</p><p className="text-xs text-muted-foreground">per {it.unit}</p></div>
                      {it.price_needed && <Badge variant="destructive">Price needed</Badge>}
                      <div className="flex items-center gap-1"><span className="text-sm">£</span>
                        <Input aria-label={`Price for ${it.description}`} className="w-24 h-8" inputMode="decimal" value={edits[it.id] ?? Number(it.unit_price).toFixed(2)} onChange={e => setEdits({ ...edits, [it.id]: e.target.value })} />
                        {edits[it.id] !== undefined && <Button size="sm" variant="outline" onClick={() => savePrice(it)}><Save className="h-3 w-3 mr-1" />Save</Button>}
                      </div>
                      <Button size="sm" onClick={() => openAdd(it)} disabled={it.price_needed}><Plus className="h-3 w-3 mr-1" />Add to quote</Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Dialog open={!!adding} onOpenChange={o => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add “{adding?.description}” to a draft quote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={quoteId} onValueChange={setQuoteId}>
              <SelectTrigger><SelectValue placeholder={quotes.length ? "Choose a draft quote" : "No draft quotes"} /></SelectTrigger>
              <SelectContent>{quotes.map(q => <SelectItem key={q.id} value={q.id}>{q.invoice_number} · {q.customers?.name || "No customer"}</SelectItem>)}</SelectContent>
            </Select>
            <label className="text-sm block">Quantity<Input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} /></label>
            <p className="text-sm text-muted-foreground">£{Number(adding?.unit_price || 0).toFixed(2)} per {adding?.unit}</p>
          </div>
          <DialogFooter><Button onClick={addToQuote} disabled={!quoteId || busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add line</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
