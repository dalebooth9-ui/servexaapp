import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, FileText, Repeat, PoundSterling, Save, Loader2, Wrench, X } from "lucide-react";
import { format, addYears, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { UKDateInput } from "@/components/ui/uk-date-input";

type Service = { id: string; description: string; quantity: number; unit_price: number; ppm_schedule_id: string | null; sort_order: number };
type Site = { id: string; site_id: string; sites?: { name: string; address: string | null } | null };

export default function ServiceContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contract, setContract] = useState<any>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [ppmOptions, setPpmOptions] = useState<{ id: string; title: string }[]>([]);
  const [siteOptions, setSiteOptions] = useState<{ id: string; name: string }[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [profitJobs, setProfitJobs] = useState<{ count: number; visits: number }>({ count: 0, visits: 0 });
  const [contractInvoices, setContractInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);

  const [editForm, setEditForm] = useState<any>({});
  const [newSvc, setNewSvc] = useState({ description: "", quantity: "1", unit_price: "0", ppm_schedule_id: "" });
  const [addSiteId, setAddSiteId] = useState("");

  const fetchAll = async () => {
    if (!id) return;
    const [cRes, svcRes, siteRes, ppmRes, siteOptRes, rnwRes, invRes] = await Promise.all([
      supabase.from("service_contracts").select("*, customers(id, name, email, address)").eq("id", id).single(),
      supabase.from("service_contract_services").select("*").eq("contract_id", id).order("sort_order"),
      supabase.from("service_contract_sites").select("id, site_id, sites(name, address)").eq("contract_id", id),
      supabase.from("ppm_schedules").select("id, title").order("title"),
      supabase.from("sites").select("id, name").order("name"),
      supabase.from("service_contract_renewals").select("*").eq("contract_id", id).order("renewed_at", { ascending: false }),
      supabase.from("invoices").select("id, invoice_number, total, status, document_type, created_at").eq("contract_id", id).order("created_at", { ascending: false }),
    ]);
    setContract(cRes.data);
    setServices((svcRes.data || []) as any);
    setSites((siteRes.data || []) as any);
    setPpmOptions((ppmRes.data || []) as any);
    setSiteOptions((siteOptRes.data || []) as any);
    setRenewals((rnwRes.data || []) as any);
    setContractInvoices((invRes.data || []) as any);

    // Profitability: jobs attributed to this contract
    const { data: jobRows } = await supabase.from("jobs").select("id, status").eq("contract_id", id);
    const jobIds = (jobRows || []).map((j: any) => j.id);
    let visits = 0;
    if (jobIds.length) {
      const { count } = await supabase.from("job_visits").select("*", { count: "exact", head: true }).in("job_id", jobIds).eq("status", "completed");
      visits = count || 0;
    }
    setProfitJobs({ count: jobIds.length, visits });

    if (cRes.data) {
      setEditForm({
        name: cRes.data.name,
        start_date: cRes.data.start_date,
        renewal_date: cRes.data.renewal_date,
        contract_value: cRes.data.contract_value,
        billing_frequency: cRes.data.billing_frequency,
        price_increase_pct: cRes.data.price_increase_pct,
        notes: cRes.data.notes || "",
        status: cRes.data.status,
      });
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const derivedStatus = useMemo(() => {
    if (!contract) return "";
    if (contract.status === "cancelled") return "cancelled";
    const d = differenceInDays(new Date(contract.renewal_date), new Date());
    if (d < 0) return "lapsed";
    if (d <= 60) return "due_for_renewal";
    return "active";
  }, [contract]);

  const linesTotal = useMemo(() => services.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0), [services]);

  const periodAmount = useMemo(() => {
    if (!contract) return 0;
    const v = Number(contract.contract_value);
    switch (contract.billing_frequency) {
      case "monthly": return v / 12;
      case "quarterly": return v / 4;
      default: return v;
    }
  }, [contract]);

  const projectedNewValue = useMemo(() => {
    if (!contract) return 0;
    const v = Number(contract.contract_value);
    return v * (1 + Number(contract.price_increase_pct || 0) / 100);
  }, [contract]);

  const saveContract = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.from("service_contracts").update({
      name: editForm.name,
      start_date: editForm.start_date,
      renewal_date: editForm.renewal_date,
      contract_value: Number(editForm.contract_value) || 0,
      billing_frequency: editForm.billing_frequency,
      price_increase_pct: Number(editForm.price_increase_pct) || 0,
      notes: editForm.notes || null,
      status: editForm.status,
    } as any).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract updated");
    fetchAll();
  };

  const addService = async () => {
    if (!id || !newSvc.description.trim()) { toast.error("Description required"); return; }
    const { error } = await supabase.from("service_contract_services").insert({
      contract_id: id,
      description: newSvc.description.trim(),
      quantity: Number(newSvc.quantity) || 1,
      unit_price: Number(newSvc.unit_price) || 0,
      ppm_schedule_id: newSvc.ppm_schedule_id || null,
      sort_order: services.length,
    } as any);
    if (error) { toast.error(error.message); return; }
    setNewSvc({ description: "", quantity: "1", unit_price: "0", ppm_schedule_id: "" });
    fetchAll();
  };

  const deleteService = async (svcId: string) => {
    await supabase.from("service_contract_services").delete().eq("id", svcId);
    fetchAll();
  };

  const addSite = async () => {
    if (!id || !addSiteId) return;
    const { error } = await supabase.from("service_contract_sites").insert({ contract_id: id, site_id: addSiteId } as any);
    if (error) { toast.error(error.message); return; }
    setAddSiteId(""); setAddSiteOpen(false); fetchAll();
  };

  const removeSite = async (rowId: string) => {
    await supabase.from("service_contract_sites").delete().eq("id", rowId);
    fetchAll();
  };

  const handleRenew = async () => {
    if (!contract || !user) return;
    setRenewing(true);
    const prevRenewal = contract.renewal_date;
    const prevValue = Number(contract.contract_value);
    const newRenewal = format(addYears(new Date(prevRenewal), 1), "yyyy-MM-dd");
    const newValue = Number((prevValue * (1 + Number(contract.price_increase_pct || 0) / 100)).toFixed(2));

    const { error: rErr } = await supabase.from("service_contract_renewals").insert({
      contract_id: contract.id,
      previous_renewal_date: prevRenewal,
      new_renewal_date: newRenewal,
      previous_value: prevValue,
      new_value: newValue,
      applied_increase_pct: contract.price_increase_pct || 0,
      renewed_by: user.id,
    } as any);
    if (rErr) { toast.error(rErr.message); setRenewing(false); return; }

    const { error: cErr } = await supabase.from("service_contracts").update({
      renewal_date: newRenewal,
      contract_value: newValue,
      status: "active",
    } as any).eq("id", contract.id);
    setRenewing(false);
    if (cErr) { toast.error(cErr.message); return; }
    toast.success(`Renewed. New value £${newValue.toLocaleString()}, next renewal ${format(new Date(newRenewal), "dd MMM yyyy")}`);
    setRenewOpen(false);
    fetchAll();
  };

  const generateInvoice = async () => {
    if (!contract || !user) return;
    setGenerating(true);
    const cust = contract.customers;
    const { data: inv, error } = await supabase.from("invoices").insert({
      created_by: user.id,
      contract_id: contract.id,
      customer_name: cust?.name || "Customer",
      customer_email: cust?.email || null,
      customer_address: cust?.address || null,
      document_type: "invoice",
      status: "draft",
      invoice_number: "",
      subtotal: periodAmount.toFixed(2),
      tax_rate: 20,
      tax_amount: (periodAmount * 0.2).toFixed(2),
      total: (periodAmount * 1.2).toFixed(2),
      notes: `${contract.billing_frequency.charAt(0).toUpperCase() + contract.billing_frequency.slice(1)} invoice for contract ${contract.reference_number} — ${contract.name}`,
    } as any).select("id").single();
    if (error || !inv) { toast.error(error?.message || "Failed to create invoice"); setGenerating(false); return; }

    // Line items: use services if any, else a single line for the period value
    const lineRows = services.length > 0
      ? services.map((s, i) => {
          const scale = contract.billing_frequency === "monthly" ? 1 / 12 : contract.billing_frequency === "quarterly" ? 1 / 4 : 1;
          const unit = Number(s.unit_price) * scale;
          return {
            invoice_id: inv.id,
            description: s.description,
            quantity: s.quantity,
            unit_price: unit.toFixed(2),
            amount: (Number(s.quantity) * unit).toFixed(2),
            sort_order: i,
          };
        })
      : [{ invoice_id: inv.id, description: `${contract.name} — ${contract.billing_frequency} charge`, quantity: 1, unit_price: periodAmount.toFixed(2), amount: periodAmount.toFixed(2), sort_order: 0 }];
    await supabase.from("invoice_line_items").insert(lineRows as any);

    setGenerating(false);
    toast.success("Invoice draft created from contract");
    navigate(`/invoices/${inv.id}`);
  };

  if (loading || !contract) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  const daysToRenewal = differenceInDays(new Date(contract.renewal_date), new Date());
  const statusBadgeClass: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    due_for_renewal: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    lapsed: "bg-red-500/15 text-red-700 border-red-500/30",
    cancelled: "bg-muted text-muted-foreground",
  };
  const invoicedTotal = contractInvoices.reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <div className="space-y-6">

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{contract.name}</h1>
            <Badge variant="outline" className={statusBadgeClass[derivedStatus]}>{derivedStatus.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{contract.reference_number} • <Link to={`/customers/${contract.customers?.id}`} className="text-primary hover:underline">{contract.customers?.name}</Link></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setRenewOpen(true)} disabled={derivedStatus === "cancelled"}>
            <Repeat className="mr-1.5 h-4 w-4" /> Renew
          </Button>
          <Button size="sm" onClick={generateInvoice} disabled={generating}>
            {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
            Generate {contract.billing_frequency} invoice
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold inline-flex items-center"><PoundSterling className="h-4 w-4" />{Number(contract.contract_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">Annual value</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold inline-flex items-center"><PoundSterling className="h-4 w-4" />{periodAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">Per {contract.billing_frequency === "annual" ? "year" : contract.billing_frequency === "quarterly" ? "quarter" : "month"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold">{format(new Date(contract.renewal_date), "dd MMM yyyy")}</p>
          <p className="text-xs text-muted-foreground">{daysToRenewal >= 0 ? `Renews in ${daysToRenewal}d` : `Lapsed ${Math.abs(daysToRenewal)}d ago`}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-lg font-bold text-primary">£{projectedNewValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">After {contract.price_increase_pct}% uplift</p>
        </CardContent></Card>
      </div>

      {/* Edit fields */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contract details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={editForm.name || ""} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm((f: any) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="lapsed">Lapsed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Start date</Label><UKDateInput  value={editForm.start_date || ""} onChange={e => setEditForm((f: any) => ({ ...f, start_date: e.target.value }))} /></div>
            <div><Label>Renewal date</Label><UKDateInput  value={editForm.renewal_date || ""} onChange={e => setEditForm((f: any) => ({ ...f, renewal_date: e.target.value }))} /></div>
            <div><Label>Annual value (£)</Label><Input type="number" step="0.01" value={editForm.contract_value ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, contract_value: e.target.value }))} /></div>
            <div><Label>Billing frequency</Label>
              <Select value={editForm.billing_frequency} onValueChange={v => setEditForm((f: any) => ({ ...f, billing_frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Annual price increase %</Label><Input type="number" step="0.1" value={editForm.price_increase_pct ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, price_increase_pct: e.target.value }))} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={editForm.notes || ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveContract} disabled={saving}><Save className="mr-1.5 h-4 w-4" />{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Sites */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Covered sites ({sites.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddSiteOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add site</Button>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sites covered yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {sites.map(s => (
                <li key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div>
                    <p className="font-medium">{s.sites?.name}</p>
                    {s.sites?.address && <p className="text-xs text-muted-foreground">{s.sites.address}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeSite(s.id)}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Services / line items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Included services & line items</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {services.length > 0 && (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Description</TableHead><TableHead>PPM link</TableHead>
                <TableHead className="w-20">Qty</TableHead><TableHead className="w-28">Unit £</TableHead>
                <TableHead className="w-28">Line £</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {services.map(s => {
                  const ppm = ppmOptions.find(p => p.id === s.ppm_schedule_id);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{s.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ppm?.title || "—"}</TableCell>
                      <TableCell className="text-sm">{s.quantity}</TableCell>
                      <TableCell className="text-sm">£{Number(s.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">£{(Number(s.quantity) * Number(s.unit_price)).toFixed(2)}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => deleteService(s.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-sm font-medium">Annual line total</TableCell>
                  <TableCell className="text-sm font-medium">£{linesTotal.toFixed(2)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border-t pt-3">
            <div className="md:col-span-2"><Label className="text-xs">Description</Label><Input value={newSvc.description} onChange={e => setNewSvc(s => ({ ...s, description: e.target.value }))} placeholder="e.g. 6-monthly alarm service" /></div>
            <div><Label className="text-xs">Link to PPM</Label>
              <Select value={newSvc.ppm_schedule_id} onValueChange={v => setNewSvc(s => ({ ...s, ppm_schedule_id: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{ppmOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Qty</Label><Input type="number" value={newSvc.quantity} onChange={e => setNewSvc(s => ({ ...s, quantity: e.target.value }))} /></div>
            <div><Label className="text-xs">Unit £</Label><Input type="number" step="0.01" value={newSvc.unit_price} onChange={e => setNewSvc(s => ({ ...s, unit_price: e.target.value }))} /></div>
            <Button size="sm" onClick={addService}><Plus className="mr-1 h-4 w-4" /> Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Profitability */}
      <Card>
        <CardHeader><CardTitle className="text-base">Delivered vs value</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Jobs under contract</p><p className="text-xl font-semibold inline-flex items-center gap-1"><Wrench className="h-4 w-4" />{profitJobs.count}</p></div>
            <div><p className="text-xs text-muted-foreground">Completed visits</p><p className="text-xl font-semibold">{profitJobs.visits}</p></div>
            <div><p className="text-xs text-muted-foreground">Invoiced to date</p><p className="text-xl font-semibold">£{invoicedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
            <div><p className="text-xs text-muted-foreground">Contract value</p><p className="text-xl font-semibold">£{Number(contract.contract_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
          </div>
          {contractInvoices.length > 0 && (
            <div className="mt-3 space-y-1">
              {contractInvoices.map(i => (
                <Link key={i.id} to={`/invoices/${i.id}`} className="flex items-center justify-between text-xs border rounded px-2 py-1.5 hover:bg-muted">
                  <span className="font-mono">{i.invoice_number}</span>
                  <span className="text-muted-foreground">{format(new Date(i.created_at), "dd MMM yyyy")}</span>
                  <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                  <span className="font-medium">£{Number(i.total).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewals history */}
      {renewals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Renewal history</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {renewals.map(r => (
                <li key={r.id} className="flex justify-between border-b py-1.5">
                  <span>{format(new Date(r.renewed_at), "dd MMM yyyy")} — renewed to {format(new Date(r.new_renewal_date), "dd MMM yyyy")}</span>
                  <span className="text-muted-foreground">£{Number(r.previous_value).toFixed(2)} → £{Number(r.new_value).toFixed(2)} ({r.applied_increase_pct}%)</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Renew dialog */}
      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renew contract</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border p-3 bg-muted/40">
              <p>Current renewal date: <span className="font-medium">{format(new Date(contract.renewal_date), "dd MMM yyyy")}</span></p>
              <p>Current value: <span className="font-medium">£{Number(contract.contract_value).toFixed(2)}</span></p>
              <p>Uplift: <span className="font-medium">{contract.price_increase_pct}%</span></p>
              <hr className="my-2" />
              <p>New renewal date: <span className="font-medium">{format(addYears(new Date(contract.renewal_date), 1), "dd MMM yyyy")}</span></p>
              <p>New value: <span className="font-medium text-primary">£{projectedNewValue.toFixed(2)}</span></p>
            </div>
            <p className="text-xs text-muted-foreground">This records the renewal and moves the renewal date forward by 12 months. No invoice is generated automatically — use "Generate {contract.billing_frequency} invoice" for that.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenewOpen(false)}>Cancel</Button>
              <Button onClick={handleRenew} disabled={renewing}>{renewing ? "Renewing…" : "Confirm renewal"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add site dialog */}
      <Dialog open={addSiteOpen} onOpenChange={setAddSiteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add site to contract</DialogTitle></DialogHeader>
          <Select value={addSiteId} onValueChange={setAddSiteId}>
            <SelectTrigger><SelectValue placeholder="Choose a site" /></SelectTrigger>
            <SelectContent>{siteOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddSiteOpen(false)}>Cancel</Button>
            <Button onClick={addSite} disabled={!addSiteId}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
