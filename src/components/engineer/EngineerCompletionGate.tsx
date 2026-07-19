/**
 * EngineerCompletionGate — SOFT completion interstitial for engineers.
 *
 * Trigger (all must be true):
 *   - Current viewer is an ENGINEER assigned to this job (admins never see it).
 *   - The current job is one the engineer is actively working (status
 *     'active' or 'in_progress') — merely being assigned to a scheduled
 *     future job doesn't trigger it. We check this by looking at whether
 *     the CURRENT job is active AND whether OTHER jobs assigned to this
 *     engineer are still in ('active','in_progress').
 *   - Those other jobs are not legitimately parked:
 *       * status = 'on_hold' → excluded
 *       * status = 'awaiting_parts' → excluded (already flagged as parked)
 *       * job.multi_day_flagged_at IS NOT NULL → excluded (engineer
 *         previously marked as multi-day; won't retrigger)
 *       * job.outcome === 'no_access' → excluded
 *   - We haven't already shown & dismissed the gate for this current job in
 *     this browser (localStorage key `completion-gate:{currentJobId}`).
 *
 * Behaviour: never dead-ends. Every option except "Other" is one-tap;
 * "Other" requires free text. On confirm we insert one row per outstanding
 * job into `job_completion_flags`, log to `job_activity_log`, and (for
 * multi_day) stamp `jobs.multi_day_flagged_at` so the gate stops firing on
 * those dates.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type OpenJob = {
  id: string;
  reference_number: string | null;
  title: string | null;
};

type Props = {
  currentJobId: string;
  currentJobStatus: string;
  currentJobOrgId: string | null | undefined;
  isAssignedEngineer: boolean;
  isAdmin: boolean;
};

const REASONS: Array<{ key: "no_access" | "multi_day" | "parts_required" | "office_told_me" | "other"; label: string }> = [
  { key: "no_access", label: "No access" },
  { key: "multi_day", label: "Multi-day job" },
  { key: "parts_required", label: "Parts required" },
  { key: "office_told_me", label: "Office told me to" },
  { key: "other", label: "Other" },
];

const dismissKey = (jobId: string) => `completion-gate:${jobId}`;

export default function EngineerCompletionGate({
  currentJobId,
  currentJobStatus,
  currentJobOrgId,
  isAssignedEngineer,
  isAdmin,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [outstanding, setOutstanding] = useState<OpenJob[]>([]);
  const [reason, setReason] = useState<typeof REASONS[number]["key"] | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const eligible = useMemo(
    () =>
      !!user &&
      isAssignedEngineer &&
      !isAdmin &&
      (currentJobStatus === "active" || currentJobStatus === "in_progress"),
    [user, isAssignedEngineer, isAdmin, currentJobStatus],
  );

  useEffect(() => {
    if (!eligible || !user) return;
    if (localStorage.getItem(dismissKey(currentJobId))) return;

    let cancelled = false;
    (async () => {
      // Assigned jobs the engineer is currently working, excluding this one.
      const { data: assigns } = await supabase
        .from("job_assignments")
        .select("job_id")
        .eq("engineer_id", user.id);
      const otherIds = (assigns || [])
        .map((r) => r.job_id as string)
        .filter((jid) => jid !== currentJobId);
      if (otherIds.length === 0) return;

      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, reference_number, title, status, outcome, multi_day_flagged_at")
        .in("id", otherIds)
        .in("status", ["active", "in_progress"]);
      const stillOpen = ((jobs as any[]) || []).filter(
        (j) => !j.multi_day_flagged_at && j.outcome !== "no_access",
      );
      if (cancelled || stillOpen.length === 0) return;

      setOutstanding(
        stillOpen.map((j) => ({ id: j.id, reference_number: j.reference_number, title: j.title })),
      );
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, user, currentJobId]);

  const canSubmit =
    !!reason && (reason !== "other" || note.trim().length > 0) && outstanding.length > 0;

  const handleSubmit = async () => {
    if (!user || !reason || !canSubmit) return;
    setSaving(true);
    try {
      const rows = outstanding.map((j) => ({
        job_id: j.id,
        engineer_id: user.id,
        org_id: currentJobOrgId ?? null,
        reason,
        note: note.trim() || null,
        moved_to_job_id: currentJobId,
      }));
      // org_id is NOT NULL on the table; only insert when we know it. If the
      // current job's org_id wasn't loaded yet, fetch it per row (rare).
      const withOrg = await Promise.all(
        rows.map(async (r) => {
          if (r.org_id) return r;
          const { data } = await supabase.from("jobs").select("org_id").eq("id", r.job_id).maybeSingle();
          return { ...r, org_id: (data as any)?.org_id ?? null };
        }),
      );
      const insertable = withOrg.filter((r) => r.org_id) as Array<typeof rows[number]>;
      if (insertable.length) {
        const { error } = await supabase.from("job_completion_flags").insert(insertable);
        if (error) throw error;
      }

      // Activity log entries so the office sees this on job history.
      const label = REASONS.find((r) => r.key === reason)?.label ?? reason;
      await supabase.from("job_activity_log").insert(
        insertable.map((r) => ({
          job_id: r.job_id,
          user_id: user.id,
          org_id: r.org_id!,
          action: "completion_flag",
          details: `Engineer moved on to ${currentJobId}. Reason: ${label}${r.note ? ` — ${r.note}` : ""}`,
        })),
      );

      // Multi-day: suppress future retriggers on those jobs.
      if (reason === "multi_day") {
        await supabase
          .from("jobs")
          .update({ multi_day_flagged_at: new Date().toISOString() })
          .in(
            "id",
            insertable.map((r) => r.job_id),
          );
      }

      localStorage.setItem(dismissKey(currentJobId), "1");
      setOpen(false);
      toast({ title: "Thanks — noted", description: "The office has been informed." });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!eligible || !open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Never dead-end: allow closing, but only after they've picked a reason.
        if (!o && canSubmit) {
          void handleSubmit();
        } else if (!o) {
          // Force them to answer — reopen.
          setTimeout(() => setOpen(true), 50);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-lg">
              {outstanding.length === 1
                ? `Job ${outstanding[0].reference_number ?? ""} isn't complete`
                : `${outstanding.length} jobs aren't complete`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            Why are you moving on? One tap and you're through.
          </DialogDescription>
        </DialogHeader>

        <ul className="rounded-lg border bg-muted/40 p-2 text-xs max-h-24 overflow-auto">
          {outstanding.map((j) => (
            <li key={j.id} className="py-0.5">
              <span className="font-medium">{j.reference_number ?? "—"}</span>{" "}
              <span className="text-muted-foreground">{j.title ?? ""}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 gap-2">
          {REASONS.map((r) => {
            const active = reason === r.key;
            return (
              <Button
                key={r.key}
                variant={active ? "default" : "outline"}
                size="lg"
                className="min-h-12 justify-start text-base"
                onClick={() => setReason(r.key)}
              >
                {r.label}
              </Button>
            );
          })}
        </div>

        {reason === "other" && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Please tell us why (required)"
            className="min-h-20"
          />
        )}
        {reason && reason !== "other" && (
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Extra note (optional)"
            className="min-h-16"
          />
        )}

        <Button
          size="lg"
          className="w-full min-h-12 text-base font-semibold"
          disabled={!canSubmit || saving}
          onClick={handleSubmit}
        >
          {saving ? "Saving…" : "Continue"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
