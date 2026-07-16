import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgStatus } from "@/hooks/useOrgStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, RefreshCw, Send, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Ticket = {
  id: string;
  created_at: string;
  updated_at: string;
  ticket_type: string;
  subject: string | null;
  description: string;
  status: "open" | "in_progress" | "resolved";
  priority: string;
  reporter_name: string | null;
  reporter_email: string | null;
  route: string | null;
  page_url: string | null;
  user_agent: string | null;
  app_version: string | null;
  attachment_path: string | null;
  org_id: string | null;
  last_reply_at: string | null;
  last_reply_by_kind: string | null;
  organisations?: { name: string | null } | null;
};

type Reply = {
  id: string;
  ticket_id: string;
  body: string;
  author_kind: string;
  author_name: string | null;
  is_internal_note: boolean;
  created_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  in_progress: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
};

export default function PlatformSupportInbox() {
  const { user } = useAuth();
  const { is_platform_admin, loading: statusLoading } = useOrgStatus();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(params.get("ticket"));
  const [reply, setReply] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "in_progress" | "resolved">("open");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, created_at, updated_at, ticket_type, subject, description, status, priority, reporter_name, reporter_email, route, page_url, user_agent, app_version, attachment_path, org_id, last_reply_at, last_reply_by_kind, organisations:org_id(name)")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Failed to load tickets");
    setTickets((data as unknown as Ticket[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (is_platform_admin) load(); }, [is_platform_admin]);

  const loadReplies = async (ticketId: string) => {
    const { data } = await supabase
      .from("support_ticket_replies")
      .select("id, ticket_id, body, author_kind, author_name, is_internal_note, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setReplies((prev) => ({ ...prev, [ticketId]: (data as Reply[]) || [] }));
  };

  useEffect(() => { if (selected) loadReplies(selected); }, [selected]);

  const filtered = useMemo(() => tickets.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterType !== "all" && t.ticket_type !== filterType) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${t.subject || ""} ${t.description} ${t.reporter_email || ""} ${t.organisations?.name || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [tickets, filterStatus, filterType, search]);

  if (statusLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!is_platform_admin) return <Navigate to="/" replace />;

  const selectedTicket = tickets.find((t) => t.id === selected) || null;
  const rs = selected ? replies[selected] || [] : [];

  const send = async () => {
    if (!user || !selectedTicket || reply.trim().length < 2) return;
    setSending(true);
    const { error } = await supabase.from("support_ticket_replies").insert({
      ticket_id: selectedTicket.id,
      author_user_id: user.id,
      author_name: user.email || "Servexa Support",
      author_email: user.email || undefined,
      author_kind: "operator",
      body: reply.trim().slice(0, 4000),
      is_internal_note: isNote,
    });
    setSending(false);
    if (error) return toast.error("Could not send");
    setReply("");
    if (!isNote) {
      supabase.functions.invoke("notify-support-ticket", {
        body: { ticketId: selectedTicket.id, event: "reply", replyBody: { body: reply.trim(), author_kind: "operator", author_name: "Servexa Support" } },
      }).catch(() => {});
    }
    toast.success(isNote ? "Internal note added" : "Reply sent — user notified");
    setIsNote(false);
    await Promise.all([loadReplies(selectedTicket.id), load()]);
  };

  const setStatus = async (status: Ticket["status"]) => {
    if (!selectedTicket) return;
    const { error } = await supabase
      .from("support_tickets")
      .update({
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
        resolved_by: status === "resolved" ? user?.id : null,
      })
      .eq("id", selectedTicket.id);
    if (error) return toast.error("Could not update status");
    supabase.functions.invoke("notify-support-ticket", {
      body: { ticketId: selectedTicket.id, event: "status_change" },
    }).catch(() => {});
    toast.success(`Status set to ${status.replace("_", " ")}`);
    await load();
  };

  const openCount = tickets.filter((t) => t.status !== "resolved").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" /> Support inbox
            <Badge variant="secondary" className="ml-2">{openCount} open</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">All support & feedback tickets across every subscriber organisation.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[380px_1fr]">
        <Card className="md:max-h-[calc(100vh-180px)] md:overflow-hidden flex flex-col">
          <CardHeader className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="problem">Problem</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Search subject, message, org, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No tickets match.</p>
            ) : (
              <ul className="divide-y">
                {filtered.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => { setSelected(t.id); setParams({ ticket: t.id }); }}
                      className={`w-full text-left p-3 hover:bg-muted/40 ${selected === t.id ? "bg-muted/60" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <Badge className={STATUS_STYLE[t.status]} variant="outline">{t.status.replace("_", " ")}</Badge>
                        <Badge variant="secondary" className="capitalize text-[10px]">{t.ticket_type}</Badge>
                      </div>
                      <p className="text-sm font-medium mt-1 line-clamp-1">{t.subject || t.description.slice(0, 60)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {t.organisations?.name || "—"} · {t.reporter_email || "no email"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(t.last_reply_at || t.updated_at), { addSuffix: true })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:max-h-[calc(100vh-180px)] md:overflow-hidden flex flex-col">
          {!selectedTicket ? (
            <CardContent className="p-8 text-center text-sm text-muted-foreground">Select a ticket to view the conversation.</CardContent>
          ) : (
            <>
              <CardHeader className="border-b space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{selectedTicket.subject || selectedTicket.description.slice(0, 80)}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedTicket.organisations?.name || "—"} · {selectedTicket.reporter_name || "?"} &lt;{selectedTicket.reporter_email || "no email"}&gt;
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Route <code>{selectedTicket.route || "—"}</code> · v{selectedTicket.app_version || "?"} · raised {formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Select value={selectedTicket.status} onValueChange={(v) => setStatus(v as Ticket["status"])}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="overflow-y-auto space-y-3 py-4">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs font-medium mb-1">{selectedTicket.reporter_name || selectedTicket.reporter_email || "Reporter"}</p>
                  <p className="whitespace-pre-wrap text-sm">{selectedTicket.description}</p>
                  {selectedTicket.attachment_path && (
                    <AttachmentLink path={selectedTicket.attachment_path} />
                  )}
                </div>
                {rs.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-md p-3 ${
                      r.is_internal_note
                        ? "bg-yellow-100/60 border border-yellow-300 dark:bg-yellow-950/40"
                        : r.author_kind === "operator"
                          ? "bg-primary/5 border border-primary/20"
                          : "bg-muted/30"
                    }`}
                  >
                    <p className="text-xs font-medium mb-1 flex items-center gap-1">
                      {r.is_internal_note && <StickyNote className="h-3 w-3" />}
                      {r.author_kind === "operator" ? "Servexa Support" : (r.author_name || "User")}
                      {r.is_internal_note && <span className="ml-1 text-yellow-700 dark:text-yellow-400">internal note</span>}
                      <span className="ml-2 text-muted-foreground font-normal">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                  </div>
                ))}
              </CardContent>
              <div className="border-t p-3 space-y-2">
                <Textarea
                  placeholder={isNote ? "Internal note (not sent to user)…" : "Reply — will email the user"}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={isNote} onChange={(e) => setIsNote(e.target.checked)} />
                    Internal note (Servexa only)
                  </label>
                  <Button size="sm" onClick={send} disabled={sending || reply.trim().length < 2}>
                    <Send className="mr-2 h-4 w-4" />
                    {isNote ? "Add note" : "Send reply"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function AttachmentLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("support-attachments").createSignedUrl(path, 300).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">
      View attachment
    </a>
  );
}
