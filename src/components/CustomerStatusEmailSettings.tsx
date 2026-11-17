import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const KEY = "customer_status_emails";
const OPTIONS = [
  { id: "job_completed", label: "Send completion email to customer when a job is marked complete" },
  { id: "job_booked", label: "Send 'job booked' email to customer when a job is created" },
  { id: "engineer_dispatched", label: "Send 'engineer dispatched' email when a job becomes active" },
  { id: "certificate_issued", label: "Send 'certificate issued' email" },
] as const;

/** Automatic customer emails on status changes. All OFF by default. */
export default function CustomerStatusEmailSettings() {
  const [value, setValue] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle().then(({ data }) => {
      setValue(((data?.value as any) || {}) as Record<string, boolean>);
      setLoaded(true);
    });
  }, []);

  const toggle = async (id: string, on: boolean) => {
    const next = { ...value, [id]: on };
    setValue(next);
    const { error } = await supabase.from("app_settings").upsert({ key: KEY, value: next as any }, { onConflict: "org_id,key" });
    if (error) { toast.error("Couldn't save setting"); setValue(value); return; }
    toast.success(on ? "Customer email switched on" : "Customer email switched off");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic customer emails</CardTitle>
        <CardDescription>
          Changing a job's status is internal only. Nothing goes to the customer unless you switch it on here.
          You can always send manually with "Send to Customer" on the job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {OPTIONS.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-4">
            <Label htmlFor={`cse-${o.id}`} className="text-sm font-normal">{o.label}</Label>
            <Switch id={`cse-${o.id}`} disabled={!loaded} checked={value[o.id] === true} onCheckedChange={(v) => toggle(o.id, v)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
