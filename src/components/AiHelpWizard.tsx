import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, X, Send, Loader2, Bot, User, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED_QUESTIONS = [
  "How do I create a new job?",
  "How does auto-attach paperwork work?",
  "How do I schedule a visit for an engineer?",
  "What job statuses are available?",
];

export default function AiHelpWizard() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && !minimised) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimised]);

  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, minimised]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setStreaming(true);

    let assistantContent = "";

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-help-wizard`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: updatedMessages }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to connect to AI" }));
        if (resp.status === 429) toast.error(err.error || "Rate limit reached");
        else if (resp.status === 402) toast.error(err.error || "AI credits exhausted");
        else toast.error(err.error || "AI error, please try again");
        setStreaming(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let done = false;

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { done: readDone, value } = await reader.read();
        if (readDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) {
              assistantContent += chunk;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: assistantContent };
                }
                return copy;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remainder
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) {
              assistantContent += chunk;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: assistantContent };
                return copy;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      toast.error("Failed to reach AI assistant");
      console.error(e);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <>
      {/* Floating button */}
      {(!open || minimised) && (
        <button
          onClick={() => { setOpen(true); setMinimised(false); }}
          className={cn(
            "fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg",
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200",
            "text-sm font-medium"
          )}
          aria-label="Open AI Help Wizard"
        >
          <Sparkles className="h-4 w-4" />
          <span>AI Help</span>
        </button>
      )}

      {/* Chat panel */}
      {open && !minimised && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 flex flex-col rounded-2xl shadow-2xl border border-border",
            "bg-background w-[370px] h-[540px] max-h-[80vh]"
          )}
          style={{ boxShadow: "0 20px 60px hsl(var(--primary) / 0.15), 0 4px 16px hsl(var(--foreground) / 0.08)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 rounded-t-2xl bg-primary text-primary-foreground shrink-0">
            <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary-foreground/20">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">FieldReport Assistant</p>
              <p className="text-[11px] opacity-70 mt-0.5">Ask me anything about the app</p>
            </div>
            <button onClick={() => setMinimised(true)} className="opacity-70 hover:opacity-100 transition-opacity p-1 rounded" title="Minimise">
              <ChevronDown className="h-4 w-4" />
            </button>
            <button onClick={() => { setOpen(false); reset(); }} className="opacity-70 hover:opacity-100 transition-opacity p-1 rounded" title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-2">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">How can I help you today?</p>
                  <p className="text-xs text-muted-foreground mt-1">Ask about any feature, workflow, or setting</p>
                </div>
                <div className="w-full grid grid-cols-1 gap-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="flex items-end justify-center h-6 w-6 rounded-full bg-primary/10 shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary mb-0.5" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {msg.role === "assistant" && msg.content === "" && streaming ? (
                    <span className="flex gap-1 items-center h-4">
                      <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-muted-foreground/60" style={{ animationDelay: "0ms" }} />
                      <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-muted-foreground/60" style={{ animationDelay: "120ms" }} />
                      <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-muted-foreground/60" style={{ animationDelay: "240ms" }} />
                    </span>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="flex items-end justify-center h-6 w-6 rounded-full bg-primary shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary-foreground mb-0.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Clear chat */}
            {messages.length > 0 && !streaming && (
              <div className="flex justify-center">
                <button onClick={reset} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  Clear conversation
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border p-3">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about FieldReport…"
                rows={1}
                className="resize-none text-sm min-h-[38px] max-h-[100px] py-2 leading-relaxed"
                disabled={streaming}
              />
              <Button
                size="icon"
                className="h-[38px] w-[38px] shrink-0"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
              >
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
