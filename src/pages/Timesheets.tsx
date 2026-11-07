import { Fragment, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Download, CheckCircle2, AlertTriangle, Pencil, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FLAG_LABELS, breakUsed, fmtHM, londonDate, londonTime, payrollDailyCsv, payrollWeeklyCsv, workedMinutes } from "@/lib/vanClock";

type Entry = { id: string; user_id: string; clock_in_at: string; clock_out_at: string | null; break_minutes: number; total_minutes: number | null; van_id: string | null; flags: string[]; missing_finish: boolean; recorded_offline: boolean; break_started_at: string | null };
type Person = { user_id: string; full_name: string | null };

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");
/** datetime-local value in London time */
const toLocalInput = (iso: string | null) => iso ? `${londonDate(iso)}T${londonTime(iso)}` : "";
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  // Interpret as Europe/London wall time.
  const guess = new Date(`${v}:00Z`);
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/London" })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export default function Timesheets() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState("all");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [vans, setVans] = useState<Record<string, string>>({});
  const [approvals, setApprovals] = useState<Record<string, string>>({});
  const [jobsByDay, setJobsByDay] = useState<Record<string, { ref: string; action: string; at: string }[]>>({});
  const [corrections, setCorrections] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<string, any[]>>({});
  const [stdBreak, setStdBreak] = useState(0);
  const [empIds, setEmpIds] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Entry | null>(null);
  const [form, setForm] = useState({ start: "", finish: "", brk: 0, reason: "" });
  const [loading, setLoading] = useState(true);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDay(addDays(weekStart, i))), [weekStart]);
  const ws = days[0];

  const load = async () => {
    setLoading(true);
    const from = addDays(weekStart, -1).toISOString(), to = addDays(weekStart, 8).toISOString();
    const [p, e, v, a, s, c] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").order("full_name"),
      supabase.from("time_clock").select("id, user_id, clock_in_at, clock_out_at, break_minutes, total_minutes, van_id, flags, missing_finish, recorded_offline, break_started_at").gte("clock_in_at", from).lt("clock_in_at", to).order("clock_in_at"),
      supabase.from("vans").select("id, name"),
      supabase.from("timesheet_week_approvals").select("user_id, approved_at").eq("week_start", ws),
      supabase.from("timesheet_settings").select("standard_break_minutes").maybeSingle(),
      supabase.from("time_clock_corrections").select("id, user_id, work_date, note, status, created_at").eq("status", "open").order("created_at", { ascending: false }),
    ]);
    const list = ((e.data as Entry[]) || []).filter((x) => days.includes(londonDate(x.clock_in_at)));
    setEntries(list);
    setStdBreak(s.data?.standard_break_minutes ?? 0);
    const { data: payIds } = await supabase.from("payroll_employee_ids").select("user_id, employee_id");
    setEmpIds(Object.fromEntries(((payIds as any[]) || []).map((x) => [x.user_id, x.employee_id])));
    setVans(Object.fromEntries(((v.data as any[]) || []).map((x) => [x.id, x.name])));
    setApprovals(Object.fromEntries(((a.data as any[]) || []).map((x) => [x.user_id, x.approved_at])));
    setCorrections((c.data as any[]) || []);
    const ids = new Set(list.map((x) => x.user_id));
    setPeople(((p.data as Person[]) || []).filter((x) => ids.has(x.user_id) || true));
    // Edit history for these days
    if (list.length) {
      const { data: ed } = await supabase.from("time_clock_edits").select("time_clock_id, field, old_value, new_value, reason, created_at, edited_by").in("time_clock_id", list.map((x) => x.id)).order("created_at");
      const g: Record<string, any[]> = {}; (ed || []).forEach((r: any) => (g[r.time_clock_id] ||= []).push(r)); setEdits(g);
    } else setEdits({});
    // Job activity for the day (read only — jobs are unchanged)
    const { data: acts } = await supabase.from("job_activity_log").select("job_id, user_id, action, details, created_at").in("action", ["status_change", "visit_update", "riser_qr_attendance", "report_submitted"]).gte("created_at", from).lt("created_at", to).limit(1000);
    const jobIds = Array.from(new Set((acts || []).map((r: any) => r.job_id).filter(Boolean)));
    const refs: Record<string, string> = {};
    if (jobIds.length) { const { data: js } = await supabase.from("jobs").select("id, reference_number").in("id", jobIds); (js || []).forEach((j: any) => (refs[j.id] = j.reference_number || "Job")); }
    const jb: Record<string, any[]> = {};
    (acts || []).forEach((r: any) => { if (!r.user_id) return; const k = `${r.user_id}|${londonDate(r.created_at)}`; (jb[k] ||= []).push({ ref: refs[r.job_id] || "Job", action: (r.details || r.action || "").toString().slice(0, 60), at: r.created_at }); });
    setJobsByDay(jb);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ws]);

  const name = (id: string) => people.find((p) => p.user_id === id)?.full_name || "Unknown";
  const shownPeople = Array.from(new Set(entries.map((e) => e.user_id))).filter((id) => filter === "all" || id === filter).sort((a, b) => name(a).localeCompare(name(b)));

  const approve = async (uid: string, on: boolean) => {
    const { error } = await supabase.rpc("set_timesheet_week_approval", { _user_id: uid, _week_start: ws, _approved: on });
    if (error) toast.error(error.message); else { toast.success(on ? "Week approved" : "Approval removed"); load(); }
  };
  const openEdit = (e: Entry) => { setEditing(e); setForm({ start: toLocalInput(e.clock_in_at), finish: toLocalInput(e.clock_out_at), brk: e.break_minutes, reason: "" }); };
  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.rpc("admin_edit_time_clock", { _id: editing.id, _clock_in: fromLocalInput(form.start)!, _clock_out: fromLocalInput(form.finish) as any, _break_minutes: form.brk, _reason: form.reason });
    if (error) return toast.error(error.message);
    toast.success("Time changed and logged"); setEditing(null); load();
  };
  const resolveCorrection = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("time_clock_corrections").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: u.user?.id }).eq("id", id); load();
  };
  const saveEmpId = async (uid: string, value: string) => {
    const v = value.trim();
    if ((empIds[uid] || "") === v) return;
    const { error } = v
      ? await supabase.from("payroll_employee_ids").upsert({ user_id: uid, employee_id: v } as any, { onConflict: "org_id,user_id" })
      : await supabase.from("payroll_employee_ids").delete().eq("user_id", uid);
    if (error) return toast.error(error.message);
    setEmpIds({ ...empIds, [uid]: v }); toast.success("Employee ID saved");
  };
  const download = (csv: string, file: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file; a.click();
  };
  const approvedRows = () => entries.filter((e) => approvals[e.user_id] && (filter === "all" || e.user_id === filter)).map((e) => ({ employee: name(e.user_id), employeeId: empIds[e.user_id] || "", entry: e }));
  const exportDaily = () => {
    const rows = approvedRows(); if (!rows.length) toast.info("No approved weeks yet — file has headers only");
    download(payrollDailyCsv(rows, stdBreak), `payroll-daily-${ws}.csv`);
  };
  const exportWeekly = () => {
    const rows = approvedRows(); if (!rows.length) toast.info("No approved weeks yet — file has headers only");
    download(payrollWeeklyCsv(rows, ws, stdBreak), `payroll-weekly-summary-${ws}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Timesheets</h1><p className="text-sm text-muted-foreground">Hours from van QR scans and Start/Finish day buttons. Hours only.</p></div>
        <div className="flex flex-wrap gap-2" data-assistant-target="Export timesheets"><Button onClick={exportDaily}><Download className="mr-2 h-4 w-4" />Payroll export (daily)</Button><Button variant="outline" onClick={exportWeekly}><Download className="mr-2 h-4 w-4" />Weekly summary</Button></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-44 text-center font-medium">Week of {format(weekStart, "d MMM yyyy")}</span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All employees</SelectItem>{people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "Unnamed"}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {corrections.length > 0 && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Correction requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">{corrections.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
              <span><strong>{name(c.user_id)}</strong> · {format(new Date(c.work_date), "dd/MM/yyyy")} — {c.note}</span>
              <Button size="sm" variant="outline" onClick={() => resolveCorrection(c.id)}>Mark done</Button>
            </div>))}
          </CardContent></Card>
      )}

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : shownPeople.length === 0 ? <p className="text-sm text-muted-foreground">No clocked days this week.</p> : shownPeople.map((uid) => {
        const mine = entries.filter((e) => e.user_id === uid);
        const total = mine.reduce((s, e) => s + (workedMinutes(e, stdBreak) || 0), 0);
        return (
          <Card key={uid}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{name(uid)} · <span className="text-primary">{fmtHM(total)}</span></CardTitle><Input key={`${uid}-${empIds[uid] || ""}`} defaultValue={empIds[uid] || ""} placeholder="Employee ID (Xero)" aria-label="Employee ID" className="h-8 w-40" onBlur={(e) => saveEmpId(uid, e.target.value)} /></div>
              {approvals[uid]
                ? <div className="flex items-center gap-2"><Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />Approved {format(new Date(approvals[uid]), "dd/MM HH:mm")}</Badge><Button size="sm" variant="ghost" onClick={() => approve(uid, false)}>Undo</Button></div>
                : <Button size="sm" onClick={() => approve(uid, true)}>Approve week</Button>}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-2">Day</th><th className="pr-2">Van</th><th className="pr-2">Start</th><th className="pr-2">Finish</th><th className="pr-2">Break</th><th className="pr-2">Total</th><th>Checks</th><th></th></tr></thead>
                <tbody>{mine.map((e) => {
                  const jobs = jobsByDay[`${uid}|${londonDate(e.clock_in_at)}`] || [];
                  return (<Fragment key={e.id}>
                    <tr className="border-b align-top">
                      <td className="py-2 pr-2 whitespace-nowrap">{format(new Date(londonDate(e.clock_in_at)), "EEE dd/MM")}</td>
                      <td className="pr-2">{e.van_id ? vans[e.van_id] || "Van" : "Button"}</td>
                      <td className="pr-2">{londonTime(e.clock_in_at)}</td>
                      <td className="pr-2">{e.clock_out_at ? londonTime(e.clock_out_at) : e.missing_finish ? <span className="font-semibold text-destructive">Missing finish</span> : <span className="text-muted-foreground">Working</span>}</td>
                      <td className="pr-2">{breakUsed(e, stdBreak)}m</td>
                      <td className="pr-2 font-medium">{fmtHM(workedMinutes(e, stdBreak))}</td>
                      <td className="space-x-1">{e.flags.map((f) => <Badge key={f} variant="outline" className="border-destructive/50 text-destructive"><AlertTriangle className="mr-1 h-3 w-3" />{FLAG_LABELS[f] || f}</Badge>)}{e.recorded_offline && <Badge variant="outline">Sent later (no signal)</Badge>}{edits[e.id]?.length ? <Badge variant="secondary">Edited</Badge> : null}</td>
                      <td><Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label="Edit times"><Pencil className="h-4 w-4" /></Button></td>
                    </tr>
                    {(jobs.length > 0 || edits[e.id]?.length) && <tr className="border-b"><td></td><td colSpan={7} className="pb-2 text-xs text-muted-foreground">
                      {jobs.length > 0 && <div>Jobs: {jobs.slice(0, 8).map((j, i) => <span key={i} className="mr-3">{londonTime(j.at)} {j.ref} {j.action}</span>)}</div>}
                      {(edits[e.id] || []).map((x, i) => <div key={i}>Changed {x.field} {x.old_value ? (x.field === "break" ? x.old_value : londonTime(x.old_value)) : "—"} → {x.new_value ? (x.field === "break" ? x.new_value : londonTime(x.new_value)) : "—"} on {format(new Date(x.created_at), "dd/MM HH:mm")} by {name(x.edited_by)}: {x.reason}</div>)}
                    </td></tr>}
                  </Fragment>);
                })}</tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change times{editing ? ` — ${name(editing.user_id)}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Start</Label><Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div className="space-y-1"><Label>Finish</Label><Input type="datetime-local" value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} /></div>
            <div className="space-y-1"><Label>Break (minutes, 0 = use standard break)</Label><Input type="number" min={0} value={form.brk} onChange={(e) => setForm({ ...form, brk: Math.max(0, +e.target.value || 0) })} /></div>
            <div className="space-y-1"><Label>Reason (required)</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveEdit} disabled={!form.reason.trim() || !form.start}>Save change</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
