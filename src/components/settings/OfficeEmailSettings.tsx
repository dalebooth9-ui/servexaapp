import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCurrentOrgId } from "@/lib/orgStoragePath";

export default function OfficeEmailSettings() {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [alertsOn, setAlertsOn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getCurrentOrgId();
      setOrgId(id);
      if (!id) return;
      const { data } = await supabase
        .from("organisations")
        .select("office_email, office_whatsapp_number, whatsapp_alerts_enabled")
        .eq("id", id)
        .maybeSingle();
      setEmail((data as any)?.office_email || "");
      setWhatsapp((data as any)?.office_whatsapp_number || "");
      setAlertsOn((data as any)?.whatsapp_alerts_enabled === true);
    })();
  }, []);

  const save = async () => {
    const v = email.trim();
    const w = whatsapp.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast({ title: "Enter a valid email", variant: "destructive" }); return; }
    if (w && !/^\+[1-9]\d{7,14}$/.test(w)) { toast({ title: "Enter the number in full international form", description: "For example +447700900123", variant: "destructive" }); return; }
    if (alertsOn && !w) { toast({ title: "Add an office WhatsApp number first", variant: "destructive" }); return; }
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organisations")
      .update({ office_email: v || null, office_whatsapp_number: w || null, whatsapp_alerts_enabled: alertsOn } as any)
      .eq("id", orgId);
    setSaving(false);
    toast(error ? { title: "Could not save", description: error.message, variant: "destructive" } : { title: "Office contact details saved" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Office contact</CardTitle>
        <CardDescription>Engineer report submissions and "Message office" notes are sent here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="office-email">Office email</Label>
          <Input id="office-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@yourcompany.co.uk" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="office-whatsapp">Office WhatsApp number</Label>
          <Input id="office-whatsapp" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+447700900123" />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="pr-3">
            <p className="text-sm font-medium">WhatsApp alerts</p>
            <p className="text-xs text-muted-foreground">Also send report submissions and engineer messages to the office on WhatsApp.</p>
          </div>
          <Switch checked={alertsOn} onCheckedChange={setAlertsOn} aria-label="WhatsApp alerts" />
        </div>
        <Button onClick={save} disabled={saving}>Save</Button>
      </CardContent>
    </Card>
  );
}
