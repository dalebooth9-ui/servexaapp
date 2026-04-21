import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ShieldCheck, XCircle, Search, Download, FileJson, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type ColumnKey = "when" | "action" | "job_reference" | "job_name" | "actor" | "reason";
const EXPORT_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "when", label: "When" },
  { key: "action", label: "Action" },
  { key: "job_reference", label: "Job Reference" },
  { key: "job_name", label: "Job Name" },
  { key: "actor", label: "By" },
  { key: "reason", label: "Reason" },
];
const COLUMNS_STORAGE_KEY = "auditLog:exportColumns";

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
type SortKey = "created_at" | "actor" | "job";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

function classify(details: string | null): ActionKind {
  if (!details) return "other";
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
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [counts, setCounts] = useState({ approved: 0, rejected: 0, total: 0 });
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ColumnKey[];
        const valid = parsed.filter((k) => EXPORT_COLUMNS.some((c) => c.key === k));
        if (valid.length > 0) return valid;
      }
    } catch {}
    return EXPORT_COLUMNS.map((c) => c.key);
  });

  useEffect(() => {
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(selectedColumns)); } catch {}
  }, [selectedColumns]);

  const toggleColumn = (key: ColumnKey) => {
    setSelectedColumns((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  // Load global summary counts once
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("job_activity_log")
        .select("details")
        .eq("action", "status_change")
        .limit(5000);
      let approved = 0, rejected = 0, total = 0;
      for (const r of data || []) {
        const k = classify((r as any).details);
        if (k === "approved") { approved++; total++; }
        else if (k === "rejected") { rejected++; total++; }
      }
      setCounts({ approved, rejected, total });
    })();
  }, []);

  // Server-side pagination: we fetch a window ordered by created_at,
  // then apply approve/reject classify filter. To keep page sizes consistent,
  // we over-fetch and slice locally per page.
  useEffect(() => {
    (async () => {
      setLoading(true);
      // Order by created_at on the server (only DB-sortable column reliably).
      const ascending = sortKey === "created_at" ? sortDir === "asc" : false;
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Build query — for "approved" we can match on details substring server-side,
      // for "rejected" likewise; otherwise fetch the page raw.
      let q = supabase
        .from("job_activity_log")
        .select("id, job_id, user_id, action, details, created_at", { count: "exact" })
        .eq("action", "status_change");

      if (filter === "approved") {
        q = q.ilike("details", "%from pending_review to active%");
      } else if (filter === "rejected") {
        q = q.ilike("details", "%to rejected%");
      } else {
        q = q.or("details.ilike.%from pending_review to active%,details.ilike.%to rejected%");
      }

      if (search.trim()) {
        q = q.ilike("details", `%${search.trim()}%`);
      }

      const { data: rows, count } = await q.order("created_at", { ascending }).range(from, to);

      setTotalCount(count || 0);

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
  }, [page, filter, search, sortKey, sortDir]);

  // Reset to first page when filters/search/sort change
  useEffect(() => {
    setPage(0);
  }, [filter, search, sortKey, sortDir]);

  // Apply secondary client-side sort (actor/job) within the current page
  const visible = useMemo(() => {
    const arr = [...logs];
    if (sortKey === "actor") {
      arr.sort((a, b) => {
        const an = (a.actor?.full_name || "").toLowerCase();
        const bn = (b.actor?.full_name || "").toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      });
    } else if (sortKey === "job") {
      arr.sort((a, b) => {
        const an = (a.job?.reference_number || a.job?.name || "").toLowerCase();
        const bn = (b.job?.reference_number || b.job?.name || "").toLowerCase();
        return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
      });
    }
    return arr;
  }, [logs, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  async function fetchExportRows() {
    let q = supabase
      .from("job_activity_log")
      .select("id, job_id, user_id, action, details, created_at")
      .eq("action", "status_change");
    if (filter === "approved") q = q.ilike("details", "%from pending_review to active%");
    else if (filter === "rejected") q = q.ilike("details", "%to rejected%");
    else q = q.or("details.ilike.%from pending_review to active%,details.ilike.%to rejected%");
    if (search.trim()) q = q.ilike("details", `%${search.trim()}%`);
    const { data: rows } = await q.order("created_at", { ascending: false }).limit(5000);

    const filtered = (rows || []).filter((r) => {
      const k = classify(r.details);
      return k === "approved" || k === "rejected";
    });
    const jobIds = Array.from(new Set(filtered.map((r) => r.job_id))).filter(Boolean);
    const userIds = Array.from(new Set(filtered.map((r) => r.user_id).filter(Boolean))) as string[];
    const [jobsRes, profilesRes] = await Promise.all([
      jobIds.length ? supabase.from("jobs").select("id, reference_number, name, rejection_reason").in("id", jobIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const jobMap = new Map((jobsRes.data || []).map((j: any) => [j.id, j]));
    const userMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));

    return filtered.map((r) => {
      const kind = classify(r.details);
      const job = jobMap.get(r.job_id);
      const actor = r.user_id ? userMap.get(r.user_id) : null;
      const reason = extractReason(r.details) || (kind === "rejected" ? job?.rejection_reason ?? "" : "");
      return {
        id: r.id,
        when: r.created_at,
        action: kind === "approved" ? "Approved" : "Rejected",
        job_id: r.job_id,
        job_reference: job?.reference_number || null,
        job_name: job?.name || null,
        actor_user_id: r.user_id,
        actor_name: actor?.full_name || null,
        reason: reason || null,
        details: r.details,
      };
    });
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getCellValue(r: Awaited<ReturnType<typeof fetchExportRows>>[number], key: ColumnKey): string {
    switch (key) {
      case "when": return format(new Date(r.when), "yyyy-MM-dd HH:mm:ss");
      case "action": return r.action;
      case "job_reference": return r.job_reference || "";
      case "job_name": return r.job_name || "";
      case "actor": return r.actor_name || "Unknown";
      case "reason": return r.reason || "";
    }
  }

  async function exportCsv() {
    if (selectedColumns.length === 0) return;
    const rows = await fetchExportRows();
    // Preserve canonical column order regardless of toggle order
    const cols = EXPORT_COLUMNS.filter((c) => selectedColumns.includes(c.key));
    const headers = cols.map((c) => c.label);
    const rowsCsv = rows.map((r) => cols.map((c) => getCellValue(r, c.key)));
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rowsCsv].map((r) => r.map(escape).join(",")).join("\n");
    downloadBlob(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
      `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
  }

  async function exportJson() {
    const rows = await fetchExportRows();
    const cols = EXPORT_COLUMNS.filter((c) => selectedColumns.includes(c.key));
    const fieldMap: Record<ColumnKey, string> = {
      when: "when", action: "action", job_reference: "job_reference",
      job_name: "job_name", actor: "actor_name", reason: "reason",
    };
    const projected = cols.length === 0
      ? rows
      : rows.map((r) => Object.fromEntries(cols.map((c) => [fieldMap[c.key], (r as any)[fieldMap[c.key]]])));
    const payload = {
      exported_at: new Date().toISOString(),
      filter,
      search: search.trim() || null,
      columns: cols.map((c) => c.label),
      count: rows.length,
      rows: projected,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" }),
      `audit-log-${format(new Date(), "yyyy-MM-dd")}.json`,
    );
  }

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
            <div className="text-2xl font-semibold">{counts.total}</div>
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
            placeholder="Search by reason or status text…"
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
        <Button variant="outline" onClick={exportCsv} disabled={totalCount === 0}>
          <Download className="h-4 w-4" />
          Export CSV ({totalCount})
        </Button>
        <Button variant="outline" onClick={exportJson} disabled={totalCount === 0}>
          <FileJson className="h-4 w-4" />
          Export JSON ({totalCount})
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">
                  <button
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                    onClick={() => toggleSort("created_at")}
                  >
                    When <SortIcon col="created_at" />
                  </button>
                </TableHead>
                <TableHead className="w-[110px]">Action</TableHead>
                <TableHead>
                  <button
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                    onClick={() => toggleSort("job")}
                  >
                    Job <SortIcon col="job" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                    onClick={() => toggleSort("actor")}
                  >
                    By <SortIcon col="actor" />
                  </button>
                </TableHead>
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

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {totalCount === 0
            ? "No results"
            : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
