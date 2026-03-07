import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Job {
  id?: string;
  name?: string;
  reference_number?: string;
  category?: string;
  priority?: string;
  customer?: string;
  address?: string;
  job_type?: string;
  status?: string;
  due_date?: string;
  visual_qty?: number;
  pressure_test_qty?: number;
  other_service_type?: string;
}

interface Props {
  job: Job;
  trigger?: React.ReactNode;
}

// Minimal markdown renderer (bold, headers, lists)
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return <h3 key={i} className="mt-3 mb-1 text-sm font-semibold text-foreground">{line.slice(3)}</h3>;
        }
        if (line.startsWith("# ")) {
          return <h2 key={i} className="mt-4 mb-1 text-base font-bold text-foreground">{line.slice(2)}</h2>;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span className="text-muted-foreground">{line.slice(2)}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const numEnd = line.indexOf(". ");
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary font-medium shrink-0">{line.slice(0, numEnd + 1)}</span>
              <span className="text-muted-foreground">{line.slice(numEnd + 2)}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        // Bold inline
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className="text-muted-foreground">
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-foreground font-semibold">{part}</strong> : part)}
          </p>
        );
      })}
    </div>
  );
}

export default function AiJobBriefDialog({ job, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [streaming, setStreaming] = useState(false);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setBrief("");
    setStreaming(true);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Not authenticated", description: "Please sign in to use AI features.", variant: "destructive" });
        setStreaming(false);
        return;
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-job-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ job }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        if (resp.status === 429) toast({ title: "Rate limit reached", description: err.error, variant: "destructive" });
        else if (resp.status === 402) toast({ title: "AI credits exhausted", description: err.error, variant: "destructive" });
        else toast({ title: "Error", description: err.error || "Failed to generate brief", variant: "destructive" });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      let accumulated = "";

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { accumulated += content; setBrief(accumulated); }
          } catch { /* partial */ }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast({ title: "Error generating brief", description: e.message, variant: "destructive" });
      }
    } finally {
      setStreaming(false);
    }
  }, [job, toast]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && !brief) generate();
    if (!v && abortRef.current) abortRef.current.abort();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(brief);
    toast({ title: "Copied to clipboard" });
  };

  const download = () => {
    const blob = new Blob([brief], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Job-Brief-${job.reference_number || job.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      {trigger ? (
        <div onClick={() => handleOpen(true)}>{trigger}</div>
      ) : (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => handleOpen(true)}>
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Job Brief
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0" style={{ height: "80vh" }}>
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Job Brief
            </DialogTitle>
            <DialogDescription>
              {job.reference_number} · {job.name}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-5 py-4">
            {streaming && brief === "" && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating brief…
              </div>
            )}
            {brief && (
              <div className="pb-4">
                <SimpleMarkdown text={brief} />
                {streaming && (
                  <span className="inline-block h-4 w-0.5 bg-primary animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}
          </ScrollArea>

          <div className="border-t px-5 py-3 flex items-center justify-between gap-3 bg-card">
            <Button variant="outline" size="sm" onClick={() => handleOpen(false)}>Close</Button>
            <div className="flex items-center gap-2">
              {brief && !streaming && (
                <>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={copyToClipboard}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={download}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </>
              )}
              <Button size="sm" className="gap-1.5" onClick={generate} disabled={streaming}>
                {streaming
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                  : <><RefreshCw className="h-3.5 w-3.5" /> Regenerate</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
