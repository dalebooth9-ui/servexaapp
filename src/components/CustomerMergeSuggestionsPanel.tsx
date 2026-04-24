import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
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

export default function CustomerMergeSuggestionsPanel() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      .limit(100);

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

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Customer merge suggestions</CardTitle>
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-1">{items.length} pending</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription>
          Review fuzzy-matched customers detected when new jobs arrived (e.g. from The Mellor). Accept to
          merge the incoming record into the existing one, or dismiss to keep them separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No pending suggestions. New matches will appear here automatically.
          </p>
        ) : (
          items.map((s) => {
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dismiss(s)}
                    disabled={busyId === s.id}
                  >
                    <X className="h-4 w-4 mr-1" /> Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => accept(s)}
                    disabled={busyId === s.id || !s.existing}
                  >
                    {busyId === s.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Accept & merge
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
