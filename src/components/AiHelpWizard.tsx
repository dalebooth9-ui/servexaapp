import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Bot, User, Sparkles, ChevronDown, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";

type QuickAction = { label: string; url: string; description: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  quick_actions?: QuickAction[];
};

// Map route patterns to human-readable names for context
function describeCurrentPage(pathname: string): string {
  if (pathname === "/") return "Dashboard (/)";
  if (pathname === "/jobs") return "Jobs list (/jobs)";
  if (pathname.startsWith("/jobs/")) return `Job detail page (${pathname})`;
  if (pathname === "/customers") return "Customers list (/customers)";
  if (pathname.startsWith("/customers/")) return `Customer detail page (${pathname})`;
  if (pathname === "/invoices") return "Invoices (/invoices)";
  if (pathname.startsWith("/invoices/")) return `Invoice detail (${pathname})`;
  if (pathname === "/planner") return "Weekly Planner (/planner)";
  if (pathname === "/engineers") return "Engineers (/engineers)";
  if (pathname === "/settings") return "Settings (/settings)";
  if (pathname === "/sites") return "Sites (/sites)";
  if (pathname === "/assets") return "Assets (/assets)";
  if (pathname.startsWith("/assets/")) return `Asset detail (${pathname})`;
  if (pathname === "/compliance") return "Compliance (/compliance)";
  if (pathname === "/audits") return "Audits (/audits)";
  if (pathname === "/parts-library") return "Parts Library (/parts-library)";
  if (pathname === "/industry-templates") return "Industry Templates (/industry-templates)";
  if (pathname === "/reports") return "Reports (/reports)";
  if (pathname === "/reports/engineers") return "Engineer Performance Report (/reports/engineers)";
  return pathname;
}

function getPageLabel(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/jobs") return "Jobs";
  if (pathname.startsWith("/jobs/")) return "Job Detail";
  if (pathname === "/customers") return "Customers";
  if (pathname.startsWith("/customers/")) return "Customer Detail";
  if (pathname === "/invoices") return "Invoices";
  if (pathname.startsWith("/invoices/")) return "Invoice Detail";
  if (pathname === "/planner") return "Planner";
  if (pathname === "/engineers") return "Engineers";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/sites") return "Sites";
  if (pathname === "/assets") return "Assets";
  if (pathname.startsWith("/assets/")) return "Asset Detail";
  if (pathname === "/compliance") return "Compliance";
  if (pathname === "/audits") return "Audits";
  if (pathname === "/parts-library") return "Parts Library";
  if (pathname === "/industry-templates") return "Templates";
  if (pathname === "/reports") return "Reports";
  if (pathname === "/reports/engineers") return "Performance";
  return "this page";
}

// Page-specific suggested questions
function getPageSuggestions(pathname: string): string[] {
  if (pathname === "/") return [
    "What's shown on the dashboard?",
    "How do I see today's jobs?",
    "How do I create a new job quickly?",
  ];
  if (pathname === "/jobs") return [
    "How do I create a new job?",
    "What do the job statuses mean?",
    "How do I bulk import jobs?",
    "How do I filter jobs by engineer?",
  ];
  if (pathname.startsWith("/jobs/")) return [
    "How do I assign an engineer to this job?",
    "How do I add parts to this job?",
    "How do I create an invoice from this job?",
    "How do I send a job sheet to an engineer?",
  ];
  if (pathname === "/customers") return [
    "How do I add a new customer?",
    "How do I create a job for a customer?",
    "What is the customer portal?",
  ];
  if (pathname.startsWith("/customers/")) return [
    "How do I create a job for this customer?",
    "How do auto-attach documents work?",
    "How do I send a customer portal link?",
    "How do I add a site to this customer?",
  ];
  if (pathname === "/planner") return [
    "How do I assign a job to an engineer in the planner?",
    "What does the AI Scheduler do?",
    "How do I switch between weekly and monthly view?",
  ];
  if (pathname === "/engineers") return [
    "How do I add a new engineer?",
    "How do I send an onboarding email?",
    "What documents can engineers upload?",
  ];
  if (pathname === "/compliance") return [
    "How do I add a compliance record?",
    "How do expiry alerts work?",
    "What compliance types are supported?",
  ];
  if (pathname === "/invoices") return [
    "How do I create an invoice?",
    "How do I sync invoices with Xero?",
    "What's the difference between an invoice and a quote?",
  ];
  if (pathname === "/assets" || pathname.startsWith("/assets/")) return [
    "How do I add a new asset?",
    "What is a PPM schedule?",
    "How do I attach documents to an asset?",
  ];
  if (pathname === "/settings") return [
    "How do I add job categories?",
    "How do I set up a job sheet template?",
    "How do I connect Xero?",
    "How do I configure WhatsApp?",
  ];
  if (pathname === "/audits") return [
    "How do I create an audit?",
    "How do audit templates work?",
    "How are audit scores calculated?",
  ];
  // Generic fallback
  return [
    "How do I create a new job?",
    "How does auto-attach paperwork work?",
    "How do I schedule a visit for an engineer?",
    "What job statuses are available?",
  ];
}

async function callWizard(
  messages: Array<{ role: string; content: string }>,
  currentPage: string
): Promise<{ message: string; quick_actions: QuickAction[] }> {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-help-wizard`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, currentPage }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Failed to connect to AI" }));
    const status = resp.status;
    throw Object.assign(new Error(err.error || "AI error"), { status });
  }

  return resp.json();
}

export default function AiHelpWizard() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimised, setMinimised] = useState(false);
  // Track the page the wizard was opened on, so navigating away doesn't re-trigger
  const openedOnPage = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, open, minimised]);

  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, minimised]);

  // Auto-fetch context greeting when wizard opens on a new page
  useEffect(() => {
    if (!open || minimised) return;
    if (messages.length > 0) return; // already has conversation
    if (openedOnPage.current === location.pathname) return; // same page, don't re-fetch

    openedOnPage.current = location.pathname;
    const currentPage = describeCurrentPage(location.pathname);
    const contextPrompt = `I just opened the AI assistant. I'm currently on: ${currentPage}. Without me asking anything specific, give me a short, friendly greeting (1 sentence) and then 2–3 of the most useful things I can do or watch out for on this page. Keep it very concise.`;

    setLoading(true);
    setMessages([{ role: "assistant", content: "" }]);

    callWizard([{ role: "user", content: contextPrompt }], currentPage)
      .then(({ message, quick_actions }) => {
        setMessages([{ role: "assistant", content: message, quick_actions }]);
      })
      .catch((e) => {
        // On error, just show empty state — don't block the wizard
        setMessages([]);
        openedOnPage.current = null;
      })
      .finally(() => setLoading(false));
  }, [open, minimised, location.pathname]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const currentPage = describeCurrentPage(location.pathname);

    try {
      const { message, quick_actions } = await callWizard(
        updatedMessages.map(({ role, content }) => ({ role, content })),
        currentPage
      );
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: message, quick_actions: quick_actions || [] };
        return copy;
      });
    } catch (e: any) {
      if (e.status === 429) toast.error("Rate limit reached. Try again in a moment.");
      else if (e.status === 402) toast.error("AI credits exhausted. Please top up.");
      else toast.error("Failed to reach AI assistant");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [loading, messages, location.pathname]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleAction = (action: QuickAction) => {
    navigate(action.url);
    setMinimised(true);
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    openedOnPage.current = null;
  };

  const pageLabel = getPageLabel(location.pathname);
  const pageSuggestions = getPageSuggestions(location.pathname);

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
            "bg-background w-[370px] h-[580px] max-h-[85vh]"
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
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="h-2.5 w-2.5 opacity-60" />
                <p className="text-[11px] opacity-70 truncate">{pageLabel}</p>
              </div>
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

            {/* Empty state — shown while loading initial context OR if context fetch failed */}
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-2">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">How can I help you today?</p>
                  <p className="text-xs text-muted-foreground mt-1">Suggestions for <span className="font-medium text-foreground">{pageLabel}</span>:</p>
                </div>
                <div className="w-full grid grid-cols-1 gap-1.5">
                  {pageSuggestions.map((q) => (
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

                <div className={cn("flex flex-col gap-2", msg.role === "user" ? "items-end max-w-[82%]" : "items-start max-w-[85%]")}>
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    )}
                  >
                    {msg.content === "" && loading && i === messages.length - 1 ? (
                      <span className="flex gap-1 items-center h-4">
                        <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-muted-foreground/60" style={{ animationDelay: "0ms" }} />
                        <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-muted-foreground/60" style={{ animationDelay: "120ms" }} />
                        <span className="animate-bounce h-1.5 w-1.5 rounded-full bg-muted-foreground/60" style={{ animationDelay: "240ms" }} />
                      </span>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>

                  {/* Quick action buttons */}
                  {msg.role === "assistant" && msg.quick_actions && msg.quick_actions.length > 0 && (
                    <div className="flex flex-col gap-1.5 w-full">
                      {msg.quick_actions.map((action, j) => (
                        <button
                          key={j}
                          onClick={() => handleAction(action)}
                          title={action.description}
                          className={cn(
                            "flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium",
                            "border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15",
                            "transition-colors text-left group"
                          )}
                        >
                          <span>{action.label}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Page-specific follow-up suggestions — shown after the first assistant message */}
                  {msg.role === "assistant" && msg.content !== "" && i === messages.length - 1 && !loading && messages.length === 1 && (
                    <div className="flex flex-col gap-1 w-full mt-1">
                      <p className="text-[10px] text-muted-foreground px-1">Ask a follow-up:</p>
                      {pageSuggestions.slice(0, 3).map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="text-left text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
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
            {messages.length > 1 && !loading && (
              <div className="flex justify-center pt-1">
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
                disabled={loading}
              />
              <Button
                size="icon"
                className="h-[38px] w-[38px] shrink-0"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
