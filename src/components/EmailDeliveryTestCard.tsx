import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; to: string; at: string }
  | { kind: "error"; message: string };

export default function EmailDeliveryTestCard() {
  const { user } = useAuth();
  const [to, setTo] = useState("");
  const [state, setState] = useState<SendState>({ kind: "idle" });

  useEffect(() => {
    if (user?.email && !to) setTo(user.email);
  }, [user?.email]);

  const sendTest = async () => {
    const trimmed = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    setState({ kind: "sending" });
    try {
      const { data, error } = await supabase.functions.invoke("test-resend-email", {
        body: {
          to: trimmed,
          subject: "Servexa — email delivery test",
        },
      });
      if (error) throw new Error(error.message || "Failed to send");
      if (data && data.success === false) {
        const detail =
          (data.detail && (data.detail.message || data.detail.error || JSON.stringify(data.detail))) ||
          data.error ||
          "Email gateway rejected the request";
        throw new Error(detail);
      }
      setState({ kind: "success", to: trimmed, at: new Date().toLocaleTimeString() });
      toast.success(`Test email sent to ${trimmed}`);
    } catch (err: any) {
      const message = err?.message || "Failed to send test email";
      setState({ kind: "error", message });
      toast.error(message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Email delivery test</CardTitle>
        </div>
        <CardDescription>
          Once your sender domain (notify.vivafire.co.uk) shows as <strong>Active</strong> in
          Cloud → Emails, send a quick test email to confirm delivery is working end-to-end.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email-test-to">Send test to</Label>
          <div className="flex gap-2">
            <Input
              id="email-test-to"
              type="email"
              placeholder="you@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={state.kind === "sending"}
              className="flex-1"
            />
            <Button onClick={sendTest} disabled={state.kind === "sending" || !to.trim()}>
              {state.kind === "sending" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              {state.kind === "sending" ? "Sending..." : "Send test email"}
            </Button>
          </div>
        </div>

        {state.kind === "success" && (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">Test email sent</p>
              <p className="text-xs text-muted-foreground">
                Sent to {state.to} at {state.at}. Check the inbox (and spam folder) to confirm delivery.
              </p>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="font-medium">Test email failed</p>
              <p className="text-xs text-muted-foreground break-words">{state.message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                If your domain is still verifying, this is expected — wait until status shows Active in Cloud → Emails.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
