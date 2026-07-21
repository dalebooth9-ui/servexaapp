// MicrosoftSendSettings — admin panel to configure the Microsoft 365 mailbox
// used for outbound report emails. Lives on Settings → Email so it sits with
// the other sender-identity controls.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Mail } from "lucide-react";
import { sendViaGraph } from "@/lib/graphMailSend";

type Mode = "send" | "draft" | "off";

export default function MicrosoftSendSettings() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState("");
  const [mode, setMode] = useState<Mode>("send");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { setLoading(false); return; }
      setTestEmail(userData.user?.email || "");
      const { data: mem } = await supabase
        .from("organisation_members" as any)
        .select("org_id")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      const oid = (mem as any)?.org_id || null;
      setOrgId(oid);
      if (oid) {
        const { data: org } = await supabase
          .from("organisations" as any)
          .select("ms_send_mailbox, ms_send_mode")
          .eq("id", oid)
          .maybeSingle();
        setMailbox(((org as any)?.ms_send_mailbox as string) || "");
        setMode((((org as any)?.ms_send_mode as Mode) || "send"));
      }
      setLoading(false);
    })();
  }, []);

  if (userRole !== "admin") return null;

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organisations" as any)
      .update({ ms_send_mailbox: mailbox.trim() || null, ms_send_mode: mode })
      .eq("id", orgId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: "Microsoft 365 send settings updated." });
  };

  const sendTest = async () => {
    if (!testEmail.trim()) {
      toast({ title: "Enter a test recipient", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const result = await sendViaGraph({
        toEmail: testEmail.trim(),
        subject: "Servexa test — Microsoft 365 send",
        htmlBody:
          "<p>This is a test from Servexa confirming that the Microsoft 365 send route is working.</p>" +
          `<p>Sent from mailbox: <strong>${mailbox}</strong></p>`,
        orgId,
        overrideMode: mode === "draft" ? "draft" : "send",
      });
      if (result.mode === "draft" && result.webLink) {
        window.open(result.webLink, "_blank", "noopener");
        toast({ title: "Draft created", description: "Opened in Outlook — press Send there." });
      } else {
        toast({ title: "Test sent", description: `Check the ${mailbox} Sent Items and ${testEmail}'s inbox.` });
      }
    } catch (err: any) {
      toast({
        title: "Test failed",
        description: err.message || "Couldn't send test.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const configured = !!mailbox && mode !== "off";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Send via Microsoft 365
            </CardTitle>
            <CardDescription>
              Route customer report emails through your real Outlook mailbox so
              they land in Sent Items and replies come back to that address.
            </CardDescription>
          </div>
          {configured ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Configured
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Not configured
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ms-mailbox">Send from mailbox</Label>
              <Input
                id="ms-mailbox"
                type="email"
                value={mailbox}
                onChange={(e) => setMailbox(e.target.value)}
                placeholder="service@yourcompany.co.uk"
              />
              <p className="text-xs text-muted-foreground">
                The Microsoft 365 account that will send report emails. Must
                exist in your tenant and be reachable by the linked Microsoft
                Outlook connection.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Delivery mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
                  <RadioGroupItem value="send" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Send directly (recommended)</div>
                    <p className="text-xs text-muted-foreground">
                      Emails are sent immediately from the mailbox above and
                      saved to its Sent Items.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
                  <RadioGroupItem value="draft" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Create draft in Outlook</div>
                    <p className="text-xs text-muted-foreground">
                      Pre-fills a draft with recipient, subject, body and PDF —
                      opens in Outlook on the web for review, then you press Send.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
                  <RadioGroupItem value="off" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Off (use app mailer only)</div>
                    <p className="text-xs text-muted-foreground">
                      Sends go through Servexa's mailer as before. Won't appear
                      in your Sent Items.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Not connected yet?</p>
              <p>
                A workspace admin needs to link the <strong>Microsoft Outlook</strong>{" "}
                connection in Lovable and grant <code>Mail.Send</code>,{" "}
                <code>Mail.ReadWrite</code> and <code>offline_access</code>. Your
                Microsoft tenant may require an IT admin to approve the app the
                first time — if you see a "needs admin approval" screen, forward
                it to your IT admin.
              </p>
              <a
                href="https://lovable.dev/settings/connectors"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open Lovable connector settings <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pt-2 border-t">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="ms-test">Send a test to</Label>
                <Input
                  id="ms-test"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button
                variant="outline"
                onClick={sendTest}
                disabled={testing || !mailbox}
                className="gap-1.5"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send test
              </Button>
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
