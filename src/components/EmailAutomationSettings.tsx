import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type JobName =
  | "send-visit-reminders-daily"
  | "check-followup-reminders-daily"
  | "process-email-queue"
  | "send-weekly-management-report"
  | "check-compliance-expiry-daily"
  | "check-engineer-doc-expiry-daily";

interface JobMeta {
  jobname: JobName;
  title: string;
  description: string;
  customerFacing: boolean;
}

const JOBS: JobMeta[] = [
  {
    jobname: "send-visit-reminders-daily",
    title: "Visit reminders to customers",
    description: "Daily at 08:00 UTC — emails customers the day before a scheduled visit.",
    customerFacing: true,
  },
  {
    jobname: "check-followup-reminders-daily",
    title: "Follow-up reminders to customers",
    description: "Daily — emails customers ~1 month before a follow-up service is due.",
    customerFacing: true,
  },
  {
    jobname: "process-email-queue",
    title: "App email queue dispatcher",
    description: "Every 5 seconds — drains queued transactional emails (incl. customer-facing).",
    customerFacing: true,
  },
  {
    jobname: "send-weekly-management-report",
    title: "Weekly management report",
    description: "Mondays 08:00 UTC — internal admin summary, not sent to customers.",
    customerFacing: false,
  },
  {
    jobname: "check-compliance-expiry-daily",
    title: "Compliance expiry alerts (internal)",
    description: "Daily — notifies internal staff of upcoming compliance expiries.",
    customerFacing: false,
  },
  {
    jobname: "check-engineer-doc-expiry-daily",
    title: "Engineer document expiry alerts (internal)",
    description: "Daily — notifies admins of expiring engineer certifications.",
    customerFacing: false,
  },
];

interface JobRow {
  jobname: string;
  active: boolean;
  schedule: string;
}

export default function EmailAutomationSettings() {
  const [rows, setRows] = useState<Record<string, JobRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_email_automation_status" as any);
    if (error) {
      toast.error(`Failed to load automation status: ${error.message}`);
    } else if (data) {
      const map: Record<string, JobRow> = {};
      for (const r of data as JobRow[]) map[r.jobname] = r;
      setRows(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (jobname: JobName, next: boolean) => {
    setSaving(jobname);
    const { error } = await supabase.rpc("set_email_automation_active" as any, {
      _jobname: jobname,
      _active: next,
    });
    setSaving(null);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setRows((prev) => ({
      ...prev,
      [jobname]: { ...(prev[jobname] || { jobname, schedule: "" }), active: next } as JobRow,
    }));
    toast.success(`${next ? "Enabled" : "Disabled"} ${jobname}`);
  };

  const anyCustomerEnabled = JOBS.filter((j) => j.customerFacing).some(
    (j) => rows[j.jobname]?.active
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Email Automation</CardTitle>
        </div>
        <CardDescription>
          Master switches for every scheduled email job. Customer-facing automations are currently
          paused after a misfire — re-enable only when you're certain the schedule data is correct.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && !anyCustomerEnabled && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-muted-foreground">
              All customer-facing automated emails are currently <strong>OFF</strong>. No reminder
              or queued emails will be sent until you enable them here.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading automation status…
          </div>
        ) : (
          <div className="space-y-2">
            {JOBS.map((job) => {
              const row = rows[job.jobname];
              const active = !!row?.active;
              const missing = !row;
              return (
                <div
                  key={job.jobname}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                    job.customerFacing
                      ? active
                        ? "border-success/30 bg-success/5"
                        : "border-warning/30 bg-warning/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`toggle-${job.jobname}`} className="text-sm font-medium">
                        {job.title}
                      </Label>
                      {job.customerFacing && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Customer-facing
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{job.description}</p>
                    {missing && (
                      <p className="mt-1 text-xs text-destructive">
                        Cron job not found in database.
                      </p>
                    )}
                    {row?.schedule && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        schedule: {row.schedule}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {saving === job.jobname && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <Switch
                      id={`toggle-${job.jobname}`}
                      checked={active}
                      disabled={missing || saving === job.jobname}
                      onCheckedChange={(v) => toggle(job.jobname, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Changes apply immediately. Only admins can view or change these settings.
        </p>
      </CardContent>
    </Card>
  );
}
