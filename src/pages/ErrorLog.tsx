import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";
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
  api: "bg-amber-100 text-amber-800",
  edge: "bg-blue-100 text-blue-800",
  client: "bg-slate-100 text-slate-800",
};

export default function ErrorLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_errors")
      .select("id, created_at, source, message, stack, page_url, route, user_id, user_agent, context")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Failed to load error log");
    setRows((data as Row[] | null) ?? []);
    setLoading(false);
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

  const filtered = rows.filter((r) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      r.message.toLowerCase().includes(q) ||
      (r.route ?? "").toLowerCase().includes(q) ||
      (r.source ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Error log
          </h1>
          <p className="text-sm text-muted-foreground">
            Automatically captured frontend errors. Rows older than 60 days are purged nightly.
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

      <Input
        placeholder="Filter by message, route, or source…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-md"
      />

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
                return (
                  <li key={r.id} className="p-4 hover:bg-muted/30">
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-3 flex-wrap">
                        <Badge className={SOURCE_COLOURS[r.source] ?? "bg-slate-100 text-slate-800"}>
                          {r.source}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm break-words">{r.message}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.route ?? "—"} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
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
                          <p><strong>User:</strong> {r.user_id}</p>
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
