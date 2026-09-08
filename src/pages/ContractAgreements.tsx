import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UKDateInput } from "@/components/ui/uk-date-input";
import { FileSignature, Plus, Library, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dateFormat";
import {
  AGREEMENT_STATUS_LABEL, AgreementServiceLine, ContractTemplate, agreementEndDate,
} from "@/lib/contractTemplates";

type AgreementRow = {
  id: string; reference: string; title: string; status: string;
  start_date: string; end_date: string | null; total_value: number;
  customer_id: string; customers?: { name: string } | null;
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  expired: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground",
};

export default function ContractAgreements() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("contract_agreements")
      .select("id, reference, title, status, start_date, end_date, total_value, customer_id, customers(name)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const expiringSoon = useMemo(
    () => rows.filter((r) => {
      if (r.status !== "signed" || !r.end_date) return false;
      const days = (new Date(r.end_date).getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 60;
    }),
    [rows]
  );

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service agreements</h1>
          <p className="text-sm text-muted-foreground">Assembled from your approved wording and sent for signature.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/agreements/templates"><Library className="mr-1.5 h-4 w-4" />Templates</Link></Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New agreement</Button>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{expiringSoon.length} signed agreement{expiringSoon.length === 1 ? "" : "s"} end within 60 days — time to renew.</span>
        </div>
      )}

      {rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          <FileSignature className="mx-auto mb-3 h-8 w-8 opacity-40" />
          No agreements yet. Approve a template first, then create one from a customer.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Reference</TableHead><TableHead>Customer</TableHead><TableHead>Title</TableHead>
              <TableHead>Term</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/agreements/${r.id}`)}>
                  <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                  <TableCell>{r.customers?.name || "—"}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.start_date)} – {r.end_date ? formatDate(r.end_date) : "—"}
                  </TableCell>
                  <TableCell className="text-right">£{Number(r.total_value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_CLASS[r.status]}>{AGREEMENT_STATUS_LABEL[r.status] || r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {createOpen && (
        <CreateAgreementDialog onClose={() => setCreateOpen(false)} onCreated={(id) => navigate(`/agreements/${id}`)} />
      )}
    </div>
  );
}

export function CreateAgreementDialog({ onClose, onCreated, presetCustomerId }: {
  onClose: () => void; onCreated: (id: string) => void; presetCustomerId?: string;
}) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    template_id: "",
    customer_id: presetCustomerId || "",
    title: "",
    start_date: new Date().toISOString().slice(0, 10),
    term_months: "12",
    renewal_basis: "Renews annually unless cancelled with 30 days' notice",
  });
  const [services, setServices] = useState<AgreementServiceLine[]>([
    { description: "", frequency: "Annual", quantity: 1, unit_price: 0 },
  ]);

  useEffect(() => {
    (async () => {
      const [tRes, cRes] = await Promise.all([
        supabase.from("contract_templates").select("*").eq("status", "approved").order("name"),
        supabase.from("customers").select("id, name, address").order("name"),
      ]);
      setTemplates((tRes.data || []) as any);
      setCustomers((cRes.data || []) as any);
    })();
  }, []);

  useEffect(() => {
    if (!form.customer_id) { setSites([]); setSelectedSites([]); return; }
    (async () => {
      const res: any = await (supabase.from("sites") as any)
        .select("id, name, address")
        .eq("customer_id", form.customer_id)
        .order("name");
      const list: any[] = res?.data || [];
      setSites(list as any);
      setSelectedSites(list.map((s: any) => s.id));
    })();
  }, [form.customer_id]);

  const total = services.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);

  const create = async () => {
    if (!user) return;
    if (!form.customer_id || !form.template_id) { toast.error("Pick a customer and an approved template"); return; }
    const template = templates.find((t) => t.id === form.template_id);
    if (!template) return;
    const customer = customers.find((c) => c.id === form.customer_id);
    setSaving(true);
    const chosenSites = sites.filter((s) => selectedSites.includes(s.id));
    const termMonths = Number(form.term_months) || 12;
    const { data, error } = await supabase.from("contract_agreements").insert({
      title: form.title.trim() || template.name,
      customer_id: form.customer_id,
      template_id: template.id,
      start_date: form.start_date,
      end_date: agreementEndDate(form.start_date, termMonths),
      term_months: termMonths,
      renewal_basis: form.renewal_basis || null,
      total_value: total,
      clauses: (template.clauses || []) as any,
      details: {
        customer_name: customer?.name,
        customer_address: customer?.address ?? null,
        sites: chosenSites.map((s) => ({ id: s.id, name: s.name, address: s.address })),
        services: services.filter((s) => s.description.trim()),
      } as any,
      created_by: user.id,
    } as any).select("id").single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message || "Could not create the agreement"); return; }
    toast.success("Draft agreement created");
    onCreated(data.id);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New service agreement</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {templates.length === 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              You have no approved templates yet. Import or write your wording and approve it first.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose a customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Approved template</Label>
              <Select value={form.template_id} onValueChange={(v) => setForm((f) => ({ ...f, template_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose wording" /></SelectTrigger>
                <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Agreement title</Label>
              <Input value={form.title} placeholder="e.g. Dry riser maintenance agreement"
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div><Label>Start date</Label>
              <UKDateInput value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div><Label>Term (months)</Label>
              <Input type="number" value={form.term_months} onChange={(e) => setForm((f) => ({ ...f, term_months: e.target.value }))} />
            </div>
            <div className="sm:col-span-2"><Label>Renewal basis</Label>
              <Textarea rows={2} value={form.renewal_basis} onChange={(e) => setForm((f) => ({ ...f, renewal_basis: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Covered sites</Label>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sites on this customer yet.</p>
            ) : (
              <div className="mt-1 space-y-1 rounded-md border p-2 max-h-40 overflow-y-auto">
                {sites.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedSites.includes(s.id)}
                      onChange={(e) => setSelectedSites((cur) => e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id))} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Services and frequency</Label>
            {services.map((s, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-5" placeholder="Service, e.g. Dry riser annual service"
                  value={s.description} onChange={(e) => setServices((l) => l.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} />
                <Input className="col-span-3" placeholder="Frequency"
                  value={s.frequency} onChange={(e) => setServices((l) => l.map((x, idx) => idx === i ? { ...x, frequency: e.target.value } : x))} />
                <Input className="col-span-1" type="number" value={s.quantity}
                  onChange={(e) => setServices((l) => l.map((x, idx) => idx === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                <Input className="col-span-2" type="number" step="0.01" value={s.unit_price}
                  onChange={(e) => setServices((l) => l.map((x, idx) => idx === i ? { ...x, unit_price: Number(e.target.value) } : x))} />
                <Button size="sm" variant="ghost" className="col-span-1" onClick={() => setServices((l) => l.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => setServices((l) => [...l, { description: "", frequency: "Annual", quantity: 1, unit_price: 0 }])}>
                <Plus className="mr-1.5 h-4 w-4" />Add service
              </Button>
              <span className="text-sm font-medium">Total £{total.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={saving || templates.length === 0}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
