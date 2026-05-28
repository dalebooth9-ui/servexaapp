import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Mail, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
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

interface SeedCount {
  seed_jobs: number;
  seed_visits: number;
}

export default function EmailAutomationSettings() {
  const [rows, setRows] = useState<Record<string, JobRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [seed, setSeed] = useState<SeedCount>({ seed_jobs: 0, seed_visits: 0 });
  const [confirm, setConfirm] = useState<{ job: JobMeta } | null>(null);

  const loadSeed = async () => {
    const { data, error } = await supabase.rpc("count_seed_test_jobs" as any);
    if (!error && data && Array.isArray(data) && data[0]) {
      const r = data[0] as any;
      setSeed({ seed_jobs: Number(r.seed_jobs) || 0, seed_visits: Number(r.seed_visits) || 0 });
    }
  };

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
    await loadSeed();
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const applyToggle = async (jobname: JobName, next: boolean) => {
    setSaving(jobname);
    const { error } = await supabase.rpc("set_email_automation_active" as any, {
      _jobname: jobname,
      _active: next,
    });
    setSaving(null);
    if (error) {
      toast.error(error.message || "Failed to update automation");
      await loadSeed();
      return;
    }
    setRows((prev) => ({
      ...prev,
      [jobname]: { ...(prev[jobname] || { jobname, schedule: "" }), active: next } as JobRow,
    }));
    toast.success(`${next ? "Enabled" : "Disabled"} ${jobname}`);
  };

  const requestToggle = (job: JobMeta, next: boolean) => {
    // Always confirm before turning ON customer-facing automations
    if (next && job.customerFacing) {
      setConfirm({ job });
      return;
    }
    applyToggle(job.jobname, next);
  };

  const seedBlocking =
    !!confirm &&
    confirm.job.jobname === "send-visit-reminders-daily" &&
    (seed.seed_jobs > 0 || seed.seed_visits > 0);

  const anyCustomerEnabled = JOBS.filter((j) => j.customerFacing).some(
    (j) => rows[j.jobname]?.active
  );

  const hasSeed = seed.seed_jobs > 0 || seed.seed_visits > 0;

  return (
    <>
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
          {!loading && hasSeed && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-xs">
                <p className="font-semibold text-destructive">
                  Seed/test data still present — visit reminders cannot be re-enabled.
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Found {seed.seed_jobs} seed job(s) and {seed.seed_visits} upcoming seed visit(s)
                  matching the <code>aaaaaaaa-…</code> test UUID pattern. Delete these before turning
                  visit reminders back on.
                </p>
              </div>
            </div>
          )}

          {!loading && !anyCustomerEnabled && !hasSeed && (
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
                const blockedBySeed =
                  job.jobname === "send-visit-reminders-daily" && hasSeed && !active;
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
                      {blockedBySeed && (
                        <p className="mt-1 text-xs text-destructive">
                          Blocked: delete seed/test jobs first.
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
                        disabled={missing || saving === job.jobname || blockedBySeed}
                        onCheckedChange={(v) => requestToggle(job, v)}
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

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Enable customer-facing emails?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You're about to turn on <strong>{confirm?.job.title}</strong>. This will send
                  emails to real customer addresses on the next scheduled run.
                </p>
                {seedBlocking ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
                    <p className="font-semibold">Blocked — seed/test data still present</p>
                    <p className="mt-1 text-xs">
                      {seed.seed_jobs} seed job(s) and {seed.seed_visits} upcoming seed visit(s)
                      still exist. Re-enabling now would email real customers about test bookings.
                      Delete the seed data first.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Confirmed: no seed/test jobs detected. Proceed only if all scheduled visits and
                    customer addresses are correct.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={seedBlocking}
              onClick={() => {
                if (confirm) applyToggle(confirm.job.jobname, true);
                setConfirm(null);
              }}
            >
              Yes, enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
