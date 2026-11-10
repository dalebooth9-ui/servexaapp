import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, BookOpen, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { fetchAllRows } from '@/lib/fetchAllRows';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';

type Item = {
  id: string;
  code: string | null;
  description: string;
  category: string | null;
  unit: string;
  unit_price: number;
  notes: string | null;
  is_active: boolean;
  customer_id: string | null;
  rate_list: string | null;
  pricing_kind: string;
  price_needed: boolean;
};

const EMPTY: Omit<Item, "id"> = {
  code: "",
  description: "",
  category: "",
  unit: "each",
  unit_price: 0,
  notes: "",
  is_active: true,
  customer_id: null, rate_list: null, pricing_kind: 'remedial', price_needed: false,
};

export default function PriceBook() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, "id">>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const addParam = params.get("add");
  const lineParam = params.get("line");
  const returnTo = params.get("returnTo");
  const [prefilled, setPrefilled] = useState(false);
  const [customers,setCustomers]=useState<{id:string;name:string}[]>([]);
  const [rules,setRules]=useState({threshold:95,local_fee:40,distant_fee:60});
  useEffect(()=>{fetchAllRows<{id:string;name:string}>('customers','id,name','id').then(setCustomers);supabase.from('app_settings').select('value').eq('key','remedial_quote_pricing').maybeSingle().then(({data})=>{if(data)setRules(data.value as any);});},[]);
  const saveRules=async()=>{const {data:o,error:oe}=await supabase.rpc('get_user_org_id');if(oe || !o)return toast.error('Company unavailable');const {error}=await supabase.from('app_settings').upsert({org_id:o,key:'remedial_quote_pricing',value:rules});if(error)toast.error(error.message);else toast.success('Attendance settings saved');};

  const load = async () => {
    setLoading(true);
    try { setItems(await fetchAllRows<Item>('price_book_items','*','id')); } catch(e:any){toast.error(e.message);}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Opened from an unmatched quote line: prefill the Add form with the line's
  // description and, when one exists, the matching price-book category.
  useEffect(() => {
    if (prefilled || loading || !addParam) return;
    setPrefilled(true);
    const head = addParam.split(":")[0].trim().toLowerCase();
    const cats = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];
    const cat = cats.find((c) => c.toLowerCase() === head)
      || cats.find((c) => head && (head.includes(c.toLowerCase()) || c.toLowerCase().includes(head)))
      || (addParam.includes(":") ? addParam.split(":")[0].trim() : "");
    if (cat) setSearch(cat);
    setEditing(null);
    setForm({ ...EMPTY, description: addParam, category: cat || 'Remedial works' });
    if(lineParam) supabase.from('invoice_line_items').select('invoice_id,price_book_item_id').eq('id',lineParam).maybeSingle().then(async({data})=>{
      if(!data)return;
      if(data.price_book_item_id){const existing=items.find(i=>i.id===data.price_book_item_id);if(existing){setEditing(existing);const {id,...rest}=existing;setForm(rest);return;}}
      const {data:q}=await supabase.from('invoices').select('customer_id').eq('id',data.invoice_id).maybeSingle();
      if(q?.customer_id){const customer=customers.find(c=>c.id===q.customer_id);setForm(prev=>({...prev,customer_id:q.customer_id,rate_list:customer?.name || null}));}
    });
    setDialogOpen(true);
  }, [prefilled, loading, addParam, items]);

  // After saving from a quote, price that quote line and recalc its totals.
  const applyToQuoteLine = async (_itemId: string | null, price: number) => {
    if (!lineParam) return;
    if (_itemId) { const {error}=await supabase.rpc('apply_quote_price',{p_line:lineParam,p_item:_itemId});if(error)throw error;return; }
    const { data: line } = await supabase.from("invoice_line_items").select("id, invoice_id, quantity").eq("id", lineParam).maybeSingle();
    if (!line) return;
    const qty = Number((line as any).quantity) || 0;
    const upd: any = { unit_price: price, amount: (qty * price).toFixed(2), price_match: "matched" };
    const { error } = await supabase.from("invoice_line_items").update(upd).eq("id", lineParam);
    if (error) { toast.error(error.message); return; }
    const invId = (line as any).invoice_id;
    const [{ data: lines }, { data: inv }] = await Promise.all([
      supabase.from("invoice_line_items").select("quantity, unit_price").eq("invoice_id", invId),
      supabase.from("invoices").select("tax_rate").eq("id", invId).maybeSingle(),
    ]);
    const sub = (lines || []).reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_price), 0);
    const tax = sub * (Number((inv as any)?.tax_rate) || 0) / 100;
    await supabase.from("invoices").update({ subtotal: sub.toFixed(2), tax_amount: tax.toFixed(2), total: (sub + tax).toFixed(2) } as any).eq("id", invId);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      it.description.toLowerCase().includes(q) ||
      (it.code || "").toLowerCase().includes(q) ||
      (it.category || "").toLowerCase().includes(q) ||
      (it.rate_list || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };
  const openEdit = (it: Item) => {
    setEditing(it);
    const { id, ...rest } = it;
    setForm(rest);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.description.trim()) return toast.error("Description is required");
    if(!Number.isFinite(form.unit_price) || form.unit_price<0)return toast.error('Enter a price of zero or more, or leave it blank');
    setBusy(true);
    const payload: any = {
      code: form.code?.trim() || null,
      description: form.description.trim(),
      category: form.category?.trim() || null,
      unit: form.unit.trim() || "each",
      unit_price: Number(form.unit_price) || 0,
      notes: form.notes?.trim() || null,
      is_active: form.is_active,
      customer_id: form.customer_id, rate_list: form.rate_list,
      pricing_kind: form.pricing_kind, price_needed: form.price_needed,
    };
    let err: any = null;
    if (editing) {
      const { error } = await (supabase as any)
        .from("price_book_items").update(payload).eq("id", editing.id);
      err = error;
      if(!error && lineParam && !payload.price_needed){try{await applyToQuoteLine(editing.id,payload.unit_price);}catch(e:any){err=e;}}
    } else {
      const { data: prof } = await supabase
        .from("profiles").select("org_id").eq("user_id", user.id).maybeSingle();
      const org_id = (prof as any)?.org_id;
      if (!org_id) { setBusy(false); return toast.error("No organisation"); }
      const { data: created, error } = await (supabase as any)
        .from("price_book_items").insert({ ...payload, org_id, created_by: user.id }).select("id").maybeSingle();
      err = error;
      if (!error && lineParam && !payload.price_needed) {
        try { await applyToQuoteLine(created?.id ?? null, payload.unit_price); } catch(e:any){err=e;}
      }
    }
    setBusy(false);
    if (err) return toast.error(err.message);
    if (lineParam && !payload.price_needed && returnTo?.startsWith("/") && !returnTo.startsWith('//')) {
      toast.success("Price added and applied to the quote");
      navigate(returnTo);
      return;
    }
    toast.success(editing ? "Updated" : "Added");
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any)
      .from("price_book_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Price Book
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable remedial line items — used when drafting quotes from defects.
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> New line
        </Button>
      </div>

      <section className="border-y py-3 space-y-2"><h2 className="font-medium text-sm">Remedial attendance charges · excluding VAT</h2><div className="flex flex-wrap items-end gap-3">{([['threshold','Quote threshold (£)'],['local_fee','Manchester / Oldham (£)'],['distant_fee','Further away (£)']] as const).map(([key,label])=><label key={key} className="text-xs">{label}<Input type="number" min="0" step="0.01" value={rules[key]} onChange={e=>setRules({...rules,[key]:Math.max(0,Number(e.target.value))})} /></label>)}<Button size="sm" onClick={saveRules}>Save charges</Button></div></section>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search description, code, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No price book lines yet. Add your first common remedial line.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((it) => (
            <Card key={it.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.code && (
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {it.code}
                      </span>
                    )}
                    <span className="font-medium">{it.description}</span>
                    {it.category && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {it.category}
                      </Badge>
                    )}
                    {!it.is_active && <Badge variant="secondary">inactive</Badge>}
                    {it.rate_list && <Badge variant="secondary">{it.rate_list}{!it.customer_id ? ' · unassigned' : ''}</Badge>}
                  </div>
                  {it.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{it.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    {it.price_needed ? 'Price needed' : `£${Number(it.unit_price).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground">per {it.unit}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(it)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete price line?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This cannot be undone. Existing quotes are unaffected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => remove(it.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { setEditing(null); setForm(EMPTY); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit price line" : "New price line"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="text-xs">Customer price list<Select value={form.customer_id || 'general'} onValueChange={id=>{const c=customers.find(c=>c.id===id);setForm({...form,customer_id:c?.id || null,rate_list:c?.name || null});}}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General prices / unassigned</SelectItem>{customers.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-xs">Type<Select value={form.pricing_kind} onValueChange={v=>setForm({...form,pricing_kind:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="remedial">Remedial works</SelectItem><SelectItem value="servicing">Extinguisher servicing</SelectItem></SelectContent></Select></label>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">Code (optional)</label>
                <Input
                  value={form.code || ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="ARV-25"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Description</label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Supply & fit 25mm air release valve"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <Input
                  value={form.category || ""}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="dry riser"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Unit</label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="each"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Unit price (£)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price_needed ? '' : String(form.unit_price)}
                  placeholder="Price needed"
                  onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value), price_needed: e.target.value === '' })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
