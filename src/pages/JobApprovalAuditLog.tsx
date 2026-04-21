import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ShieldCheck, XCircle, Search } from "lucide-react";

type LogRow = {
  id: string;
  job_id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
  job?: { reference_number: string | null; name: string | null; rejection_reason: string | null } | null;
  actor?: { full_name: string | null } | null;
};

type ActionKind = "approved" | "rejected" | "other";

function classify(details: string | null): ActionKind {
  if (!details) return "other";
  // Approval = pending_review -> active
  if (/from\s+pending_review\s+to\s+active/i.test(details)) return "approved";
  if (/to\s+rejected/i.test(details)) return "rejected";
  return "other";
}

function extractReason(details: string | null): string | null {
  if (!details) return null;
  const m = details.match(/Reason:\s*(.+)$/);
  return m ? m[1].trim() : null;
}

export default function JobApprovalAuditLog() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ActionKind>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Pull recent status_change entries — filter to approve/reject client-side
      const { data: rows } = await supabase
        .from("job_activity_log")
        .select("id, job_id, user_id, action, details, created_at")
        .eq("action", "status_change")
        .order("created_at", { ascending: false })
        .limit(500);

      const filtered = (rows || []).filter((r) => {
        const k = classify(r.details);
        return k === "approved" || k === "rejected";
      });

      const jobIds = Array.from(new Set(filtered.map((r) => r.job_id))).filter(Boolean);
      const userIds = Array.from(new Set(filtered.map((r) => r.user_id).filter(Boolean))) as string[];

      const [jobsRes, profilesRes] = await Promise.all([
        jobIds.length
          ? supabase.from("jobs").select("id, reference_number, name, rejection_reason").in("id", jobIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const jobMap = new Map((jobsRes.data || []).map((j: any) => [j.id, j]));
      const userMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));

      setLogs(
        filtered.map((r) => ({
          ...r,
          job: jobMap.get(r.job_id) || null,
          actor: r.user_id ? userMap.get(r.user_id) || null : null,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((r) => {
      const kind = classify(r.details);
      if (filter !== "all" && kind !== filter) return false;
      if (!q) return true;
      const hay = [
        r.job?.reference_number,
        r.job?.name,
        r.actor?.full_name,
        r.details,
        r.job?.rejection_reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logs, search, filter]);

  const counts = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    for (const r of logs) {
      const k = classify(r.details);
      if (k === "approved") approved++;
      else if (k === "rejected") rejected++;
    }
    return { approved, rejected };
  }, [logs]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Job Approval Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Record of who approved or rejected jobs, with timestamps and rejection reasons where available.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{logs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-green-600" /> Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-green-700">{counts.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-destructive" /> Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-destructive">{counts.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by job, person or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="approved">Approved only</SelectItem>
            <SelectItem value="rejected">Rejected only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">When</TableHead>
                <TableHead className="w-[110px]">Action</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No matching events.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((row) => {
                  const kind = classify(row.details);
                  const reason =
                    extractReason(row.details) ||
                    (kind === "rejected" ? row.job?.rejection_reason ?? null : null);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(row.created_at), "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell>
                        {kind === "approved" ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-700">Approved</Badge>
                        ) : (
                          <Badge variant="destructive">Rejected</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.job ? (
                          <Link to={`/jobs/${row.job_id}`} className="hover:underline">
                            <span className="font-mono text-xs font-semibold text-primary">
                              {row.job.reference_number || "—"}
                            </span>
                            <span className="text-sm ml-2">{row.job.name}</span>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Job deleted</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.actor?.full_name || (
                          <span className="text-xs text-muted-foreground italic">Unknown / system</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[360px]">
                        {reason || <span className="text-xs italic">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
