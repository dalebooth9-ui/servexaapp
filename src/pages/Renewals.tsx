import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addMonths, differenceInDays, format, parseISO, startOfMonth } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, Mail, Plus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type ScheduleRow = {
  id: string;
  org_id: string;
  site_id: string | null;
  customer_id: string | null;
  template_id: string | null;
  work_type: string | null;
  last_done_date: string | null;
  interval_months: number;
  next_due_date: string;
  next_job_id: string | null;
  reminder_lead_sent_at: string | null;
  reminder_due_sent_at: string | null;
  site: { id: string; name: string | null; address: string | null } | null;
  customer: { id: string; name: string | null; email: string | null; renewal_reminders_opt_out: boolean } | null;
  template: { id: string; name: string; category: string | null } | null;
};

export default function Renewals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [workFilter, setWorkFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: schedules }, { data: org }] = await Promise.all([
      supabase
        .from("site_service_schedules")
        .select(`id, org_id, site_id, customer_id, template_id, work_type,
                 last_done_date, interval_months, next_due_date, next_job_id,
                 reminder_lead_sent_at, reminder_due_sent_at,
                 site:sites(id, name, address),
                 customer:customers(id, name, email, renewal_reminders_opt_out),
                 template:job_sheet_templates(id, name, category)`)
        .eq("active", true)
        .order("next_due_date", { ascending: true })
        .limit(1000),
      supabase.from("organisations").select("renewal_reminders_enabled").maybeSingle(),
    ]);
    setRows((schedules as any) || []);
    setRemindersEnabled(!!(org as any)?.renewal_reminders_enabled);
    setLoading(false);
  }

  const customers = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.customer) m.set(r.customer.id, r.customer.name || "—"); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const workTypes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.work_type) s.add(r.work_type); });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (customerFilter !== "all" && r.customer?.id !== customerFilter) return false;
      if (workFilter !== "all" && r.work_type !== workFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.site?.name || ""} ${r.site?.address || ""} ${r.customer?.name || ""} ${r.template?.name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, customerFilter, workFilter, search]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = filtered.filter(r => parseISO(r.next_due_date) < today);
  const upcoming = filtered.filter(r => parseISO(r.next_due_date) >= today);

  const grouped = useMemo(() => {
    const g = new Map<string, ScheduleRow[]>();
    upcoming.forEach(r => {
      const k = format(startOfMonth(parseISO(r.next_due_date)), "yyyy-MM");
      const list = g.get(k) || [];
      list.push(r);
      g.set(k, list);
    });
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcoming]);

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function createJobFromSchedule(r: ScheduleRow) {
    if (!user) return;
    const workLabel = r.template?.name || r.work_type || "Service";
    const custName = r.customer?.name || "";
    const name = `${workLabel} — ${custName || r.site?.name || "Site"}`;
    const { data: newJob, error } = await supabase.from("jobs").insert({
      name,
      customer_id: r.customer_id,
      customer: custName,
      site_id: r.site_id,
      address: r.site?.address || null,
      category: r.work_type,
      priority: "normal",
      status: "pending",
      due_date: r.next_due_date,
      created_by: user.id,
    } as any).select("id, reference_number").single();
    if (error || !newJob) {
      toast({ title: "Could not create job", description: error?.message, variant: "destructive" });
      return;
    }
    if (r.template_id) {
      await supabase.from("job_sheet_responses").insert({
        job_id: newJob.id, template_id: r.template_id,
        submitted_by: user.id, status: "draft", responses: {},
      } as any);
    }
    await supabase.from("site_service_schedules").update({ next_job_id: newJob.id }).eq("id", r.id);
    toast({ title: "Job created", description: newJob.reference_number || name });
    navigate(`/jobs/${newJob.id}`);
  }

  async function bulkCreate() {
    const chosen = filtered.filter(r => selected.has(r.id) && !r.next_job_id);
    for (const r of chosen) await createJobFromSchedule(r);
    setSelected(new Set());
    void load();
  }

  async function sendReminder(r: ScheduleRow) {
    const { data, error } = await supabase.functions.invoke("send-renewal-reminders", {
      body: { schedule_id: r.id, manual: true },
    });
    if (error) { toast({ title: "Reminder failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reminder queued", description: (data as any)?.recipient || r.customer?.email || "" });
    void load();
  }

  const dueThisMonthCount = upcoming.filter(r => {
    const d = parseISO(r.next_due_date);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" /> Renewals & Compliance
          </h1>
          <p className="text-sm text-muted-foreground">
            Automatic due-date tracking from every filed job sheet, scan and historic report.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings?tab=documents">Configure intervals</Link>
          </Button>
          {selected.size > 0 && (
            <Button size="sm" onClick={bulkCreate}>
              <Plus className="mr-2 h-4 w-4" /> Create {selected.size} job{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>

      {!remindersEnabled && (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="text-sm">
              <strong>Customer reminders are off.</strong> Turn on automated reminder emails
              (with editable wording) in Settings once you're happy with the template.
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=documents")}>
              Open settings
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Due this month" value={dueThisMonthCount} tone="default" />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : "default"} />
        <Stat label="Tracked services" value={rows.length} tone="default" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input placeholder="Search site, customer, template…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={workFilter} onValueChange={setWorkFilter}>
          <SelectTrigger><SelectValue placeholder="All work types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All work types</SelectItem>
            {workTypes.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {overdue.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Overdue ({overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RenewalTable rows={overdue} selected={selected} toggle={toggle}
              onCreate={createJobFromSchedule} onRemind={sendReminder} isOverdue />
          </CardContent>
        </Card>
      )}

      {grouped.map(([month, list]) => (
        <Card key={month}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {format(parseISO(`${month}-01`), "MMMM yyyy")} · {list.length} due
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RenewalTable rows={list} selected={selected} toggle={toggle}
              onCreate={createJobFromSchedule} onRemind={sendReminder} />
          </CardContent>
        </Card>
      ))}

      {!loading && filtered.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary" />
          No upcoming renewals match your filters.
        </CardContent></Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "default" | "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-3xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      </CardContent>
    </Card>
  );
}

function RenewalTable({
  rows, selected, toggle, onCreate, onRemind, isOverdue,
}: {
  rows: ScheduleRow[]; selected: Set<string>; toggle: (id: string) => void;
  onCreate: (r: ScheduleRow) => void; onRemind: (r: ScheduleRow) => void; isOverdue?: boolean;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-2 w-8"></th>
            <th className="p-2 text-left">Site</th>
            <th className="p-2 text-left">Customer</th>
            <th className="p-2 text-left">Work</th>
            <th className="p-2 text-left">Last done</th>
            <th className="p-2 text-left">Due</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const due = parseISO(r.next_due_date);
            const days = differenceInDays(due, today);
            return (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)}
                    disabled={!!r.next_job_id} />
                </td>
                <td className="p-2">
                  <div className="font-medium">{r.site?.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.site?.address || ""}</div>
                </td>
                <td className="p-2">
                  {r.customer?.name || "—"}
                  {r.customer?.renewal_reminders_opt_out && (
                    <Badge variant="outline" className="ml-1 text-[10px]">no reminders</Badge>
                  )}
                </td>
                <td className="p-2">{r.template?.name || r.work_type || "—"}</td>
                <td className="p-2">{r.last_done_date ? format(parseISO(r.last_done_date), "dd MMM yyyy") : "—"}</td>
                <td className="p-2">
                  <div className={isOverdue ? "text-destructive font-medium" : ""}>
                    {format(due, "dd MMM yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                  </div>
                </td>
                <td className="p-2 text-right space-x-1">
                  {r.next_job_id ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/jobs/${r.next_job_id}`}>View job</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onCreate(r)}>
                      <Plus className="mr-1 h-3 w-3" /> Create job
                    </Button>
                  )}
                  {r.customer?.email && !r.customer?.renewal_reminders_opt_out && (
                    <Button size="sm" variant="ghost" onClick={() => onRemind(r)} title="Send reminder now">
                      <Send className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
