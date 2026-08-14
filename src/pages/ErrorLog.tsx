import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UKDateInput } from "@/components/ui/uk-date-input";
import { RefreshCw, Trash2, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  created_at: string;
  source: string;
  message: string;
  stack: string | null;
  page_url: string | null;
  route: string | null;
  user_id: string | null;
  user_agent: string | null;
  context: Record<string, unknown> | null;
};

const SOURCE_COLOURS: Record<string, string> = {
  unhandled: "bg-red-100 text-red-800",
  promise: "bg-orange-100 text-orange-800",
  boundary: "bg-purple-100 text-purple-800",
  toast: "bg-rose-100 text-rose-800",
  api: "bg-amber-100 text-amber-800",
  edge: "bg-blue-100 text-blue-800",
  client: "bg-slate-100 text-slate-800",
};

export default function ErrorLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_errors")
      .select("id, created_at, source, message, stack, page_url, route, user_id, user_agent, context")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Failed to load error log");
    const list = (data as Row[] | null) ?? [];
    setRows(list);
    setLoading(false);

    const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
        map[p.id] = p.full_name || p.id.slice(0, 8);
      });
      setNames(map);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const purgeAll = async () => {
    if (!confirm("Delete every error in the log? This cannot be undone.")) return;
    const { error } = await supabase
      .from("client_errors")
      .delete()
      .not("id", "is", null);
    if (error) return toast.error("Purge failed");
    toast.success("Error log cleared");
    load();
  };

  const userOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[],
    [rows],
  );
  const routeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.route).filter(Boolean))).sort() as string[],
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (userFilter !== "all" && r.user_id !== userFilter) return false;
    if (routeFilter !== "all" && r.route !== routeFilter) return false;
    if (fromDate && r.created_at < new Date(`${fromDate}T00:00:00`).toISOString()) return false;
    if (toDate && r.created_at > new Date(`${toDate}T23:59:59`).toISOString()) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      r.message.toLowerCase().includes(q) ||
      (r.route ?? "").toLowerCase().includes(q) ||
      (r.source ?? "").toLowerCase().includes(q) ||
      (r.stack ?? "").toLowerCase().includes(q)
    );
  });

  const copyEntry = async (r: Row) => {
    const text = [
      `Time: ${new Date(r.created_at).toISOString()}`,
      `Source: ${r.source}`,
      `User: ${r.user_id ? names[r.user_id] ?? r.user_id : "—"}${
        (r.context as { role?: string } | null)?.role ? ` (${(r.context as { role?: string }).role})` : ""
      }`,
      `Route: ${r.route ?? "—"}`,
      `URL: ${r.page_url ?? "—"}`,
      `Message: ${r.message}`,
      `Browser: ${r.user_agent ?? "—"}`,
      r.context && Object.keys(r.context).length ? `Context: ${JSON.stringify(r.context, null, 2)}` : "",
      r.stack ? `Stack:\n${r.stack}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Error detail copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Error log
          </h1>
          <p className="text-sm text-muted-foreground">
            Automatically captured frontend, API and edge-function errors. Entries older than 60 days (or beyond the
            most recent 5,000) are purged automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={purgeAll}>
            <Trash2 className="mr-2 h-4 w-4" /> Clear all
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Search message, route, stack…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger><SelectValue placeholder="All users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {userOptions.map((id) => (
              <SelectItem key={id} value={id}>{names[id] ?? id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={routeFilter} onValueChange={setRouteFilter}>
          <SelectTrigger><SelectValue placeholder="All routes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {routeOptions.map((route) => (
              <SelectItem key={route} value={route}>{route}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <UKDateInput value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="From" />
        <UKDateInput value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="To" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${filtered.length} error${filtered.length === 1 ? "" : "s"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 && !loading ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              No errors captured — nice.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => {
                const isOpen = expanded === r.id;
                const role = (r.context as { role?: string } | null)?.role;
                return (
                  <li key={r.id} className="p-4 hover:bg-muted/30">
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-start gap-3 flex-wrap">
                          <Badge className={SOURCE_COLOURS[r.source] ?? "bg-slate-100 text-slate-800"}>
                            {r.source}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm break-words">{r.message}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {r.user_id ? names[r.user_id] ?? r.user_id.slice(0, 8) : "—"}
                              {role ? ` (${role})` : ""} · {r.route ?? "—"} ·{" "}
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </button>
                      <Button variant="ghost" size="icon" onClick={() => copyEntry(r)} title="Copy full detail">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="mt-3 space-y-2 text-xs">
                        {r.stack && (
                          <div>
                            <p className="font-semibold mb-1">Stack</p>
                            <pre className="whitespace-pre-wrap break-all bg-muted/50 p-2 rounded">
                              {r.stack}
                            </pre>
                          </div>
                        )}
                        {r.page_url && (
                          <p><strong>URL:</strong> {r.page_url}</p>
                        )}
                        {r.user_id && (
                          <p><strong>User:</strong> {names[r.user_id] ?? r.user_id}</p>
                        )}
                        {r.user_agent && (
                          <p><strong>Browser:</strong> {r.user_agent}</p>
                        )}
                        {r.context && Object.keys(r.context).length > 0 && (
                          <div>
                            <p className="font-semibold mb-1">Context</p>
                            <pre className="whitespace-pre-wrap break-all bg-muted/50 p-2 rounded">
                              {JSON.stringify(r.context, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
