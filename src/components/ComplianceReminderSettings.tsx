import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  notify_30: boolean;
  notify_60: boolean;
  notify_90: boolean;
};

const DEFAULT_SETTINGS: Settings = { notify_30: true, notify_60: false, notify_90: false };

export default function ComplianceReminderSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "compliance_reminder_settings")
        .maybeSingle();
      if (data?.value) setSettings({ ...DEFAULT_SETTINGS, ...(data.value as any) });
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({
      key: "compliance_reminder_settings",
      value: settings as any,
    });
    setSaving(false);
    if (error) toast.error("Failed to save settings");
    else toast.success("Compliance reminder settings saved");
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/check-compliance-expiry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Unknown error");
      toast.success(`Check complete — ${json.notified} notification(s) sent, ${json.updated} record(s) updated`);
    } catch (err: any) {
      toast.error(`Run failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  if (loading) return null;

  const thresholds = [
    { key: "notify_30" as keyof Settings, label: "30 days before expiry", description: "Alert when a certificate expires within 30 days" },
    { key: "notify_60" as keyof Settings, label: "60 days before expiry", description: "Alert when a certificate expires within 60 days" },
    { key: "notify_90" as keyof Settings, label: "90 days before expiry", description: "Alert when a certificate expires within 90 days" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Compliance Expiry Reminders</CardTitle>
        </div>
        <CardDescription>
          Receive in-app notifications when compliance certificates are approaching their expiry date. Reminders run automatically every day at 08:00 UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {thresholds.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border p-3 gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={key} className="text-sm font-medium cursor-pointer">{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                id={key}
                checked={settings[key]}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, [key]: v }))}
              />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-dashed p-3 space-y-1.5">
          <p className="text-xs font-medium">How it works</p>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
            <li>A daily background job checks all compliance records each morning</li>
            <li>Notifications appear in the bell icon for all admin users</li>
            <li>Each record triggers at most one reminder per week per threshold</li>
            <li>Expired records always generate an alert regardless of these settings</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save Settings"}
          </Button>
          <Button onClick={runNow} disabled={running} variant="outline" size="sm">
            {running
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Running…</>
              : <><Play className="mr-1.5 h-3.5 w-3.5" /> Run Check Now</>
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
