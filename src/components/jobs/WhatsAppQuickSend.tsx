import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function WhatsAppQuickSend({ jobId, jobRef }: { jobId: string; jobRef: string }) {
  const [open, setOpen] = useState(false);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const { toast } = useToast();

  const loadEngineers = async () => {
    setLoadingEngineers(true);
    const { data } = await supabase
      .from("job_assignments")
      .select("engineer_id")
      .eq("job_id", jobId);
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
    setSelectedEngineer("");
    setMessage("");
    loadEngineers();
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

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); handleOpen(); }} className="text-muted-foreground hover:text-accent transition-colors" title="Send WhatsApp">
        <MessageSquare className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-accent" />
              WhatsApp — {jobRef}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loadingEngineers ? (
              <p className="text-sm text-muted-foreground">Loading engineers...</p>
            ) : engineers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engineers assigned to this job.</p>
            ) : (
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
                <Textarea
                  placeholder="Type your message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1600}
                />
                <Button onClick={handleSend} disabled={!selectedEngineer || !message.trim() || sending} className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  {sending ? "Sending..." : "Send WhatsApp Message"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
