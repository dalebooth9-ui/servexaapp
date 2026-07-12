import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, LifeBuoy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

type Row = {
  id: string;
  created_at: string;
  reporter_name: string | null;
  reporter_email: string | null;
  description: string;
  page_url: string | null;
  route: string | null;
  user_agent: string | null;
  status: string;
  resolved_at: string | null;
  resolution_note: string | null;
  context: Record<string, unknown> | null;
};

export default function SupportTickets() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, created_at, reporter_name, reporter_email, description, page_url, route, user_agent, status, resolved_at, resolution_note, context")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Failed to load tickets");
    setRows((data as Row[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
        resolution_note: note.trim() || null,
      })
      .eq("id", id);
    if (error) return toast.error("Could not resolve ticket");
    toast.success("Ticket resolved");
    setExpanded(null);
    setNote("");
    load();
  };

  const reopen = async (id: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: "open", resolved_at: null, resolved_by: null, resolution_note: null })
      .eq("id", id);
    if (error) return toast.error("Could not reopen ticket");
    toast.success("Ticket reopened");
    load();
  };

  const filtered = rows.filter((r) => r.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" />
            Support tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            User-submitted "Report a problem" messages.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === "open" ? "default" : "outline"} size="sm" onClick={() => setTab("open")}>
          Open ({rows.filter((r) => r.status === "open").length})
        </Button>
        <Button variant={tab === "resolved" ? "default" : "outline"} size="sm" onClick={() => setTab("resolved")}>
          Resolved ({rows.filter((r) => r.status === "resolved").length})
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${filtered.length} ticket${filtered.length === 1 ? "" : "s"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 && !loading ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              No {tab} tickets.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <li key={r.id} className="p-4 hover:bg-muted/30">
                    <button
                      onClick={() => { setExpanded(isOpen ? null : r.id); setNote(""); }}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-3 flex-wrap">
                        <Badge variant={r.status === "open" ? "default" : "secondary"}>
                          {r.status}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm break-words">{r.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.reporter_name || r.reporter_email || "Unknown user"} ·{" "}
                            {r.route ?? "—"} ·{" "}
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="mt-3 space-y-3 text-xs">
                        {r.page_url && <p><strong>URL:</strong> {r.page_url}</p>}
                        {r.reporter_email && <p><strong>Email:</strong> {r.reporter_email}</p>}
                        {r.user_agent && <p><strong>Browser:</strong> {r.user_agent}</p>}
                        {r.context && Object.keys(r.context).length > 0 && (
                          <div>
                            <p className="font-semibold mb-1">Recent client errors</p>
                            <pre className="whitespace-pre-wrap break-all bg-muted/50 p-2 rounded max-h-64 overflow-auto">
                              {JSON.stringify(r.context, null, 2)}
                            </pre>
                          </div>
                        )}
                        {r.status === "open" ? (
                          <div className="space-y-2 pt-2 border-t">
                            <Textarea
                              placeholder="Resolution note (optional)"
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              rows={2}
                            />
                            <Button size="sm" onClick={() => resolve(r.id)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark resolved
                            </Button>
                          </div>
                        ) : (
                          <div className="pt-2 border-t space-y-2">
                            {r.resolution_note && <p><strong>Resolution:</strong> {r.resolution_note}</p>}
                            {r.resolved_at && (
                              <p className="text-muted-foreground">
                                Resolved {formatDistanceToNow(new Date(r.resolved_at), { addSuffix: true })}
                              </p>
                            )}
                            <Button size="sm" variant="outline" onClick={() => reopen(r.id)}>
                              Reopen
                            </Button>
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
