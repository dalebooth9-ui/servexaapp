import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Sender addresses are per-tenant. We DO NOT ship a hard-coded list of
// mailboxes here — that previously leaked Viva Fire's addresses to every
// other organisation. Suggestions are derived from the org's own configured
// email_branding.from_address (its verified sending domain).

const EMAIL_TYPES: { key: string; label: string; description: string }[] = [
  { key: "default",        label: "Default (fallback)",     description: "Used when a specific type below isn't configured." },
  { key: "customer",       label: "Customer emails",        description: "Ad-hoc emails sent to customers from job pages." },
  { key: "customer_notification", label: "Customer notifications", description: "Job completed, report ready, sign-off requests etc." },
  { key: "invoice",        label: "Invoices",               description: "Invoice PDFs sent to customers." },
  { key: "reminder",       label: "Reminders & follow-ups", description: "Visit reminders, compliance expiry, test reminders." },
  { key: "compliance_reminder", label: "Compliance reminders", description: "Certificate / compliance expiry notifications to customers." },
  { key: "visit_notification", label: "Visit notifications", description: "Letting customers know an engineer is on the way / has arrived." },
  { key: "quote_followup", label: "Quote follow-ups",       description: "Chasing customers after a quote has been sent." },
  { key: "onboarding",     label: "Engineer onboarding",    description: "Install link & engineer account creation emails." },
  { key: "engineer_notification", label: "Engineer notifications", description: "Job assignments, schedule changes, and other alerts to engineers." },
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
  const [orgName, setOrgName] = useState<string>("Servexa");
  const [senderDomain, setSenderDomain] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Discover the org's own verified sending domain from its email_branding
      // row. Anything else is a leak.
      let domain: string | null = null;
      let brandingFromName: string | null = null;
      let brandingFromAddress: string | null = null;
      try {
        const { data: brand } = await supabase
          .from("email_branding").select("from_name, from_address").limit(1).maybeSingle();
        if ((brand as any)?.from_address) {
          brandingFromAddress = (brand as any).from_address;
          const at = brandingFromAddress!.indexOf("@");
          if (at > 0) domain = brandingFromAddress!.slice(at + 1);
        }
        if ((brand as any)?.from_name) brandingFromName = (brand as any).from_name;
      } catch (_) { /* empty */ }
      setSenderDomain(domain);

      try {
        const { data: sess } = await supabase.auth.getUser();
        const uid = sess.user?.id;
        if (uid) {
          const { data: prof } = await supabase
            .from("profiles").select("org_id").eq("user_id", uid).maybeSingle();
          const orgId = (prof as any)?.org_id;
          if (orgId) {
            const { data: org } = await supabase
              .from("organisations").select("name").eq("id", orgId).maybeSingle();
            if ((org as any)?.name) setOrgName((org as any).name);
          }
        }
      } catch (_) { /* empty */ }

      const defaultName = brandingFromName || orgName;
      const defaultAddress = brandingFromAddress || "";

      const { data, error } = await supabase
        .from("email_from_settings")
        .select("email_type, from_name, from_address");
      if (error) {
        toast.error(`Failed to load settings: ${error.message}`);
      } else {
        const map: Record<string, Row> = {};
        (data ?? []).forEach((r: any) => { map[r.email_type] = r; });
        EMAIL_TYPES.forEach(t => {
          if (!map[t.key]) {
            map[t.key] = {
              email_type: t.key,
              from_name: defaultName,
              from_address: defaultAddress,
            };
          }
        });
        setRows(map);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mailboxSuggestions = useMemo(() => {
    if (!senderDomain) return [] as string[];
    return ["service", "info", "sales", "hello", "no-reply"].map(
      (local) => `${local}@${senderDomain}`,
    );
  }, [senderDomain]);

  const update = (key: string, patch: Partial<Row>) => {
    setRows(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const save = async (key: string) => {
    const row = rows[key];
    if (!row?.from_address) {
      toast.error("Enter a sender address before saving.");
      return;
    }
    setSavingKey(key);
    const { error } = await supabase
      .from("email_from_settings")
      .upsert({
        email_type: key,
        from_name: row.from_name?.trim() || orgName,
        from_address: row.from_address.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,email_type" });
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
          Choose which address each type of outgoing email is sent from. Use addresses on your
          verified sending domain
          {senderDomain
            ? <> (<code className="font-mono">{senderDomain}</code>).</>
            : <>. Configure your sending domain in Email Branding first.</>}
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
            const listId = `mailbox-suggest-${t.key}`;
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
                      placeholder={orgName}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mailbox</Label>
                    <Input
                      type="email"
                      value={row?.from_address ?? ""}
                      onChange={e => update(t.key, { from_address: e.target.value })}
                      placeholder={senderDomain ? `service@${senderDomain}` : "service@yourdomain.com"}
                      list={mailboxSuggestions.length ? listId : undefined}
                    />
                    {mailboxSuggestions.length > 0 && (
                      <datalist id={listId}>
                        {mailboxSuggestions.map(m => <option key={m} value={m} />)}
                      </datalist>
                    )}
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
