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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileSignature, PoundSterling, Calendar, AlertTriangle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { UKDateInput } from "@/components/ui/uk-date-input";

type Contract = {
  id: string;
  reference_number: string;
  name: string;
  customer_id: string;
  start_date: string;
  renewal_date: string;
  contract_value: number;
  billing_frequency: string;
  price_increase_pct: number;
  status: string;
  notes: string | null;
  customers?: { name: string } | null;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  due_for_renewal: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  lapsed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground",
};

function computeDerivedStatus(c: Contract): string {
  if (c.status === "cancelled") return "cancelled";
  const days = differenceInDays(new Date(c.renewal_date), new Date());
  if (days < 0) return "lapsed";
  if (days <= 60) return "due_for_renewal";
  return "active";
}

export default function ServiceContracts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    customer_id: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    renewal_date: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd"),
    contract_value: "0",
    billing_frequency: "annual",
    price_increase_pct: "0",
    notes: "",
  });

  const fetchData = async () => {
    const [cRes, custRes] = await Promise.all([
      supabase.from("service_contracts").select("*, customers(name)").order("renewal_date"),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setContracts((cRes.data || []) as any);
    setCustomers((custRes.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.customer_id || !user) {
      toast.error("Name and customer are required");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.from("service_contracts").insert({
      name: form.name.trim(),
      customer_id: form.customer_id,
      start_date: form.start_date,
      renewal_date: form.renewal_date,
      contract_value: Number(form.contract_value) || 0,
      billing_frequency: form.billing_frequency,
      price_increase_pct: Number(form.price_increase_pct) || 0,
      notes: form.notes || null,
      reference_number: "",
      created_by: user.id,
    } as any).select("id").single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message || "Failed to create contract");
      return;
    }
    toast.success("Contract created");
    setDialogOpen(false);
    navigate(`/contracts/${data.id}`);
  };

  const summary = useMemo(() => {
    const active = contracts.filter(c => computeDerivedStatus(c) === "active");
    const due = contracts.filter(c => computeDerivedStatus(c) === "due_for_renewal");
    const lapsed = contracts.filter(c => computeDerivedStatus(c) === "lapsed");
    const totalActive = active.reduce((s, c) => s + Number(c.contract_value || 0), 0)
                       + due.reduce((s, c) => s + Number(c.contract_value || 0), 0);
    const dueValue = due.reduce((s, c) => s + Number(c.contract_value || 0), 0);
    return { active: active.length, due: due.length, lapsed: lapsed.length, totalActive, dueValue };
  }, [contracts]);

  if (loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="h-6 w-6 text-primary" /> Service Contracts
          </h1>
          <p className="text-sm text-muted-foreground">Your recurring revenue book — active contracts, renewals & billing.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Contract
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{summary.active + summary.due}</p>
          <p className="text-xs text-muted-foreground">Active contracts</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold inline-flex items-center"><PoundSterling className="h-5 w-5" />{summary.totalActive.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground">Annual recurring value</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="h-5 w-5" />{summary.due}</p>
          <p className="text-xs text-muted-foreground">Due for renewal (60d)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-red-600">{summary.lapsed}</p>
          <p className="text-xs text-muted-foreground">Lapsed</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No contracts yet.</TableCell></TableRow>
              ) : contracts.map(c => {
                const status = computeDerivedStatus(c);
                const days = differenceInDays(new Date(c.renewal_date), new Date());
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                    <TableCell className="font-mono text-xs">{c.reference_number}</TableCell>
                    <TableCell><Link to={`/contracts/${c.id}`} className="font-medium hover:underline">{c.name}</Link></TableCell>
                    <TableCell className="text-sm">{c.customers?.name || "—"}</TableCell>
                    <TableCell className="text-sm">£{Number(c.contract_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-xs capitalize">{c.billing_frequency}</TableCell>
                    <TableCell className="text-xs">
                      <div className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(c.renewal_date), "dd MMM yyyy")}</div>
                      <div className="text-muted-foreground">{days >= 0 ? `${days}d away` : `${Math.abs(days)}d overdue`}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_BADGE[status]}>{status.replace(/_/g, " ")}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Service Contract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Contract name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fire Alarm Servicing Agreement" /></div>
            <div><Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={v => setForm(f => ({ ...f, customer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start date</Label><UKDateInput  value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div><Label>Renewal date</Label><UKDateInput  value={form.renewal_date} onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contract value (£)</Label><Input type="number" step="0.01" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))} /></div>
              <div><Label>Billing frequency</Label>
                <Select value={form.billing_frequency} onValueChange={v => setForm(f => ({ ...f, billing_frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Annual price increase %</Label><Input type="number" step="0.1" value={form.price_increase_pct} onChange={e => setForm(f => ({ ...f, price_increase_pct: e.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating…" : "Create Contract"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
