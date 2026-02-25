import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, CheckCircle2, Clock, Package, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

type EngStat = {
  user_id: string;
  full_name: string;
  jobsCompleted: number;
  totalJobs: number;
  hoursClocked: number;
  partsUsed: number;
  completionRate: number;
};

export default function EngineerReport() {
  const [engineers, setEngineers] = useState<EngStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const now = new Date();
      let since: string;
      if (period === "week") {
        since = new Date(now.getTime() - 7 * 86400000).toISOString();
      } else if (period === "month") {
        since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else {
        since = new Date(now.getFullYear(), 0, 1).toISOString();
      }

      // Get engineers
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "engineer");
      const engIds = (roles || []).map((r) => r.user_id);
      if (engIds.length === 0) { setEngineers([]); setLoading(false); return; }

      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);

      // Get assignments + jobs in period
      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("engineer_id, job_id, assigned_at")
        .in("engineer_id", engIds)
        .gte("assigned_at", since);

      // Get all jobs referenced
      const allJobIds = [...new Set((assignments || []).map((a) => a.job_id))];
      const { data: jobs } = allJobIds.length > 0
        ? await supabase.from("jobs").select("id, status").in("id", allJobIds)
        : { data: [] };

      // Get time clock entries
      const { data: clocks } = await supabase
        .from("time_clock")
        .select("user_id, total_minutes")
        .in("user_id", engIds)
        .gte("clock_in_at", since)
        .not("total_minutes", "is", null);

      // Get parts
      const { data: parts } = await supabase
        .from("job_parts")
        .select("added_by, quantity")
        .in("added_by", engIds)
        .gte("created_at", since);

      const jobMap: Record<string, string> = {};
      (jobs || []).forEach((j) => { jobMap[j.id] = j.status; });

      const stats: EngStat[] = (profs || []).map((p) => {
        const myAssignments = (assignments || []).filter((a) => a.engineer_id === p.user_id);
        const myJobIds = myAssignments.map((a) => a.job_id);
        const totalJobs = myJobIds.length;
        const jobsCompleted = myJobIds.filter((id) => jobMap[id] === "completed").length;
        const hoursClocked = Math.round(
          (clocks || []).filter((c) => c.user_id === p.user_id).reduce((s, c) => s + (c.total_minutes || 0), 0) / 60 * 10
        ) / 10;
        const partsUsed = Math.round(
          (parts || []).filter((pt) => pt.added_by === p.user_id).reduce((s, pt) => s + Number(pt.quantity || 0), 0)
        );
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          jobsCompleted,
          totalJobs,
          hoursClocked,
          partsUsed,
          completionRate: totalJobs > 0 ? Math.round((jobsCompleted / totalJobs) * 100) : 0,
        };
      });

      stats.sort((a, b) => b.jobsCompleted - a.jobsCompleted);
      setEngineers(stats);
      setLoading(false);
    };
    load();
  }, [period]);

  const totals = engineers.reduce(
    (acc, e) => ({
      jobs: acc.jobs + e.jobsCompleted,
      hours: acc.hours + e.hoursClocked,
      parts: acc.parts + e.partsUsed,
    }),
    { jobs: 0, hours: 0, parts: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Engineer Performance</h1>
          <p className="text-sm text-muted-foreground">Jobs completed, hours clocked, and parts used per engineer</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Jobs Completed", value: totals.jobs, icon: CheckCircle2, color: "text-green-500" },
          { label: "Hours Clocked", value: totals.hours, icon: Clock, color: "text-blue-500" },
          { label: "Parts Used", value: totals.parts, icon: Package, color: "text-amber-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`rounded-lg bg-muted p-2.5 ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart */}
      {engineers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs Completed by Engineer</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={engineers}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="full_name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="jobsCompleted" fill="hsl(var(--primary))" name="Completed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Individual Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-center text-muted-foreground">Loading...</p>
          ) : engineers.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No data for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engineer</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Parts Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineers.map((eng) => (
                  <TableRow key={eng.user_id}>
                    <TableCell className="font-medium">{eng.full_name}</TableCell>
                    <TableCell className="text-right">{eng.totalJobs}</TableCell>
                    <TableCell className="text-right">{eng.jobsCompleted}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={eng.completionRate >= 80 ? "default" : eng.completionRate >= 50 ? "secondary" : "destructive"}>
                        {eng.completionRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{eng.hoursClocked}h</TableCell>
                    <TableCell className="text-right">{eng.partsUsed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
