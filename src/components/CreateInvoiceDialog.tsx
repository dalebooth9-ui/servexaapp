import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, FileText, Package, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
};

export default function CreateInvoiceDialog({
  jobId,
  customerName,
  customerEmail,
  customerAddress,
  jobName,
  trigger,
  documentType = "invoice",
}: {
  jobId?: string;
  customerName?: string;
  customerEmail?: string;
  customerAddress?: string;
  jobName?: string;
  trigger?: React.ReactNode;
  documentType?: "invoice" | "quote";
}) {
  const isQuote = documentType === "quote";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Customer lookup
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Parts library
  const [partsLibrary, setPartsLibrary] = useState<any[]>([]);
  const [partsSearch, setPartsSearch] = useState("");
  const [partsPickerOpen, setPartsPickerOpen] = useState(false);
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    customer_name: customerName || "",
    customer_email: customerEmail || "",
    customer_address: customerAddress || "",
    due_date: "",
    notes: "",
    tax_rate: 0,
  });

  const [items, setItems] = useState<LineItem[]>([
    { description: jobName || "", quantity: 1, unit_price: 0 },
  ]);

  // Load customers and parts library when dialog opens
  useEffect(() => {
    if (open) {
      supabase.from("customers").select("id, name, email, address").order("name").then(({ data }) => {
        setCustomers(data || []);
        // Auto-fill email/address from customer record if we have a name but no email
        if (customerName && !customerEmail) {
          const match = (data || []).find((c) => c.name === customerName);
          if (match) {
            setForm((prev) => ({
              ...prev,
              customer_email: match.email || prev.customer_email,
              customer_address: match.address || prev.customer_address,
            }));
          }
        }
      });
      supabase.from("parts_library").select("id, name, part_number, sell_price, unit_cost, category").order("name").then(({ data }) => {
        setPartsLibrary(data || []);
      });
    }
  }, [open]);

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setForm((prev) => ({
        ...prev,
        customer_name: cust.name || "",
        customer_email: cust.email || "",
        customer_address: cust.address || "",
      }));
    }
  };

  const togglePartSelection = (partId: string) => {
    setSelectedParts((prev) => {
      const n = new Set(prev);
      if (n.has(partId)) n.delete(partId); else n.add(partId);
      return n;
    });
  };

  const addSelectedParts = () => {
    const newItems = partsLibrary
      .filter((p) => selectedParts.has(p.id))
      .map((part) => ({
        description: part.part_number ? `${part.name} (${part.part_number})` : part.name,
        quantity: 1,
        unit_price: Number(part.sell_price) || 0,
      }));
    setItems((prev) => [...prev, ...newItems]);
    setSelectedParts(new Set());
    setPartsPickerOpen(false);
    setPartsSearch("");
  };

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const taxAmount = subtotal * (form.tax_rate / 100);
  const total = subtotal + taxAmount;

  const filteredParts = partsLibrary.filter((p) => {
    if (!partsSearch) return true;
    const q = partsSearch.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.part_number?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  const handleSave = async () => {
    if (!user) return;
    if (!form.customer_name.trim()) {
      toast({ title: "Error", description: "Customer name is required.", variant: "destructive" });
      return;
    }
    if (items.length === 0 || items.every((it) => !it.description.trim())) {
      toast({ title: "Error", description: "At least one line item is required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          job_id: jobId || null,
          customer_name: form.customer_name.trim(),
          customer_email: form.customer_email.trim() || null,
          customer_address: form.customer_address.trim() || null,
          due_date: form.due_date || null,
          notes: form.notes.trim() || null,
          subtotal: subtotal.toFixed(2),
          tax_rate: form.tax_rate,
          tax_amount: taxAmount.toFixed(2),
          total: total.toFixed(2),
          created_by: user.id,
          invoice_number: "",
          document_type: documentType,
        } as any)
        .select()
        .single();

      if (invErr) throw invErr;

      const lineItems = items
        .filter((it) => it.description.trim())
        .map((it, idx) => ({
          invoice_id: inv.id,
          description: it.description.trim(),
          quantity: it.quantity,
          unit_price: it.unit_price,
          amount: (it.quantity * it.unit_price).toFixed(2),
          sort_order: idx,
        }));

      if (lineItems.length > 0) {
        const { error: itemsErr } = await supabase.from("invoice_line_items").insert(lineItems as any);
        if (itemsErr) throw itemsErr;
      }

      toast({ title: `${isQuote ? "Quote" : "Invoice"} created`, description: `${inv.invoice_number} created successfully.` });
      setOpen(false);
      navigate(`/invoices/${inv.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <FileText className="mr-1.5 h-4 w-4" /> Create Invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isQuote ? "Create Quote" : "Create Invoice"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer picker */}
          {customers.length > 0 && (
            <div>
              <Label>Select Customer</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
              >
                <option value="">— Select or enter manually —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Customer info */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Customer Name *</Label>
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div>
              <Label>Customer Email</Label>
              <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} placeholder="For sending invoice" />
            </div>
          </div>
          <div>
            <Label>Customer Address</Label>
            <Textarea value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{isQuote ? "Valid Until" : "Due Date"}</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Tax Rate (%)</Label>
              <Input type="number" min={0} max={100} step={0.01} value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Line Items</Label>
              <div className="flex items-center gap-1">
                <Popover open={partsPickerOpen} onOpenChange={setPartsPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="gap-1">
                      <Package className="h-3 w-3" /> From Parts Library
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 bg-popover border shadow-md z-50" align="end">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search parts..."
                          value={partsSearch}
                          onChange={(e) => setPartsSearch(e.target.value)}
                          className="pl-8 h-8 text-sm"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredParts.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground text-center">No parts found</p>
                      ) : (
                        filteredParts.slice(0, 50).map((part) => (
                          <label
                            key={part.id}
                            className="w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0 flex items-center gap-2 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedParts.has(part.id)}
                              onCheckedChange={() => togglePartSelection(part.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{part.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {part.part_number && <span>{part.part_number} • </span>}
                                {part.category}
                              </p>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                              £{Number(part.sell_price).toFixed(2)}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedParts.size > 0 && (
                      <div className="p-2 border-t">
                        <Button type="button" size="sm" className="w-full" onClick={addSelectedParts}>
                          Add {selectedParts.size} Part(s)
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Button type="button" size="sm" variant="ghost" onClick={() => setItems([...items, { description: "", quantity: 1, unit_price: 0 }])}>
                  <Plus className="mr-1 h-3 w-3" /> Add Item
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Unit price"
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-24 flex items-center justify-end gap-1">
                    <span className="text-sm font-medium">£{(item.quantity * item.unit_price).toFixed(2)}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
              {form.tax_rate > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({form.tax_rate}%)</span>
                  <span>£{taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>Total</span>
                <span>£{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, bank details, etc." rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creating..." : isQuote ? "Create Quote" : "Create Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
