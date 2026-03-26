import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, X, Minimize2, Maximize2, Loader2 } from "lucide-react";
import VoiceDictationButton from "@/components/VoiceDictationButton";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const QUICK_PROMPTS = [
  "What should I check first on this system?",
  "What parts might I need?",
  "Is this safe to work on?",
  "What are the relevant BS standards?",
];

function renderMarkdown(text: string) {
  // Minimal markdown: bold, code, bullets
  const raw = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class=\"bg-muted px-1 rounded text-xs\">$1</code>")
    .replace(/^## (.+)$/gm, "<p class=\"font-semibold mt-2 mb-0.5 text-sm\">$1</p>")
    .replace(/^- (.+)$/gm, "<li class=\"ml-3 text-xs list-disc\">$1</li>")
    .replace(/\n/g, "<br/>");
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["strong", "code", "p", "li", "br"],
    ALLOWED_ATTR: ["class"],
  });
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface JobContext {
  job_name?: string;
  category?: string;
  customer?: string;
  site?: string;
  priority?: string;
  description?: string;
}

interface Props {
  jobContext: JobContext;
}

export default function TechnicianAssistant({ jobContext }: Props) {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || streaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: userText };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let assistantText = "";

    try {
      // Get the current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/technician-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          job_context: jobContext,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        if (resp.status === 429) throw new Error("Rate limit exceeded. Please wait a moment.");
        if (resp.status === 402) throw new Error("AI credits exhausted.");
        throw new Error(errData.error || "Failed to connect to AI assistant");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              assistantText += chunk;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch { /* partial */ }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err.message}` }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setOpen(true)}
          size="lg"
          className="rounded-full h-12 w-12 p-0 shadow-lg gap-0"
        >
          <Bot className="h-5 w-5" />
        </Button>
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
      </div>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col rounded-xl border bg-card shadow-2xl transition-all ${minimised ? "h-12 w-72" : "w-80 h-[500px]"}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b rounded-t-xl bg-primary text-primary-foreground">
        <Bot className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">AI Technician Assistant</p>
          {!minimised && <p className="text-[10px] opacity-70 truncate">{jobContext.job_name || "Job"}</p>}
        </div>
        <button onClick={() => setMinimised((v) => !v)} className="opacity-70 hover:opacity-100">
          {minimised ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => { setOpen(false); abortRef.current?.abort(); }} className="opacity-70 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!minimised && (
        <>
          <ScrollArea className="flex-1 px-3 py-2">
            {messages.length === 0 && (
              <div className="space-y-2 py-2">
                <div className="flex items-start gap-2">
                  <Bot className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                  <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground max-w-[85%]">
                    Hi! I'm your on-site AI assistant for <strong>{jobContext.job_name || "this job"}</strong>.
                    Ask me about diagnosis, parts, procedures, or safety requirements.
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="w-full text-left text-[11px] rounded border border-dashed px-2 py-1.5 hover:bg-muted/50 text-muted-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex items-start gap-2 mb-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                {m.role === "assistant" && <Bot className="h-4 w-4 shrink-0 mt-1 text-primary" />}
                <div
                  className={`rounded-lg px-3 py-2 text-xs max-w-[85%] ${m.role === "user" ? "bg-primary text-primary-foreground ml-auto" : "bg-muted text-foreground"}`}
                >
                  {m.role === "assistant" ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content || "…") }} />
                  ) : (
                    m.content
                  )}
                  {m.role === "assistant" && streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-3 bg-foreground/60 ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </ScrollArea>

          <div className="px-3 py-2 border-t flex items-end gap-1.5">
            <VoiceDictationButton
              onTranscript={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)}
              className="h-8 w-8"
            />
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask or dictate…"
              className="min-h-[2rem] max-h-24 resize-none text-xs flex-1"
              rows={1}
            />
            <Button
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={() => send()}
              disabled={!input.trim() || streaming}
            >
              {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
