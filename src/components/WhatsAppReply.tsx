import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppReplyProps {
  jobId: string;
  engineers: { id: string; name: string; whatsappNumber?: string | null }[];
}

export default function WhatsAppReply({ jobId, engineers }: WhatsAppReplyProps) {
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!selectedEngineer || !message.trim()) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { engineerId: selectedEngineer, message: message.trim(), jobId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("WhatsApp message sent!");
      setMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (engineers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4 text-accent" />
          Reply via WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
          <SelectTrigger>
            <SelectValue placeholder="Select engineer" />
          </SelectTrigger>
          <SelectContent>
            {engineers.map((eng) => (
              <SelectItem key={eng.id} value={eng.id}>
                {eng.name}
              </SelectItem>
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
        <Button
          onClick={handleSend}
          disabled={!selectedEngineer || !message.trim() || sending}
          className="w-full"
        >
          <Send className="mr-2 h-4 w-4" />
          {sending ? "Sending..." : "Send WhatsApp Message"}
        </Button>
      </CardContent>
    </Card>
  );
}
