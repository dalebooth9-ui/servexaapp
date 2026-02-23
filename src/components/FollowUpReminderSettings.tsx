import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bell, Save } from "lucide-react";
import { toast } from "sonner";

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

If you have any questions, please don't hesitate to get in touch.

Kind regards,
Viva Fire & Protection`,
};

export default function FollowUpReminderSettings() {
  const [config, setConfig] = useState<ReminderConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Reminder Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
