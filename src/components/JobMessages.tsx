import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobMessagesProps {
  jobId: string;
}

type Message = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  read_by: string[];
  sender_name?: string;
};

export default function JobMessages({ jobId }: JobMessagesProps) {
  const { user, userRole, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("job_messages" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (data) {
      const msgs = (data as unknown) as Message[];
      // Fetch sender names
      const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", senderIds);
        const map: Record<string, string> = {};
        (profs || []).forEach((p) => { map[p.user_id] = p.full_name; });
        setProfiles(map);
        setMessages(msgs.map((m) => ({ ...m, sender_name: map[m.sender_id] })));
      } else {
        setMessages(msgs);
      }
      // Mark unread as read
      const unread = msgs.filter((m) => !m.read_by.includes(user?.id || ""));
      if (unread.length > 0 && user) {
        for (const msg of unread) {
          await supabase
            .from("job_messages" as any)
            .update({ read_by: [...msg.read_by, user.id] } as any)
            .eq("id", msg.id);
        }
      }
    }
  };

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`job-messages-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_messages", filter: `job_id=eq.${jobId}` }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          if (prev.find((m) => m.id === newMsg.id)) return prev;
          return [...prev, { ...newMsg, sender_name: profiles[newMsg.sender_id] || "Unknown" }];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!content.trim() || !user) return;
    setSending(true);
    await supabase.from("job_messages" as any).insert({
      job_id: jobId,
      sender_id: user.id,
      content: content.trim(),
      read_by: [user.id],
    } as any);
    setContent("");
    setSending(false);
    fetchMessages();
  };

  const unreadCount = messages.filter((m) => m.sender_id !== user?.id && !m.read_by.includes(user?.id || "")).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" />
          Job Messages
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-auto text-xs">{unreadCount} new</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={cn("flex flex-col gap-0.5", isMine ? "items-end" : "items-start")}>
                <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", isMine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {msg.content}
                </div>
                <p className="text-xs text-muted-foreground">
                  {!isMine && <span className="font-medium">{msg.sender_name || "Unknown"} · </span>}
                  {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {" "}
                  {new Date(msg.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            rows={2}
            className="resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button size="icon" onClick={handleSend} disabled={!content.trim() || sending} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
