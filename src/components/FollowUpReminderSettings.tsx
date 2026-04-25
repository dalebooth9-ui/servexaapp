import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bell, Save, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface ReminderConfig {
  enabled: boolean;
  email_subject: string;
  email_body: string;
}

const DEFAULT_CONFIG: ReminderConfig = {
  enabled: true,
  email_subject: "Upcoming {{service_type}} – {{reference}}",
  email_body: `Dear {{customer_name}},

This is a courtesy reminder that a {{service_type_lower}} service is due at your premises.

Service Type: {{service_type}}
Reference: {{reference}}
Scheduled Date: {{scheduled_date}}
{{#address}}Location: {{address}}{{/address}}

Please could you confirm access arrangements for our engineer to attend on or around this date. If this date is not suitable, please let us know and we can arrange an alternative.

Any questions, just give us a call or drop us an email.

Kind regards,
Viva Fire & Protection`,
};

export default function FollowUpReminderSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ReminderConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    if (user?.email) setTestEmail(user.email);
  }, [user?.email]);

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setSendingTest(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-test-reminder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            to_email: testEmail.trim(),
            email_subject: config.email_subject,
            email_body: config.email_body,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to send");
      toast.success(`Test email sent to ${testEmail}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("app_settings" as any)
          .select("value")
          .eq("key", "followup_reminder")
          .single();
        if (data && !error) {
          const val = (data as any).value as ReminderConfig;
          setConfig({ ...DEFAULT_CONFIG, ...val });
        }
      } catch (e) {
        console.error("Failed to load reminder settings:", e);
      }
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings" as any)
      .upsert({ key: "followup_reminder", value: config as any, updated_at: new Date().toISOString() } as any);
    setSaving(false);
    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Reminder settings saved");
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" />
            <CardTitle className="text-lg">Follow-Up Reminder Emails</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="reminder-toggle" className="text-sm text-muted-foreground">
              {config.enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="reminder-toggle"
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, enabled: checked }))}
            />
          </div>
        </div>
        <CardDescription>
          Automatically email customers 1 month before a follow-up visual or pressure test service is due.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Email Subject</Label>
          <Input
            value={config.email_subject}
            onChange={(e) => setConfig((c) => ({ ...c, email_subject: e.target.value }))}
            disabled={!config.enabled}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Email Body</Label>
          <Textarea
            value={config.email_body}
            onChange={(e) => setConfig((c) => ({ ...c, email_body: e.target.value }))}
            disabled={!config.enabled}
            rows={14}
            className="font-mono text-xs"
          />
        </div>
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs font-medium mb-1">Available placeholders:</p>
          <div className="flex flex-wrap gap-1.5">
            {["{{customer_name}}", "{{service_type}}", "{{service_type_lower}}", "{{reference}}", "{{scheduled_date}}", "{{address}}", "{{#address}}...{{/address}}"].map((p) => (
              <code key={p} className="rounded bg-muted px-1.5 py-0.5 text-xs">{p}</code>
            ))}
          </div>
        </div>

        {/* Send Test Email */}
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <Label className="text-sm font-medium">Send Test Email</Label>
          <p className="text-xs text-muted-foreground">
            Preview the email with sample data. Placeholders will be filled with example values.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1"
              disabled={sendingTest}
            />
            <Button
              variant="outline"
              onClick={handleSendTest}
              disabled={sendingTest || !testEmail.trim()}
            >
              {sendingTest ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              {sendingTest ? "Sending..." : "Send Test"}
            </Button>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Reminder Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
