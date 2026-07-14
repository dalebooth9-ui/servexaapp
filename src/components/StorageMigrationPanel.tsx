import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, PlayCircle, ShieldCheck, AlertTriangle, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Settings → Advanced → Storage migration (one-off).
 *
 * Admin-only panel that drives the `stage-b-backfill` edge function. Displays
 * one card per bucket in the enforced order, gates each card behind the previous
 * bucket's completion, and surfaces dry-run / run / integrity-check results.
 *
 * The panel invokes the function via `supabase.functions.invoke`, which forwards
 * the caller's JWT — the function then validates admin role server-side. The
 * CRON_SECRET is never exposed to the browser.
 */

const BUCKET_ORDER = [
  "signatures",
  "engineer-documents",
  "customer-paperwork",
  "asset-documents",
  "site-survey-media",
  "submissions",
  "blank-template-pdfs",
] as const;
type Bucket = (typeof BUCKET_ORDER)[number];

type Counts = Record<Bucket, { pending: number; in_progress: number; done: number; failed: number; skipped: number; total: number }>;
type BucketState = {
  dryRunning: boolean;
  running: boolean;
  lastRunResult?: { moved: number; rewritten: number; failed: number; failures?: any[] };
  lastDryResult?: { ready: number; blocked: number; failures?: any[] };
  integrity?: { pass: boolean; failures: any[]; sampled: number };
};

export default function StorageMigrationPanel() {
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [unlocked, setUnlocked] = useState<Record<Bucket, boolean> | null>(null);
  const [state, setState] = useState<Record<Bucket, BucketState>>(() =>
    Object.fromEntries(BUCKET_ORDER.map((b) => [b, {} as BucketState])) as Record<Bucket, BucketState>,
  );

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("stage-b-backfill", { body });
    if (error) throw new Error(error.message);
    return data as any;
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke({ action: "status" });
      setCounts(res.counts);
      setUnlocked(res.unlocked);
    } catch (e) {
      toast.error(`Status failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const doPrepare = async () => {
    setPreparing(true);
    try {
      const res = await invoke({ action: "prepare" });
      toast.success("Manifest refreshed");
      console.log("prepare result:", res);
      await refreshStatus();
    } catch (e) {
      toast.error(`Prepare failed: ${(e as Error).message}`);
    } finally {
      setPreparing(false);
    }
  };

  const doDryRun = async (b: Bucket) => {
    setState((s) => ({ ...s, [b]: { ...s[b], dryRunning: true } }));
    try {
      const res = await invoke({ action: "dry_run", bucket: b });
      setState((s) => ({
        ...s,
        [b]: { ...s[b], dryRunning: false, lastDryResult: { ready: res.ready, blocked: res.blocked, failures: res.failures } },
      }));
      toast.success(`Dry run: ${res.ready} ready, ${res.blocked} blocked`);
    } catch (e) {
      setState((s) => ({ ...s, [b]: { ...s[b], dryRunning: false } }));
      toast.error(`Dry run failed: ${(e as Error).message}`);
    }
  };

  const doRun = async (b: Bucket) => {
    if (!window.confirm(`Run storage migration for "${b}"? This will move files and rewrite database references. This cannot be undone without a rollback.`)) return;
    setState((s) => ({ ...s, [b]: { ...s[b], running: true } }));
    try {
      const res = await invoke({ action: "run", bucket: b });
      if (res.error === "order_gate") {
        toast.error(`Blocked — complete "${res.blocked_by}" first`);
        setState((s) => ({ ...s, [b]: { ...s[b], running: false } }));
        return;
      }
      setState((s) => ({
        ...s,
        [b]: { ...s[b], running: false, lastRunResult: { moved: res.moved, rewritten: res.rewritten, failed: res.failed, failures: res.failures } },
      }));
      toast.success(`Ran ${b}: moved ${res.moved}, rewrote ${res.rewritten} DB rows, failed ${res.failed}`);
      // Auto-fire integrity check
      const integrity = await invoke({ action: "integrity_check", bucket: b });
      setState((s) => ({
        ...s,
        [b]: { ...s[b], integrity: { pass: integrity.pass, failures: integrity.failures, sampled: integrity.sampled } },
      }));
      await refreshStatus();
    } catch (e) {
      setState((s) => ({ ...s, [b]: { ...s[b], running: false } }));
      toast.error(`Run failed: ${(e as Error).message}`);
    }
  };

  if (loading && !counts) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading manifest…
        </CardContent>
      </Card>
    );
  }

  const empty = !counts || Object.values(counts).every((c) => c.total === 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Storage migration (one-off)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Rewrites legacy storage paths under each organisation for stricter isolation. Run each bucket in order.
              Later buckets stay locked until earlier ones finish and pass integrity checks.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={doPrepare} disabled={preparing}>
            {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Refresh manifest</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No manifest rows yet. Click "Refresh manifest" to scan storage and populate the pending work.
          </div>
        )}
        {counts &&
          BUCKET_ORDER.map((b) => {
            const c = counts[b];
            const isUnlocked = unlocked?.[b] ?? false;
            const st = state[b];
            const complete = c.total > 0 && c.pending === 0 && c.in_progress === 0 && c.failed === 0;
            return (
              <div
                key={b}
                className={`rounded-lg border p-4 ${!isUnlocked ? "opacity-60 bg-muted/30" : ""}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{b}</span>
                    {complete && <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />complete</Badge>}
                    {!isUnlocked && <Badge variant="outline" className="text-[10px]"><Lock className="h-3 w-3 mr-1" />locked</Badge>}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Pending: <strong className="text-foreground">{c.pending}</strong></span>
                    <span>Done: <strong className="text-foreground">{c.done}</strong></span>
                    <span>Failed: <strong className={c.failed ? "text-destructive" : "text-foreground"}>{c.failed}</strong></span>
                    <span>Skipped: <strong className="text-foreground">{c.skipped}</strong></span>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isUnlocked || st.dryRunning || st.running || c.pending === 0}
                    onClick={() => doDryRun(b)}
                  >
                    {st.dryRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Dry run</span>
                  </Button>
                  <Button
                    size="sm"
                    disabled={!isUnlocked || st.dryRunning || st.running || (c.pending === 0 && c.failed === 0)}
                    onClick={() => doRun(b)}
                  >
                    {st.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{c.failed > 0 ? "Retry failed" : "Run"}</span>
                  </Button>
                </div>

                {st.lastDryResult && (
                  <div className="mt-3 text-xs">
                    <span className="text-muted-foreground">Dry run: </span>
                    <span>Ready {st.lastDryResult.ready}, blocked {st.lastDryResult.blocked}</span>
                    {(st.lastDryResult.failures?.length ?? 0) > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-destructive">Show blocked ({st.lastDryResult.failures!.length})</summary>
                        <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(st.lastDryResult.failures, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {st.lastRunResult && (
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Last run: </span>
                    <span>
                      Moved {st.lastRunResult.moved} · Rewrote {st.lastRunResult.rewritten} DB rows · Failed {st.lastRunResult.failed}
                    </span>
                    {(st.lastRunResult.failures?.length ?? 0) > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-destructive">Show failures ({st.lastRunResult.failures!.length})</summary>
                        <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(st.lastRunResult.failures, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {st.integrity && (
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Integrity: </span>
                    {st.integrity.pass ? (
                      <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />PASS ({st.integrity.sampled} sampled)
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />FAIL
                        </Badge>
                        <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-auto max-h-40">
                          {JSON.stringify(st.integrity.failures, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
