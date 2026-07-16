import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, LifeBuoy, Send, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { openSupportEvent } from "@/components/ReportProblemDialog";
import { useSearchParams } from "react-router-dom";

type Ticket = {
  id: string;
  created_at: string;
  ticket_type: string;
  subject: string | null;
  description: string;
  status: "open" | "in_progress" | "resolved";
  reporter_name: string | null;
  reporter_email: string | null;
  route: string | null;
  last_reply_at: string | null;
  last_reply_by_kind: string | null;
  user_id: string | null;
  org_id: string | null;
};

type Reply = {
  id: string;
  ticket_id: string;
  body: string;
  author_kind: string;
  author_name: string | null;
  created_at: string;
  is_internal_note: boolean;
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  in_progress: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
};

export default function MyTickets() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(params.get("ticket"));
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    // Check role — org admins see all org tickets; users see their own.
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roleRow || []).some((r: any) => r.role === "admin");
    setIsOrgAdmin(isAdmin);

    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, created_at, ticket_type, subject, description, status, reporter_name, reporter_email, route, last_reply_at, last_reply_by_kind, user_id, org_id")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) toast.error("Failed to load tickets");
    setTickets((data as Ticket[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const loadReplies = async (ticketId: string) => {
    const { data } = await supabase
      .from("support_ticket_replies")
      .select("id, ticket_id, body, author_kind, author_name, created_at, is_internal_note")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setReplies((prev) => ({ ...prev, [ticketId]: (data as Reply[]) || [] }));
  };

  useEffect(() => {
    if (expanded) loadReplies(expanded);
  }, [expanded]);

  const toggle = (id: string) => {
    setExpanded((cur) => {
      const next = cur === id ? null : id;
      if (next) setParams({ ticket: next }); else setParams({});
      return next;
    });
    setReply("");
  };

  const sendReply = async (ticket: Ticket) => {
    if (!user || reply.trim().length < 2) return;
    setSending(true);
    const kind = ticket.user_id === user.id ? "reporter" : "org_admin";
    const { error } = await supabase.from("support_ticket_replies").insert({
      ticket_id: ticket.id,
      author_user_id: user.id,
      author_name: user.email || undefined,
      author_email: user.email || undefined,
      author_kind: kind,
      body: reply.trim().slice(0, 4000),
      is_internal_note: false,
    });
    setSending(false);
    if (error) return toast.error("Could not send reply");
    setReply("");
    toast.success("Reply sent");
    supabase.functions.invoke("notify-support-ticket", {
      body: { ticketId: ticket.id, event: "reply", replyBody: { body: reply.trim(), author_kind: kind, author_name: user.email } },
    }).catch(() => {});
    await Promise.all([loadReplies(ticket.id), load()]);
  };

  const grouped = useMemo(() => ({
    active: tickets.filter((t) => t.status !== "resolved"),
    resolved: tickets.filter((t) => t.status === "resolved"),
  }), [tickets]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" /> My tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            {isOrgAdmin
              ? "All support tickets raised by users in your organisation."
              : "Support & feedback tickets you've raised."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent(openSupportEvent))}>
            <Plus className="mr-2 h-4 w-4" /> New ticket
          </Button>
        </div>
      </div>

      {(["active", "resolved"] as const).map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base capitalize">
              {group === "active" ? "Active" : "Resolved"} ({grouped[group].length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {grouped[group].length === 0 && !loading ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No {group} tickets.</p>
            ) : (
              <ul className="divide-y">
                {grouped[group].map((t) => {
                  const isOpen = expanded === t.id;
                  const rs = replies[t.id] || [];
                  return (
                    <li key={t.id} className="p-4 hover:bg-muted/30">
                      <button onClick={() => toggle(t.id)} className="w-full text-left">
                        <div className="flex items-start gap-3 flex-wrap">
                          <Badge className={STATUS_STYLE[t.status] || ""} variant="outline">{t.status.replace("_", " ")}</Badge>
                          <Badge variant="secondary" className="capitalize">{t.ticket_type}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm break-words">{t.subject || t.description.slice(0, 80)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {isOrgAdmin && t.reporter_name ? `${t.reporter_name} · ` : ""}
                              {formatDistanceToNow(new Date(t.last_reply_at || t.created_at), { addSuffix: true })}
                              {t.last_reply_by_kind === "operator" ? " · new reply from Servexa" : ""}
                            </p>
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="mt-3 space-y-3 text-sm border-t pt-3">
                          <div className="rounded-md bg-muted/40 p-3">
                            <p className="whitespace-pre-wrap">{t.description}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Raised {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                              {t.route ? ` · from ${t.route}` : ""}
                            </p>
                          </div>
                          {rs.map((r) => (
                            <div
                              key={r.id}
                              className={`rounded-md p-3 ${
                                r.author_kind === "operator"
                                  ? "bg-primary/5 border border-primary/20"
                                  : "bg-muted/30"
                              }`}
                            >
                              <p className="text-xs font-medium mb-1">
                                {r.author_kind === "operator" ? "Servexa Support" : (r.author_name || "You")}
                                <span className="ml-2 text-muted-foreground font-normal">
                                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                                </span>
                              </p>
                              <p className="whitespace-pre-wrap">{r.body}</p>
                            </div>
                          ))}
                          {t.status !== "resolved" && (
                            <div className="space-y-2">
                              <Textarea
                                placeholder="Reply…"
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                rows={3}
                              />
                              <div className="flex justify-end">
                                <Button size="sm" onClick={() => sendReply(t)} disabled={sending || reply.trim().length < 2}>
                                  <Send className="mr-2 h-4 w-4" /> Send reply
                                </Button>
                              </div>
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
      ))}
    </div>
  );
}
