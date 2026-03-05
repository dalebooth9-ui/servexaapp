import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell, Area, AreaChart,
} from "recharts";
import {
  CalendarIcon, TrendingUp, PoundSterling, Users, CheckCircle2,
  Briefcase, Clock, AlertTriangle, Download, RefreshCw, ChevronDown,
  Target, Activity, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  subMonths, subWeeks, eachWeekOfInterval, eachMonthOfInterval,
  startOfDay, endOfDay, isWithinInterval
} from "date-fns";
import { Link } from "react-router-dom";

// ── Types ──────────────────────────────────────────────────
type DateRange = { from: Date; to: Date };
type Preset = "this_week" | "last_week" | "this_month" | "last_month" | "last_3_months" | "last_6_months" | "custom";

type KPI = {
  label: string;
  value: string | number;
  prev?: string | number;
  delta?: number | null;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  link?: string;
};

type EngineerRow = {
  id: string;
  name: string;
  jobsCompleted: number;
  hoursWorked: number;
  submissions: number;
  avgJobsPerDay: number;
};

type JobStatusBreakdown = { name: string; value: number; color: string };

const PRESET_LABELS: Record<Preset, string> = {
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  last_6_months: "Last 6 Months",
  custom: "Custom Range",
};

function getPresetRange(preset: Preset): DateRange {
  const now = new Date();
  switch (preset) {
    case "this_week": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": { const s = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1); return { from: s, to: endOfWeek(s, { weekStartsOn: 1 }) }; }
    case "this_month": return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last_month": { const s = startOfMonth(subMonths(now, 1)); return { from: s, to: endOfMonth(s) }; }
    case "last_3_months": return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
    case "last_6_months": return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
    default: return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

function deltaIcon(d: number | null | undefined) {
  if (d == null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (d > 0) return <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />;
  if (d < 0) return <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function deltaClass(d: number | null | undefined, higherIsBetter = true) {
  if (d == null) return "text-muted-foreground";
  const good = higherIsBetter ? d > 0 : d < 0;
  return good ? "text-green-600 dark:text-green-400" : d === 0 ? "text-muted-foreground" : "text-destructive";
}

const STATUS_COLORS: Record<string, string> = {
  active: "hsl(var(--primary))",
  completed: "#22c55e",
  in_progress: "#f59e0b",
  scheduled: "#3b82f6",
  on_hold: "#8b5cf6",
  awaiting_parts: "#f97316",
  requires_revisit: "#ef4444",
  archived: "hsl(var(--muted-foreground))",
};

const CHART_COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#3b82f6", "#8b5cf6", "#f97316"];

// ── Custom Tooltip ─────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.name === "Revenue" ? `£${Number(p.value).toLocaleString()}` : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Reports() {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [range, setRange] = useState<DateRange>(getPresetRange("this_month"));
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [jobTrend, setJobTrend] = useState<any[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<JobStatusBreakdown[]>([]);
  const [engineerRows, setEngineerRows] = useState<EngineerRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; jobs: number; revenue: number }[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ name: string; count: number }[]>([]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(getPresetRange(p));
  };

  const applyCustomRange = () => {
    if (customFrom && customTo) {
      setRange({ from: startOfDay(customFrom), to: endOfDay(customTo) });
      setPreset("custom");
      setCustomOpen(false);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    // Previous period (same duration)
    const duration = range.to.getTime() - range.from.getTime();
    const prevFrom = new Date(range.from.getTime() - duration).toISOString();
    const prevTo = range.from.toISOString();

    const [
      jobsRes, prevJobsRes, completedRes, prevCompletedRes,
      invoicesRes, prevInvoicesRes, assignmentsRes, submissionsRes,
      allJobsRes, clockRes, profilesRes, jobsCatRes,
    ] = await Promise.all([
      supabase.from("jobs").select("id, status, category, customer, customer_id, created_at, updated_at").gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", prevFrom).lte("created_at", prevTo),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", fromIso).lte("updated_at", toIso),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("updated_at", prevFrom).lte("updated_at", prevTo),
      supabase.from("invoices").select("id, total, status, customer_name, job_id, created_at").gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("invoices").select("total, status").gte("created_at", prevFrom).lte("created_at", prevTo),
      supabase.from("job_assignments").select("engineer_id, job_id").gte("assigned_at", fromIso).lte("assigned_at", toIso),
      supabase.from("submissions").select("id, engineer_id, created_at").gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("jobs").select("id, status").lte("created_at", toIso),
      supabase.from("time_clock").select("user_id, clock_in_at, clock_out_at, total_minutes").gte("clock_in_at", fromIso).lte("clock_in_at", toIso),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("jobs").select("category, status").gte("created_at", fromIso).lte("created_at", toIso),
    ]);

    const jobs = jobsRes.data || [];
    const invoices = invoicesRes.data || [];
    const prevInvoices = prevInvoicesRes.data || [];
    const allJobs = allJobsRes.data || [];
    const clocks = clockRes.data || [];
    const profiles = profilesRes.data || [];
    const profMap: Record<string, string> = {};
    profiles.forEach((p) => { profMap[p.user_id] = p.full_name; });

    // ── KPIs ──
    const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
    const prevRevenue = prevInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
    const jobCount = jobs.length;
    const prevJobCount = prevJobsRes.count || 0;
    const completedCount = completedRes.count || 0;
    const prevCompletedCount = prevCompletedRes.count || 0;
    const totalJobsAll = allJobs.length;
    const completedAll = allJobs.filter((j) => j.status === "completed").length;
    const completionRate = totalJobsAll > 0 ? Math.round((completedAll / totalJobsAll) * 100) : 0;
    const activeEngineers = new Set((assignmentsRes.data || []).map((a) => a.engineer_id)).size;
    const invoiceCount = invoices.length;
    const outstanding = invoices.filter((i) => ["draft", "sent", "overdue"].includes(i.status)).reduce((s, i) => s + Number(i.total || 0), 0);

    const pct = (cur: number, prev: number) => prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);

    setKpis([
      { label: "Revenue (Paid)", value: `£${revenue.toLocaleString()}`, prev: `£${prevRevenue.toLocaleString()}`, delta: pct(revenue, prevRevenue), icon: PoundSterling, color: "text-emerald-500", link: "/invoices" },
      { label: "Jobs Created", value: jobCount, prev: prevJobCount, delta: pct(jobCount, prevJobCount), icon: Briefcase, color: "text-primary", link: "/jobs" },
      { label: "Jobs Completed", value: completedCount, prev: prevCompletedCount, delta: pct(completedCount, prevCompletedCount), icon: CheckCircle2, color: "text-green-500" },
      { label: "Completion Rate", value: `${completionRate}%`, delta: null, icon: Target, color: "text-blue-500" },
      { label: "Active Engineers", value: activeEngineers, delta: null, icon: Users, color: "text-violet-500", link: "/engineers" },
      { label: "Invoices Raised", value: invoiceCount, delta: null, icon: Activity, color: "text-amber-500", link: "/invoices" },
      { label: "Outstanding", value: `£${outstanding.toLocaleString()}`, delta: null, icon: AlertTriangle, color: "text-destructive", link: "/invoices" },
      { label: "Hours Logged", value: Math.round(clocks.reduce((s, c) => s + (c.total_minutes || 0), 0) / 60), delta: null, icon: Clock, color: "text-cyan-500" },
    ]);

    // ── Revenue Trend (weekly buckets) ──
    const weeks = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
    const revTrend = weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekInvoices = invoices.filter((i) => {
        const d = new Date(i.created_at);
        return d >= weekStart && d <= weekEnd;
      });
      return {
        name: format(weekStart, "d MMM"),
        Revenue: weekInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0),
        Invoiced: weekInvoices.reduce((s, i) => s + Number(i.total || 0), 0),
      };
    });
    // If range < 2 weeks use daily buckets
    const useDailyRevenue = weeks.length <= 2;
    if (useDailyRevenue) {
      const days: any[] = [];
      let d = new Date(range.from);
      while (d <= range.to) {
        const dayInvoices = invoices.filter((i) => {
          const id = new Date(i.created_at);
          return id >= startOfDay(d) && id <= endOfDay(d);
        });
        days.push({
          name: format(d, "EEE d"),
          Revenue: dayInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0),
          Invoiced: dayInvoices.reduce((s, i) => s + Number(i.total || 0), 0),
        });
        d = new Date(d.getTime() + 86400000);
      }
      setRevenueTrend(days);
    } else {
      setRevenueTrend(revTrend);
    }

    // ── Job Trend ──
    const jobTrendData = weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekJobs = jobs.filter((j) => {
        const d = new Date(j.created_at);
        return d >= weekStart && d <= weekEnd;
      });
      return {
        name: format(weekStart, "d MMM"),
        Created: weekJobs.length,
        Completed: jobs.filter((j) => j.status === "completed" && new Date(j.updated_at) >= weekStart && new Date(j.updated_at) <= weekEnd).length,
      };
    });
    if (useDailyRevenue) {
      const days: any[] = [];
      let d = new Date(range.from);
      while (d <= range.to) {
        const dayJobs = jobs.filter((j) => new Date(j.created_at) >= startOfDay(d) && new Date(j.created_at) <= endOfDay(d));
        days.push({ name: format(d, "EEE d"), Created: dayJobs.length, Completed: dayJobs.filter((j) => j.status === "completed").length });
        d = new Date(d.getTime() + 86400000);
      }
      setJobTrend(days);
    } else {
      setJobTrend(jobTrendData);
    }

    // ── Status Breakdown ──
    const statusCounts: Record<string, number> = {};
    jobs.forEach((j) => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });
    setStatusBreakdown(Object.entries(statusCounts).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
      color: STATUS_COLORS[name] || "hsl(var(--muted-foreground))",
    })));

    // ── Category Breakdown ──
    const catCounts: Record<string, number> = {};
    (jobsCatRes.data || []).forEach((j) => { catCounts[j.category] = (catCounts[j.category] || 0) + 1; });
    setCategoryBreakdown(Object.entries(catCounts).map(([name, count]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    })).sort((a, b) => b.count - a.count).slice(0, 8));

    // ── Engineer Performance ──
    const engMap: Record<string, EngineerRow> = {};
    const allAssignments = assignmentsRes.data || [];
    allAssignments.forEach((a) => {
      if (!engMap[a.engineer_id]) {
        engMap[a.engineer_id] = { id: a.engineer_id, name: profMap[a.engineer_id] || "Unknown", jobsCompleted: 0, hoursWorked: 0, submissions: 0, avgJobsPerDay: 0 };
      }
    });
    jobs.filter((j) => j.status === "completed").forEach((j) => {
      const eng = allAssignments.find((a) => a.job_id === j.id);
      if (eng && engMap[eng.engineer_id]) engMap[eng.engineer_id].jobsCompleted++;
    });
    (submissionsRes.data || []).forEach((s) => {
      if (engMap[s.engineer_id]) engMap[s.engineer_id].submissions++;
    });
    clocks.forEach((c) => {
      if (engMap[c.user_id]) engMap[c.user_id].hoursWorked += (c.total_minutes || 0) / 60;
    });
    const days = Math.max(1, Math.round(duration / 86400000));
    Object.values(engMap).forEach((e) => { e.hoursWorked = Math.round(e.hoursWorked * 10) / 10; e.avgJobsPerDay = Math.round((e.jobsCompleted / days) * 10) / 10; });
    setEngineerRows(Object.values(engMap).sort((a, b) => b.jobsCompleted - a.jobsCompleted));

    // ── Top Customers ──
    const custMap: Record<string, { name: string; jobs: number; revenue: number }> = {};
    jobs.forEach((j) => {
      const key = j.customer || "Unknown";
      if (!custMap[key]) custMap[key] = { name: key, jobs: 0, revenue: 0 };
      custMap[key].jobs++;
    });
    invoices.filter((i) => i.status === "paid").forEach((i) => {
      const key = i.customer_name || "Unknown";
      if (!custMap[key]) custMap[key] = { name: key, jobs: 0, revenue: 0 };
      custMap[key].revenue += Number(i.total || 0);
    });
    setTopCustomers(Object.values(custMap).sort((a, b) => b.revenue - a.revenue || b.jobs - a.jobs).slice(0, 8));

    setLoading(false);
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Date Range Picker UI ──────────────────────────────────
  const DateRangePicker = () => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 flex-wrap">
        {(["this_week", "this_month", "last_month", "last_3_months", "last_6_months"] as Preset[]).map((p) => (
          <Button
            key={p}
            variant={preset === p ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => applyPreset(p)}
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button variant={preset === "custom" ? "default" : "outline"} size="sm" className="h-8 text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {preset === "custom" ? `${format(range.from, "d MMM")} – ${format(range.to, "d MMM")}` : "Custom"}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4 space-y-3" align="end">
          <p className="text-sm font-medium">Select range</p>
          <div className="flex gap-3 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground mb-1">From</p>
              <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn("p-3 pointer-events-auto border rounded-lg")} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">To</p>
              <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className={cn("p-3 pointer-events-auto border rounded-lg")} />
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={applyCustomRange} disabled={!customFrom || !customTo}>
            Apply Range
          </Button>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData} title="Refresh">
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Management Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(range.from, "d MMM yyyy")} – {format(range.to, "d MMM yyyy")}
          </p>
        </div>
        <DateRangePicker />
      </div>

      {/* KPI Grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {kpis.map((kpi) => {
          const card = (
            <Card key={kpi.label} className={cn("transition-shadow hover:shadow-md", kpi.link && "cursor-pointer")}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={cn("rounded-lg bg-muted p-2", kpi.color)}>
                    <kpi.icon className="h-4 w-4" />
                  </div>
                  <div className={cn("flex items-center gap-0.5 text-xs font-medium", deltaClass(kpi.delta))}>
                    {deltaIcon(kpi.delta)}
                    {kpi.delta != null && `${Math.abs(kpi.delta)}%`}
                  </div>
                </div>
                <p className="text-xl font-bold leading-none">{loading ? "—" : kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-tight">{kpi.label}</p>
                {kpi.prev != null && !loading && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">prev: {kpi.prev}</p>
                )}
              </CardContent>
            </Card>
          );
          return kpi.link ? <Link key={kpi.label} to={kpi.link}>{card}</Link> : <div key={kpi.label}>{card}</div>;
        })}
      </div>

      {/* Charts row */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="jobs">Job Activity</TabsTrigger>
          <TabsTrigger value="engineers">Engineers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* ── Revenue Tab ── */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={revenueTrend}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="invoicedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v.toLocaleString()}`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="Invoiced" stroke="#22c55e" fill="url(#invoicedGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Revenue" stroke="hsl(var(--primary))" fill="url(#revenueGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Invoice Status</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton /> : statusBreakdown.length === 0 ? (
                  <EmptyState text="No invoice data" />
                ) : (
                  <div className="space-y-2">
                    {[
                      { label: "Paid", color: "#22c55e" },
                      { label: "Sent", color: "hsl(var(--primary))" },
                      { label: "Draft", color: "hsl(var(--muted-foreground))" },
                      { label: "Overdue", color: "hsl(var(--destructive))" },
                    ].map(({ label, color }) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-muted-foreground">{label}</span>
                        </div>
                        <span className="font-semibold">
                          {kpis.find((k) => k.label === "Revenue (Paid)")?.value ?? "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Jobs Tab ── */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Job Creation vs Completion</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={jobTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Created" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Job Status Mix</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton /> : statusBreakdown.length === 0 ? (
                  <EmptyState text="No jobs in range" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2}>
                          {statusBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, String(n).replace(/_/g, " ")]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2">
                      {statusBreakdown.map((s) => (
                        <div key={s.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                            <span className="text-muted-foreground capitalize">{s.name}</span>
                          </div>
                          <span className="font-semibold">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Engineers Tab ── */}
        <TabsContent value="engineers">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Engineer Performance</CardTitle>
                <Link to="/reports/engineers">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    Full Report <TrendingUp className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : engineerRows.length === 0 ? (
                <EmptyState text="No engineer assignments in range" />
              ) : (
                <div className="space-y-3">
                  {/* Mobile: cards. Desktop: table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left font-medium pb-2 pr-4">Engineer</th>
                          <th className="text-right font-medium pb-2 px-3">Jobs Done</th>
                          <th className="text-right font-medium pb-2 px-3">Hours</th>
                          <th className="text-right font-medium pb-2 px-3">Submissions</th>
                          <th className="text-right font-medium pb-2 pl-3">Jobs/Day</th>
                        </tr>
                      </thead>
                      <tbody>
                        {engineerRows.map((eng, i) => (
                          <tr key={eng.id} className={cn("border-b last:border-0", i % 2 === 0 ? "" : "bg-muted/30")}>
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                                  {eng.name[0]}
                                </div>
                                <span className="font-medium">{eng.name}</span>
                                {i === 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Top</Badge>}
                              </div>
                            </td>
                            <td className="text-right py-2.5 px-3 font-semibold text-green-600 dark:text-green-400">{eng.jobsCompleted}</td>
                            <td className="text-right py-2.5 px-3">{eng.hoursWorked}h</td>
                            <td className="text-right py-2.5 px-3">{eng.submissions}</td>
                            <td className="text-right py-2.5 pl-3">
                              <Badge variant="outline" className="text-[11px]">{eng.avgJobsPerDay}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {engineerRows.map((eng, i) => (
                      <div key={eng.id} className="rounded-xl border p-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">{eng.name[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{eng.name}</p>
                          <p className="text-xs text-muted-foreground">{eng.jobsCompleted} jobs · {eng.hoursWorked}h · {eng.submissions} subs</p>
                        </div>
                        {i === 0 && <Badge variant="secondary" className="text-[10px]">Top</Badge>}
                      </div>
                    ))}
                  </div>

                  {/* Bar chart */}
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={engineerRows.map((e) => ({ name: e.name.split(" ")[0], "Jobs Completed": e.jobsCompleted, "Hours": e.hoursWorked }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Jobs Completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Hours" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Customers Tab ── */}
        <TabsContent value="customers">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Customers by Revenue & Job Volume</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : topCustomers.length === 0 ? (
                <EmptyState text="No customer data in range" />
              ) : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={topCustomers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="jobs" name="Jobs" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left font-medium pb-2 pr-4">Customer</th>
                          <th className="text-right font-medium pb-2 px-3">Jobs</th>
                          <th className="text-right font-medium pb-2 pl-3">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCustomers.map((c, i) => (
                          <tr key={c.name} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{c.name}</td>
                            <td className="text-right py-2 px-3">{c.jobs}</td>
                            <td className="text-right py-2 pl-3 font-semibold">£{c.revenue.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Categories Tab ── */}
        <TabsContent value="categories">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Jobs by Category</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton /> : categoryBreakdown.length === 0 ? (
                  <EmptyState text="No category data" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={categoryBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Jobs" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                        {categoryBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Category Share</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton /> : categoryBreakdown.length === 0 ? (
                  <EmptyState text="No data" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={categoryBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="name" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {categoryBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {categoryBreakdown.map((c, i) => (
                        <div key={c.name} className="flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-muted-foreground truncate">{c.name}</span>
                          <span className="font-semibold ml-auto">{c.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 py-2">
      <div className="h-40 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-muted-foreground text-sm">
      <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
      {text}
    </div>
  );
}
