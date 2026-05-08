import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const AVAILABLE_MAILBOXES = [
  "dale@vivafire.co.uk",
  "service@vivafire.co.uk",
  "chloe@vivafire.co.uk",
  "info@vivafire.co.uk",
  "sales@vivafire.co.uk",
];

const EMAIL_TYPES: { key: string; label: string; description: string }[] = [
  { key: "default",        label: "Default (fallback)",     description: "Used when a specific type below isn't configured." },
  { key: "customer",       label: "Customer emails",        description: "notify-customer, send-customer-email." },
  { key: "invoice",        label: "Invoices",               description: "Invoice PDFs sent to customers." },
  { key: "reminder",       label: "Reminders & follow-ups", description: "Visit reminders, follow-ups, compliance expiry, test reminders." },
  { key: "onboarding",     label: "Engineer onboarding",    description: "Install link & engineer account creation emails." },
  { key: "password_reset", label: "Password resets",        description: "Engineer / staff password reset links." },
  { key: "weekly_report",  label: "Weekly management report", description: "Monday morning executive summary." },
  { key: "auto_schedule",  label: "Auto-scheduler agent",   description: "Notifications produced by the auto-schedule agent." },
  { key: "test",           label: "Test sends",             description: "Default 'From' for the Email delivery test card." },
];

interface Row {
  email_type: string;
  from_name: string;
  from_address: string;
}

export default function EmailFromSettings() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("email_from_settings")
        .select("email_type, from_name, from_address");
      if (error) {
        toast.error(`Failed to load settings: ${error.message}`);
      } else {
        const map: Record<string, Row> = {};
        (data ?? []).forEach((r: any) => { map[r.email_type] = r; });
        // Ensure each known type has a draft row
        EMAIL_TYPES.forEach(t => {
          if (!map[t.key]) {
            map[t.key] = { email_type: t.key, from_name: "Servexa", from_address: AVAILABLE_MAILBOXES[1] };
          }
        });
        setRows(map);
      }
      setLoading(false);
    })();
  }, []);

  const update = (key: string, patch: Partial<Row>) => {
    setRows(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const save = async (key: string) => {
    const row = rows[key];
    if (!row?.from_address) {
      toast.error("Pick a mailbox before saving.");
      return;
    }
    setSavingKey(key);
    const { error } = await supabase
      .from("email_from_settings")
      .upsert({
        email_type: key,
        from_name: row.from_name?.trim() || "Servexa",
        from_address: row.from_address.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "email_type" });
    setSavingKey(null);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success(`Saved ${EMAIL_TYPES.find(t => t.key === key)?.label ?? key}`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Sender Addresses (FROM)</CardTitle>
        </div>
        <CardDescription>
          Choose which mailbox each type of outgoing email is sent from. Only addresses on your verified
          sending domain (<code className="font-mono">vivafire.co.uk</code>) are listed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          EMAIL_TYPES.map(t => {
            const row = rows[t.key];
            return (
              <div key={t.key} className="rounded-lg border p-3 space-y-2">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Display name</Label>
                    <Input
                      value={row?.from_name ?? ""}
                      onChange={e => update(t.key, { from_name: e.target.value })}
                      placeholder="Servexa"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mailbox</Label>
                    <Select
                      value={row?.from_address}
                      onValueChange={v => update(t.key, { from_address: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick a mailbox" /></SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_MAILBOXES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      onClick={() => save(t.key)}
                      disabled={savingKey === t.key}
                    >
                      {savingKey === t.key
                        ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
                        : <><Save className="mr-1.5 h-4 w-4" /> Save</>}
                    </Button>
                  </div>
                </div>
                {row?.from_address && (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Preview: {row.from_name?.trim() ? `${row.from_name.trim()} <${row.from_address}>` : row.from_address}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
