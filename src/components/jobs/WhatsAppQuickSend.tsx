import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, ArrowLeft, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type JobContext = {
  reference_number?: string | null;
  name?: string | null;
  description?: string | null;
  scheduled_date?: string | null;
  priority?: string | null;
  customers?: { name?: string | null; phone?: string | null } | null;
  sites?: { name?: string | null; address?: string | null } | null;
};

type Step = "compose" | "preview";

export default function WhatsAppQuickSend({ jobId, jobRef }: { jobId: string; jobRef: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("compose");
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<JobContext | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const { toast } = useToast();

  const buildDefaultMessage = (j: JobContext | null) => {
    if (!j) return "";
    const lines: string[] = [];
    lines.push(`Job ${j.reference_number || jobRef}${j.name ? ` — ${j.name}` : ""}`);
    if (j.customers?.name) lines.push(`Customer: ${j.customers.name}`);
    if (j.sites?.name || j.sites?.address) {
      lines.push(`Site: ${[j.sites?.name, j.sites?.address].filter(Boolean).join(", ")}`);
    }
    if (j.scheduled_date) {
      const d = new Date(j.scheduled_date);
      if (!isNaN(d.getTime())) lines.push(`Scheduled: ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
    }
    if (j.priority) lines.push(`Priority: ${j.priority}`);
    if (j.description) lines.push("", j.description);
    return lines.join("\n");
  };

  const loadContext = async () => {
    setLoadingEngineers(true);

    const [assignRes, jobRes] = await Promise.all([
      supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
      supabase
        .from("jobs")
        .select("reference_number, name, description, scheduled_date, priority, customers(name, phone), sites(name, address)")
        .eq("id", jobId)
        .maybeSingle(),
    ]);

    const j = (jobRes.data as JobContext | null) || null;
    setJob(j);
    setMessage(buildDefaultMessage(j));

    const data = assignRes.data;
    if (data && data.length > 0) {
      const ids = data.map((d) => d.engineer_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      setEngineers((profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || p.user_id })));
    } else {
      setEngineers([]);
    }
    setLoadingEngineers(false);
  };

  const handleOpen = () => {
    setOpen(true);
    setStep("compose");
    setSelectedEngineer("");
    setMessage("");
    setJob(null);
    loadContext();
  };

  const handleSend = async () => {
    if (!selectedEngineer || !message.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { engineerId: selectedEngineer, message: message.trim(), jobId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sent", description: `WhatsApp message sent for ${jobRef}.` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send message.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const recipientName = engineers.find((e) => e.id === selectedEngineer)?.name || "—";

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        className="text-muted-foreground hover:text-accent transition-colors"
        title="Send WhatsApp"
      >
        <MessageSquare className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === "preview" ? <Eye className="h-4 w-4 text-accent" /> : <Send className="h-4 w-4 text-accent" />}
              {step === "preview" ? "Preview message" : `WhatsApp — ${jobRef}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {loadingEngineers ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : engineers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engineers assigned to this job.</p>
            ) : step === "compose" ? (
              <>
                <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((eng) => (
                      <SelectItem key={eng.id} value={eng.id}>{eng.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Message (auto-filled with job details)</span>
                  <button
                    type="button"
                    onClick={() => setMessage(buildDefaultMessage(job))}
                    className="text-xs text-primary hover:underline"
                  >
                    Reset to default
                  </button>
                </div>

                <Textarea
                  placeholder="Type your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={8}
                  maxLength={1600}
                />
                <div className="text-right text-xs text-muted-foreground">
                  {message.length}/1600
                </div>

                <Button
                  onClick={() => setStep("preview")}
                  disabled={!selectedEngineer || !message.trim()}
                  className="w-full"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview before sending
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>To: <span className="font-medium text-foreground">{recipientName}</span></span>
                    <span>{message.length} chars</span>
                  </div>
                  {/* WhatsApp-style bubble preview */}
                  <div className="rounded-lg bg-[#dcf8c6] dark:bg-emerald-900/40 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words shadow-sm">
                    {message}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    This is exactly what {recipientName} will receive on WhatsApp.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep("compose")}
                    disabled={sending}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to edit
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={sending}
                    className="flex-1"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
