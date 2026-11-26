import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UKDateInput } from "@/components/ui/uk-date-input";
import { toast } from "sonner";
import { loadRiserVisitData } from "@/lib/riserVisitData";
import { VISIT_LABELS } from "@/lib/riserVisits";
import { bucketLookAhead, lookAheadMonths, provisionalLabel, type LookAheadItem } from "@/lib/lookAhead";
import { plainError } from "@/lib/plainError";

const OPEN = ["active", "scheduled", "revisit", "in_progress", "awaiting_parts", "on_hold", "requires_revisit", "pending_review"];

export default function LookAheadView({ engineers, onChanged }: { engineers: { user_id: string; full_name: string }[]; onChanged: () => void }) {
  const [span, setSpan] = useState("6");
  const [customer, setCustomer] = useState("all");
  const [jobType, setJobType] = useState("all");
  const [items, setItems] = useState<LookAheadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ item: LookAheadItem; date: string; engineer: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const months = useMemo(() => lookAheadMonths(new Date(), Number(span)), [span]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const from = `${months[0]}-01`, to = format(endOfMonth(new Date(`${months[months.length - 1]}-01T12:00:00`)), "yyyy-MM-dd");
      const sel = "id, name, reference_number, job_type, category, customer, customer_id, target_month, customers(name), sites(name)";
      const sched: any[] = [];
      for (let f = 0; ; f += 1000) {
        const { data, error: se } = await supabase.from("job_schedule").select("job_id, schedule_date").gte("schedule_date", from).lte("schedule_date", to).order("schedule_date").range(f, f + 999);
        if (se) throw se; sched.push(...(data || [])); if (!data || data.length < 1000) break;
      }
      const { data: prov, error } = await supabase.from("jobs").select(sel).gte("target_month", from).lte("target_month", to).in("status", OPEN);
      if (error) throw error;
      const firstDay = new Map<string, string>();
      for (const s of sched) if (!firstDay.has(s.job_id)) firstDay.set(s.job_id, s.schedule_date);
      const provIds = (prov || []).map((j: any) => j.id);
      const { data: anyDay } = provIds.length ? await supabase.from("job_schedule").select("job_id").in("job_id", provIds) : { data: [] as any[] };
      const hasDay = new Set((anyDay || []).map((r: any) => r.job_id));
      const bookedIds = [...firstDay.keys()];
      const booked: any[] = [];
      for (let i = 0; i < bookedIds.length; i += 200) {
        const { data } = await supabase.from("jobs").select(sel).in("id", bookedIds.slice(i, i + 200));
        booked.push(...(data || []));
      }
      const label = (j: any) => `${j.reference_number} · ${j.customers?.name || j.customer || ""}${j.sites?.name ? ` · ${j.sites.name}` : ""}`;
      const type = (j: any) => j.job_type || j.category || "Other";
      const out: LookAheadItem[] = [];
      for (const j of prov || []) if (!hasDay.has(j.id)) out.push({ id: `p-${j.id}`, kind: "provisional", month: j.target_month.slice(0, 7), title: label(j), customerId: j.customer_id, customerName: j.customers?.name || j.customer || "", jobType: type(j), jobId: j.id });
      for (const j of booked) out.push({ id: `b-${j.id}`, kind: "booked", month: firstDay.get(j.id)!.slice(0, 7), date: firstDay.get(j.id), title: label(j), customerId: j.customer_id, customerName: j.customers?.name || j.customer || "", jobType: type(j), jobId: j.id });
      try {
        const due = await loadRiserVisitData();
        for (const r of due as any[]) {
          if (r.booked || !r.cycle?.due || r.site?.no_longer_serviced || r.asset?.no_longer_serviced) continue;
          const d = String(r.cycle.due).slice(0, 10); if (d < from || d > to) continue;
          out.push({ id: `d-${r.asset.id}`, kind: "due", month: d.slice(0, 7), date: d, title: `${r.customer?.name || "Customer not linked"} · ${r.site?.name || ""} · ${r.asset.riser_location || r.asset.name}`, customerId: r.customer?.id || null, customerName: r.customer?.name || "", jobType: r.cycle.type ? VISIT_LABELS[r.cycle.type as keyof typeof VISIT_LABELS] : "Due visit" });
        }
      } catch (e) { console.warn("look-ahead due visits", e); }
      setItems(out);
    } catch (e) { toast.error("Look-ahead not loaded", { description: plainError(e) }); }
    finally { setBusy(false); }
  }, [months]);
  useEffect(() => { load(); }, [load]);

  const customers = useMemo(() => [...new Map(items.filter((i) => i.customerId).map((i) => [i.customerId!, i.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const types = useMemo(() => [...new Set(items.map((i) => i.jobType))].sort(), [items]);
  const buckets = bucketLookAhead(items, months, { customerId: customer, jobType });

  const save = async () => {
    if (!confirm?.item.jobId || !confirm.date || !confirm.engineer) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("job_schedule").insert({ job_id: confirm.item.jobId, engineer_id: confirm.engineer, schedule_date: confirm.date, created_by: u.user?.id } as any);
    if (error) { toast.error("Day not booked", { description: plainError(error) }); return; }
    const { error: e2 } = await supabase.from("jobs").update({ target_month: null } as any).eq("id", confirm.item.jobId);
    if (e2) toast.error("Booked, but the provisional month could not be cleared", { description: plainError(e2) });
    else toast.success(`Booked for ${format(new Date(`${confirm.date}T12:00:00`), "dd/MM/yyyy")}`);
    setConfirm(null); load(); onChanged();
  };
  const startConfirm = (item: LookAheadItem, month?: string) => setConfirm({ item, date: `${month || item.month}-01`, engineer: "" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={span} onValueChange={setSpan}><SelectTrigger className="w-36" aria-label="Look-ahead length"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="6">Next 6 months</SelectItem><SelectItem value="9">Next 9 months</SelectItem><SelectItem value="12">Next 12 months</SelectItem></SelectContent></Select>
        <Select value={customer} onValueChange={setCustomer}><SelectTrigger className="w-56" aria-label="Customer filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All customers</SelectItem>{customers.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent></Select>
        <Select value={jobType} onValueChange={setJobType}><SelectTrigger className="w-48" aria-label="Job type filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All job types</SelectItem>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        <div className="flex gap-2 text-xs text-muted-foreground ml-auto">
          <Badge variant="outline" className="border-dashed">Provisional</Badge><Badge>Booked</Badge><Badge variant="secondary">Due, not booked</Badge>
        </div>
      </div>
      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {buckets.map((b) => (
          <section key={b.month} aria-label={`Month ${b.month}`} className="w-64 shrink-0 rounded-lg border bg-card"
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const it = items.find((i) => i.id === dragId); setDragId(null); if (it) startConfirm(it, b.month); }}>
            <header className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="font-semibold">{format(new Date(`${b.month}-01T12:00:00`), "MMMM yyyy")}</h3>
              <Badge variant="secondary" aria-label={`${b.count} items`}>{b.count}</Badge>
            </header>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
              {!b.items.length && <p className="text-xs text-muted-foreground">Nothing yet</p>}
              {b.items.map((it) => (
                <div key={it.id} draggable={it.kind === "provisional"} onDragStart={() => setDragId(it.id)}
                  className={`rounded border p-2 text-xs ${it.kind === "provisional" ? "border-dashed cursor-grab" : it.kind === "due" ? "bg-muted/50" : "bg-primary/5"}`}>
                  <p className="font-medium">{it.jobId ? <Link to={`/jobs/${it.jobId}`} className="text-primary hover:underline">{it.title}</Link> : it.title}</p>
                  <p className="text-muted-foreground">{it.jobType}</p>
                  <p className="mt-1">{it.kind === "provisional" ? provisionalLabel(`${it.month}-01`) : it.kind === "booked" ? `Booked ${format(new Date(`${it.date}T12:00:00`), "dd/MM/yyyy")}` : `Due ${format(new Date(`${it.date}T12:00:00`), "dd/MM/yyyy")} · not booked`}</p>
                  {it.kind === "provisional" && <Button size="sm" variant="outline" className="mt-1 h-7" onClick={() => startConfirm(it)}>Pick a day</Button>}
                  {it.kind === "due" && <Button size="sm" variant="link" className="h-6 px-0" asChild><Link to="/due-visits">Open Due visits</Link></Button>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm a day</DialogTitle></DialogHeader>
          {confirm && <div className="space-y-3">
            <p className="text-sm">{confirm.item.title}</p>
            <div className="space-y-1"><Label>Day</Label><UKDateInput value={confirm.date} onChange={(e) => setConfirm({ ...confirm, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Engineer</Label>
              <Select value={confirm.engineer} onValueChange={(v) => setConfirm({ ...confirm, engineer: v })}><SelectTrigger><SelectValue placeholder="Select engineer..." /></SelectTrigger>
                <SelectContent>{engineers.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}</SelectContent></Select></div>
            <p className="text-xs text-muted-foreground">Booking a day removes the provisional month.</p>
          </div>}
          <DialogFooter><Button onClick={save} disabled={!confirm?.date || !confirm?.engineer}>Book this day</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
