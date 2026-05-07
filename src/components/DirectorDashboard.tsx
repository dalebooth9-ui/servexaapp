import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase, PoundSterling, Users, AlertTriangle, ShieldCheck, Activity,
  ArrowRight, ArrowUp, ArrowDown, Clock, FileText, CheckCircle2, AlertCircle, CalendarDays,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis } from "recharts";
import { formatDistanceToNow, startOfWeek, addWeeks, format, startOfMonth, subMonths } from "date-fns";
import VehicleCheckReviewCard from "@/components/VehicleCheckReviewCard";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
type JobsData = {
  totalActive: number;
  scheduled: number;
  inProgress: number;
  completedThisWeek: number;
  completedThisMonth: number;
  overdue: number;
  unassigned: number;
  weekly: { week: string; completed: number }[];
};

type RevenueData = {
  thisMonth: number;
  lastMonth: number;
  change: number;
  outstandingCount: number;
  outstandingValue: number;
};

type EngineerData = {
  total: number;
  clockedIn: number;
  expiringCerts: number;
};

type DefectData = {
  open: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  unquoted: number;
};

type ComplianceData = {
  upcoming: number;
  overdue: number;
  assetsNeedAttention: number;
};

type ActivityItem = {
  id: string;
  kind: "job" | "defect" | "invoice";
  title: string;
  detail: string;
  who: string | null;
  at: string;
  href: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export default function DirectorDashboard() {
  const { } = { };
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobsData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [engineers, setEngineers] = useState<EngineerData | null>(null);
  const [defects, setDefects] = useState<DefectData | null>(null);
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadJobs(), loadRevenue(), loadEngineers(), loadDefects(), loadCompliance(), loadActivity()]);
    setLoading(false);
  };

  // ── Jobs ────────────────────────────────────────────────────────────────────
  const loadJobs = async () => {
    const now = new Date();
    const eightWeeksAgo = addWeeks(startOfWeek(now, { weekStartsOn: 1 }), -7);
    const startWeek = startOfWeek(now, { weekStartsOn: 1 });
    const startMonth = startOfMonth(now);

    const { data: jobsData } = await supabase
      .from("jobs")
      .select("id, status, scheduled_date, updated_at")
      .gte("updated_at", eightWeeksAgo.toISOString());

    const { data: assignments } = await supabase.from("job_assignments").select("job_id");
    const assignedIds = new Set((assignments || []).map((a: any) => a.job_id));

    const list = (jobsData || []) as any[];
    const active = list.filter(j => !["completed", "archived"].includes(j.status));
    const scheduled = list.filter(j => j.status === "scheduled").length;
    const inProgress = list.filter(j => j.status === "in_progress").length;
    const completedThisWeek = list.filter(j => j.status === "completed" && new Date(j.updated_at) >= startWeek).length;
    const completedThisMonth = list.filter(j => j.status === "completed" && new Date(j.updated_at) >= startMonth).length;
    const overdue = active.filter(j => j.scheduled_date && new Date(j.scheduled_date) < now).length;
    const unassigned = active.filter(j => !assignedIds.has(j.id)).length;

    // 8-week sparkline
    const weekly: { week: string; completed: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = addWeeks(startWeek, -i);
      const we = addWeeks(ws, 1);
      const count = list.filter(j => j.status === "completed" && new Date(j.updated_at) >= ws && new Date(j.updated_at) < we).length;
      weekly.push({ week: format(ws, "dd MMM"), completed: count });
    }

    setJobs({
      totalActive: active.length,
      scheduled,
      inProgress,
      completedThisWeek,
      completedThisMonth,
      overdue,
      unassigned,
      weekly,
    });
  };

  // ── Revenue ─────────────────────────────────────────────────────────────────
  const loadRevenue = async () => {
    const now = new Date();
    const startThisMonth = startOfMonth(now);
    const startLastMonth = startOfMonth(subMonths(now, 1));

    const { data: invs } = await supabase
      .from("invoices")
      .select("id, total, status, created_at, document_type")
      .eq("document_type", "invoice")
      .gte("created_at", startLastMonth.toISOString());

    const { data: outstanding } = await supabase
      .from("invoices")
      .select("total")
      .eq("document_type", "invoice")
      .in("status", ["sent", "overdue"]);

    const list = (invs || []) as any[];
    const thisMonth = list
      .filter(i => new Date(i.created_at) >= startThisMonth)
      .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const lastMonth = list
      .filter(i => new Date(i.created_at) >= startLastMonth && new Date(i.created_at) < startThisMonth)
      .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const change = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : thisMonth > 0 ? 100 : 0;
    const outstandingValue = (outstanding || []).reduce((sum: number, i: any) => sum + (Number(i.total) || 0), 0);

    setRevenue({
      thisMonth,
      lastMonth,
      change,
      outstandingCount: (outstanding || []).length,
      outstandingValue,
    });
  };

  // ── Engineers ───────────────────────────────────────────────────────────────
  const loadEngineers = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const [rolesRes, clockRes, certsRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "engineer"),
      supabase.from("time_clock").select("user_id, clock_in_at, clock_out_at").gte("clock_in_at", today.toISOString()),
      supabase
        .from("engineer_documents")
        .select("id, expiry_date")
        .not("expiry_date", "is", null)
        .gte("expiry_date", today.toISOString().slice(0, 10))
        .lte("expiry_date", in30.toISOString().slice(0, 10)),
    ]);

    const clockedInUsers = new Set(
      ((clockRes.data || []) as any[])
        .filter(c => !c.clock_out_at)
        .map(c => c.user_id)
    );

    setEngineers({
      total: (rolesRes.data || []).length,
      clockedIn: clockedInUsers.size,
      expiringCerts: (certsRes.data || []).length,
    });
  };

  // ── Defects ─────────────────────────────────────────────────────────────────
  const loadDefects = async () => {
    const { data } = await supabase.from("defects").select("severity, status, quote_id");
    const list = (data || []) as any[];
    const open = list.filter(d => d.status === "open" || d.status === "in_progress");
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    open.forEach(d => {
      if ((bySeverity as any)[d.severity] !== undefined) (bySeverity as any)[d.severity]++;
    });
    setDefects({
      open: open.length,
      bySeverity,
      unquoted: open.filter(d => !d.quote_id).length,
    });
  };

  // ── Compliance ──────────────────────────────────────────────────────────────
  const loadCompliance = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const { data } = await supabase
      .from("compliance_records")
      .select("id, asset_id, expiry_date, status")
      .not("expiry_date", "is", null);

    const list = (data || []) as any[];
    const overdue = list.filter(r => r.expiry_date < today).length;
    const upcoming = list.filter(r => r.expiry_date >= today && r.expiry_date <= in30.toISOString().slice(0, 10)).length;
    const assetsNeedAttention = new Set(
      list.filter(r => r.asset_id && r.expiry_date <= in30.toISOString().slice(0, 10)).map(r => r.asset_id),
    ).size;

    setCompliance({ upcoming, overdue, assetsNeedAttention });
  };

  // ── Activity ────────────────────────────────────────────────────────────────
  const loadActivity = async () => {
    const [jobsLog, defectsList, invList] = await Promise.all([
      supabase.from("job_activity_log").select("id, job_id, action, details, created_at, user_id").order("created_at", { ascending: false }).limit(10),
      supabase.from("defects").select("id, title, severity, created_at, reported_by").order("created_at", { ascending: false }).limit(5),
      supabase.from("invoices").select("id, invoice_number, total, document_type, created_at, created_by").order("created_at", { ascending: false }).limit(5),
    ]);

    const userIds = new Set<string>();
    (jobsLog.data || []).forEach((r: any) => r.user_id && userIds.add(r.user_id));
    (defectsList.data || []).forEach((r: any) => r.reported_by && userIds.add(r.reported_by));
    (invList.data || []).forEach((r: any) => r.created_by && userIds.add(r.created_by));

    const profileMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(userIds));
      (profs || []).forEach((p: any) => { profileMap[p.user_id] = p.full_name; });
    }

    const items: ActivityItem[] = [];
    (jobsLog.data || []).forEach((r: any) => items.push({
      id: `job-${r.id}`, kind: "job",
      title: r.action === "status_change" ? "Job status updated" : r.action === "submission" ? "Submission added" : r.action,
      detail: r.details || "",
      who: r.user_id ? profileMap[r.user_id] || null : null,
      at: r.created_at, href: `/jobs/${r.job_id}`,
    }));
    (defectsList.data || []).forEach((r: any) => items.push({
      id: `def-${r.id}`, kind: "defect",
      title: "Defect logged",
      detail: `${r.severity}: ${r.title}`,
      who: r.reported_by ? profileMap[r.reported_by] || null : null,
      at: r.created_at, href: `/defects`,
    }));
    (invList.data || []).forEach((r: any) => items.push({
      id: `inv-${r.id}`, kind: "invoice",
      title: r.document_type === "quote" ? "Quote created" : "Invoice created",
      detail: `${r.invoice_number} — £${Number(r.total).toFixed(2)}`,
      who: r.created_by ? profileMap[r.created_by] || null : null,
      at: r.created_at, href: `/invoices/${r.id}`,
    }));

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setActivity(items.slice(0, 10));
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const fmtMoney = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Director Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time business performance across operations.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Jobs */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" /> Jobs Overview
              </CardTitle>
              <Link to="/jobs" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-3xl font-bold">{jobs?.totalActive ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active jobs</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat icon={CalendarDays} label="Scheduled" value={jobs?.scheduled ?? 0} />
                <Stat icon={Clock} label="In progress" value={jobs?.inProgress ?? 0} />
                <Stat icon={CheckCircle2} label="Done this wk" value={jobs?.completedThisWeek ?? 0} />
                <Stat icon={CheckCircle2} label="Done this mo" value={jobs?.completedThisMonth ?? 0} />
              </div>
              {((jobs?.overdue ?? 0) > 0 || (jobs?.unassigned ?? 0) > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {(jobs?.overdue ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                      {jobs?.overdue} overdue
                    </Badge>
                  )}
                  {(jobs?.unassigned ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30">
                      {jobs?.unassigned} unassigned
                    </Badge>
                  )}
                </div>
              )}
              <div className="h-16 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jobs?.weekly || []}>
                    <XAxis dataKey="week" hide />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                    />
                    <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">Completed jobs · last 8 weeks</p>
            </CardContent>
          </Card>

          {/* Revenue */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <PoundSterling className="h-4 w-4 text-primary" /> Revenue
              </CardTitle>
              <Link to="/invoices" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-3xl font-bold">{fmtMoney(revenue?.thisMonth ?? 0)}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Invoiced this month
                  {revenue && revenue.lastMonth > 0 && (
                    <span className={`inline-flex items-center gap-0.5 font-medium ${revenue.change >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {revenue.change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(revenue.change).toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Last month: <span className="text-foreground font-medium">{fmtMoney(revenue?.lastMonth ?? 0)}</span>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-semibold">{fmtMoney(revenue?.outstandingValue ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{revenue?.outstandingCount ?? 0} unpaid invoice{revenue?.outstandingCount === 1 ? "" : "s"}</p>
              </div>
            </CardContent>
          </Card>

          {/* Engineers */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Engineers
              </CardTitle>
              <Link to="/engineers" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-3xl font-bold">{engineers?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active engineers</p>
              </div>
              <div className="space-y-2">
                <Row icon={Clock} label="Clocked in today" value={engineers?.clockedIn ?? 0} />
                <Row
                  icon={ShieldCheck}
                  label="Certs expiring 30d"
                  value={engineers?.expiringCerts ?? 0}
                  warn={(engineers?.expiringCerts ?? 0) > 0}
                />
              </div>
            </CardContent>
          </Card>

          {/* Defects */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" /> Defects
              </CardTitle>
              <Link to="/defects" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-3xl font-bold">{defects?.open ?? 0}</p>
                <p className="text-xs text-muted-foreground">Open defects</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <SevBadge label="critical" count={defects?.bySeverity.critical ?? 0} className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" />
                <SevBadge label="high" count={defects?.bySeverity.high ?? 0} className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" />
                <SevBadge label="medium" count={defects?.bySeverity.medium ?? 0} className="bg-yellow-500/15 text-yellow-800 dark:text-yellow-400 border-yellow-500/30" />
                <SevBadge label="low" count={defects?.bySeverity.low ?? 0} className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" />
              </div>
              {(defects?.unquoted ?? 0) > 0 && (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/defects?filter=unquoted">
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Quote {defects?.unquoted} unquoted
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Compliance */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Compliance
              </CardTitle>
              <Link to="/compliance" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-3xl font-bold">{compliance?.upcoming ?? 0}</p>
                <p className="text-xs text-muted-foreground">Due in next 30 days</p>
              </div>
              <div className="space-y-2">
                <Row icon={AlertCircle} label="Overdue" value={compliance?.overdue ?? 0} warn={(compliance?.overdue ?? 0) > 0} />
                <Row icon={Briefcase} label="Assets need attention" value={compliance?.assetsNeedAttention ?? 0} />
              </div>
            </CardContent>
          </Card>

          {/* Vehicle check reviews */}
          <div className="md:col-span-2 lg:col-span-3">
            <VehicleCheckReviewCard />
          </div>

          {/* Recent Activity */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
              ) : (
                <ul className="divide-y divide-border">
                  {activity.map(item => (
                    <li key={item.id}>
                      <Link to={item.href} className="flex items-start gap-3 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded transition-colors">
                        <ActivityIcon kind={item.kind} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {item.who && <p className="text-xs text-foreground">{item.who}</p>}
                          <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(item.at), { addSuffix: true })}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────
function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, warn = false }: { icon: any; label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={`font-semibold ${warn ? "text-orange-500" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function SevBadge({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <Badge variant="outline" className={className}>
      {count} {label}
    </Badge>
  );
}

function ActivityIcon({ kind }: { kind: ActivityItem["kind"] }) {
  const map = {
    job: { Icon: Briefcase, cls: "bg-primary/15 text-primary" },
    defect: { Icon: AlertTriangle, cls: "bg-orange-500/15 text-orange-500" },
    invoice: { Icon: PoundSterling, cls: "bg-emerald-500/15 text-emerald-500" },
  };
  const { Icon, cls } = map[kind];
  return (
    <div className={`h-7 w-7 rounded-full grid place-items-center shrink-0 ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
