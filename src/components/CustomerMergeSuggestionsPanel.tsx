import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
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
import { Loader2, GitMerge, X, Check, RefreshCw, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

type Suggestion = {
  id: string;
  incoming_name: string;
  similarity: number;
  status: string;
  source: string;
  created_at: string;
  related_job_id: string | null;
  existing_customer_id: string;
  new_customer_id: string | null;
  existing: { id: string; name: string } | null;
  incoming: { id: string; name: string } | null;
  job: { id: string; reference_number: string | null; name: string | null } | null;
};

/** Ambiguous suggestions (similarity < 1) grouped by the incoming duplicate. */
type AmbiguousGroup = {
  key: string;
  incomingName: string;
  newCustomerId: string | null;
  options: Suggestion[];
};

export default function CustomerMergeSuggestionsPanel() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const isAdmin = userRole === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_merge_suggestions")
      .select(
        `id, incoming_name, similarity, status, source, created_at, related_job_id, existing_customer_id, new_customer_id,
         existing:customers!customer_merge_suggestions_existing_customer_id_fkey(id, name),
         incoming:customers!customer_merge_suggestions_new_customer_id_fkey(id, name),
         job:jobs!customer_merge_suggestions_related_job_id_fkey(id, reference_number, name)`
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      toast({ title: "Failed to load suggestions", description: error.message, variant: "destructive" });
    } else {
      setItems((data || []) as unknown as Suggestion[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const exact = useMemo(() => items.filter((s) => Number(s.similarity) >= 1), [items]);
  const ambiguousGroups = useMemo<AmbiguousGroup[]>(() => {
    const map = new Map<string, AmbiguousGroup>();
    for (const s of items) {
      if (Number(s.similarity) >= 1) continue;
      const key = s.new_customer_id ?? s.incoming_name;
      if (!map.has(key)) {
        map.set(key, {
          key,
          incomingName: s.incoming?.name ?? s.incoming_name,
          newCustomerId: s.new_customer_id,
          options: [],
        });
      }
      map.get(key)!.options.push(s);
    }
    return Array.from(map.values());
  }, [items]);

  const dismiss = async (s: Suggestion) => {
    setBusyId(s.id);
    const { error } = await supabase
      .from("customer_merge_suggestions")
      .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Could not dismiss", description: error.message, variant: "destructive" });
      return;
    }
    setItems((cur) => cur.filter((x) => x.id !== s.id));
    toast({ title: "Suggestion dismissed" });
  };

  const accept = async (s: Suggestion) => {
    // Merge the newly created (incoming) customer INTO the existing one.
    // If there's no separate new_customer_id, nothing to merge — just accept.
    if (!s.new_customer_id || s.new_customer_id === s.existing_customer_id) {
      setBusyId(s.id);
      const { error } = await supabase
        .from("customer_merge_suggestions")
        .update({ status: "accepted", reviewed_at: new Date().toISOString() })
        .eq("id", s.id);
      setBusyId(null);
      if (error) {
        toast({ title: "Could not accept", description: error.message, variant: "destructive" });
        return;
      }
      setItems((cur) => cur.filter((x) => x.id !== s.id));
      toast({ title: "Suggestion accepted" });
      return;
    }

    setBusyId(s.id);
    const { data, error } = await supabase.functions.invoke("reassign-customer", {
      body: {
        from_customer_id: s.new_customer_id,
        to_customer_id: s.existing_customer_id,
        dry_run: false,
      },
    });
    if (error || (data as { error?: string })?.error) {
      setBusyId(null);
      toast({
        title: "Merge failed",
        description: error?.message || (data as { error?: string })?.error || "Unknown error",
        variant: "destructive",
      });
      return;
    }
    // Mark suggestion accepted
    await supabase
      .from("customer_merge_suggestions")
      .update({ status: "accepted", reviewed_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusyId(null);
    setItems((cur) => cur.filter((x) => x.id !== s.id));

    // Offer undo for ~12s using the snapshot returned by the edge function
    const snapshot = (data as { undo_snapshot?: unknown })?.undo_snapshot;
    const targetName = s.existing?.name ?? "existing customer";
    const sourceName = s.incoming?.name ?? s.incoming_name;

    toast({
      title: "Customers merged",
      description: `Moved records into "${targetName}".`,
      duration: 12000,
      action: snapshot ? (
        <ToastAction
          altText="Undo merge"
          onClick={async () => {
            const { data: undoData, error: undoErr } = await supabase.functions.invoke("reassign-customer", {
              body: { undo: true, undo_snapshot: snapshot },
            });
            if (undoErr || (undoData as { error?: string })?.error) {
              toast({
                title: "Undo failed",
                description: undoErr?.message || (undoData as { error?: string })?.error || "Unknown error",
                variant: "destructive",
              });
              return;
            }
            toast({
              title: "Merge undone",
              description: `Restored "${sourceName}" and reverted moved records.`,
            });
            load();
          }}
        >
          Undo
        </ToastAction>
      ) : undefined,
    });
  };

  /**
   * Merge every pending exact match. The edge function works in batches so the
   * request always returns; we keep calling until nothing is left.
   */
  const runBulkExact = async () => {
    setBulkOpen(false);
    setBulkRunning(true);
    const total = exact.length;
    setBulkTotal(total);
    setBulkDone(0);

    let merged = 0;
    const failures: { name: string; error: string }[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const { data, error } = await supabase.functions.invoke("reassign-customer", {
        body: { bulk_exact: true, batch_size: 20 },
      });
      const payload = data as
        | { merged?: number; processed?: number; remaining?: number; failures?: { name: string; error: string }[]; error?: string }
        | null;
      if (error || payload?.error) {
        toast({
          title: "Bulk merge stopped",
          description: error?.message || payload?.error || "Unknown error",
          variant: "destructive",
        });
        break;
      }
      merged += payload?.merged ?? 0;
      failures.push(...(payload?.failures ?? []));
      setBulkDone((d) => d + (payload?.processed ?? 0));
      if (!payload?.remaining || (payload?.processed ?? 0) === 0) break;
    }

    setBulkRunning(false);
    await load();
    toast({
      title: `Merged ${merged} duplicate${merged === 1 ? "" : "s"}`,
      description:
        failures.length > 0
          ? `${failures.length} could not be merged: ${failures.slice(0, 3).map((f) => f.name).join(", ")}${failures.length > 3 ? "…" : ""}`
          : "All exact matches were merged into the original customers.",
      variant: failures.length > 0 ? "destructive" : undefined,
      duration: 10000,
    });
  };

  /** Accept the chosen original for an ambiguous group and reject the rest. */
  const resolveAmbiguous = async (group: AmbiguousGroup) => {
    const chosenId = picked[group.key];
    if (!chosenId) return;
    const chosen = group.options.find((o) => o.id === chosenId);
    if (!chosen) return;
    const others = group.options.filter((o) => o.id !== chosenId);
    setBusyId(group.key);
    for (const o of others) {
      await supabase
        .from("customer_merge_suggestions")
        .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
        .eq("id", o.id);
    }
    setItems((cur) => cur.filter((x) => !others.some((o) => o.id === x.id)));
    setBusyId(null);
    await accept(chosen);
  };

  const rejectGroup = async (group: AmbiguousGroup) => {
    setBusyId(group.key);
    for (const o of group.options) {
      await supabase
        .from("customer_merge_suggestions")
        .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
        .eq("id", o.id);
    }
    setItems((cur) => cur.filter((x) => !group.options.some((o) => o.id === x.id)));
    setBusyId(null);
    toast({ title: "Kept as separate customers" });
  };

  if (!isAdmin) return null;

  const renderRow = (s: Suggestion) => {
    const pct = Math.round(Number(s.similarity) * 100);
    const incomingLabel = s.incoming?.name ?? s.incoming_name;
    return (
      <div
        key={s.id}
        className="flex flex-col md:flex-row md:items-center gap-3 rounded-lg border bg-card p-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{incomingLabel}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {s.existing ? (
              <Link
                to={`/customers/${s.existing.id}`}
                className="font-medium text-primary hover:underline truncate"
              >
                {s.existing.name}
              </Link>
            ) : (
              <span className="text-muted-foreground italic">missing</span>
            )}
            <Badge variant={pct >= 85 ? "default" : "secondary"}>{pct}% match</Badge>
            <Badge variant="outline" className="text-[10px]">{s.source}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</span>
            {s.job && (
              <>
                <span>•</span>
                <Link to={`/jobs/${s.job.id}`} className="hover:underline">
                  Job {s.job.reference_number ?? s.job.name ?? s.job.id.slice(0, 8)}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => dismiss(s)} disabled={busyId === s.id}>
            <X className="h-4 w-4 mr-1" /> Dismiss
          </Button>
          <Button size="sm" onClick={() => accept(s)} disabled={busyId === s.id || !s.existing}>
            {busyId === s.id ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Accept &amp; merge
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card id="customer-merge-suggestions">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Customer merge suggestions</CardTitle>
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-1">{items.length} pending</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading || bulkRunning}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription>
          Review duplicate customers found during imports and new jobs. Accept to merge the duplicate
          into the original, or dismiss to keep them separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {bulkRunning && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Merging {bulkDone} of {bulkTotal}…
            </div>
            <Progress value={bulkTotal ? (bulkDone / bulkTotal) * 100 : 0} />
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No pending suggestions. New matches will appear here automatically.
          </p>
        ) : (
          <>
            {exact.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">
                    Exact matches <span className="text-muted-foreground">({exact.length})</span>
                  </h3>
                  <Button size="sm" onClick={() => setBulkOpen(true)} disabled={bulkRunning}>
                    <GitMerge className="h-4 w-4 mr-1" />
                    Merge all exact matches ({exact.length})
                  </Button>
                </div>
                {exact.slice(0, 50).map(renderRow)}
                {exact.length > 50 && (
                  <p className="text-xs text-muted-foreground">
                    Showing the first 50 — use “Merge all exact matches” to clear them in one go.
                  </p>
                )}
              </section>
            )}

            {ambiguousGroups.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold text-sm">
                  Needs your decision{" "}
                  <span className="text-muted-foreground">({ambiguousGroups.length})</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  These names match more than one existing customer. Pick the correct original, or keep
                  them all separate.
                </p>
                {ambiguousGroups.map((g) => (
                  <div key={g.key} className="rounded-lg border bg-card p-3 space-y-3">
                    <div className="font-medium truncate">{g.incomingName}</div>
                    <RadioGroup
                      value={picked[g.key] ?? ""}
                      onValueChange={(v) => setPicked((p) => ({ ...p, [g.key]: v }))}
                      className="space-y-2"
                    >
                      {g.options.map((o) => (
                        <div key={o.id} className="flex items-center gap-2">
                          <RadioGroupItem value={o.id} id={o.id} />
                          <Label htmlFor={o.id} className="font-normal cursor-pointer">
                            {o.existing ? (
                              <Link
                                to={`/customers/${o.existing.id}`}
                                className="text-primary hover:underline"
                              >
                                {o.existing.name}
                              </Link>
                            ) : (
                              <span className="italic text-muted-foreground">missing</span>
                            )}
                            <span className="text-xs text-muted-foreground ml-2">
                              {Math.round(Number(o.similarity) * 100)}% match
                            </span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rejectGroup(g)}
                        disabled={busyId === g.key}
                      >
                        <X className="h-4 w-4 mr-1" /> Reject all
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => resolveAmbiguous(g)}
                        disabled={busyId === g.key || !picked[g.key]}
                      >
                        {busyId === g.key ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Merge into selected
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge all {exact.length} exact matches?</AlertDialogTitle>
            <AlertDialogDescription>
              Every duplicate will have its jobs, sites, documents, agreements and portal access moved
              onto the original customer, and the duplicate record will be removed. This can&apos;t be
              undone in bulk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkExact}>Merge all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
