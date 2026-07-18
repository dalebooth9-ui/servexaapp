import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const DEFAULT_TEMPLATE = `Hi {{customer_name}},

This is a reminder that the following service(s) at {{site_name}} are due on {{due_date}}:

{{services_list}}

Reply to this email to book in or let us know if you'd prefer a different date.

Kind regards,
{{from_name}}`;

type Interval = { id: string; template_id: string | null; work_type: string | null; interval_months: number; reminder_lead_weeks: number; active: boolean };

export default function RenewalsSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [fromName, setFromName] = useState("");
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [{ data: org }, { data: ints }] = await Promise.all([
      supabase.from("organisations")
        .select("id, renewal_reminders_enabled, renewal_reminder_template, renewal_reminder_from_name")
        .maybeSingle(),
      supabase.from("service_intervals")
        .select("id, template_id, work_type, interval_months, reminder_lead_weeks, active")
        .order("work_type", { ascending: true, nullsFirst: false }),
    ]);
    if (org) {
      setEnabled(!!(org as any).renewal_reminders_enabled);
      setTemplate((org as any).renewal_reminder_template || DEFAULT_TEMPLATE);
      setFromName((org as any).renewal_reminder_from_name || "");
    }
    setIntervals((ints as any) || []);
  }

  async function save() {
    setSaving(true);
    const { data: org } = await supabase.from("organisations").select("id").maybeSingle();
    if (!org) { setSaving(false); return; }
    const { error } = await supabase.from("organisations").update({
      renewal_reminders_enabled: enabled,
      renewal_reminder_template: template,
      renewal_reminder_from_name: fromName || null,
    }).eq("id", (org as any).id);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Renewal settings saved" });
  }

  async function updateInterval(id: string, patch: Partial<Interval>) {
    const { error } = await supabase.from("service_intervals").update(patch).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Renewals & customer reminders</CardTitle>
        <CardDescription>
          Set how often each service repeats. Reminders are OFF until you switch them on — no email
          leaves the system without your say-so. The wording below is fully editable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Send automatic customer reminders</Label>
              <p className="text-xs text-muted-foreground">
                4 weeks before due (configurable per work type) and again on the due date if not booked.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Reply-to / from name</Label>
              <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Viva Fire Protection" />
            </div>
          </div>
          <div>
            <Label>Reminder email template</Label>
            <Textarea rows={9} value={template} onChange={e => setTemplate(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Available placeholders: <code>{"{{customer_name}}"}</code>, <code>{"{{site_name}}"}</code>,
              <code>{"{{due_date}}"}</code>, <code>{"{{services_list}}"}</code>, <code>{"{{from_name}}"}</code>.
            </p>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save reminder settings"}</Button>
        </div>

        <div>
          <h4 className="font-medium mb-2">Service intervals</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="p-2 text-left">Work type / template</th>
                  <th className="p-2 text-left">Interval (months)</th>
                  <th className="p-2 text-left">Reminder lead (weeks)</th>
                  <th className="p-2 text-left">Active</th>
                </tr>
              </thead>
              <tbody>
                {intervals.map(i => (
                  <tr key={i.id} className="border-t">
                    <td className="p-2">{i.work_type || i.template_id?.slice(0, 8) || "—"}</td>
                    <td className="p-2">
                      <Input type="number" min={1} max={120} defaultValue={i.interval_months}
                        className="w-24"
                        onBlur={e => {
                          const v = parseInt(e.target.value, 10);
                          if (v && v !== i.interval_months) updateInterval(i.id, { interval_months: v });
                        }} />
                    </td>
                    <td className="p-2">
                      <Input type="number" min={0} max={26} defaultValue={i.reminder_lead_weeks}
                        className="w-24"
                        onBlur={e => {
                          const v = parseInt(e.target.value, 10);
                          if (v !== i.reminder_lead_weeks) updateInterval(i.id, { reminder_lead_weeks: v });
                        }} />
                    </td>
                    <td className="p-2">
                      <Switch checked={i.active} onCheckedChange={c => updateInterval(i.id, { active: c })} />
                    </td>
                  </tr>
                ))}
                {intervals.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No intervals configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
