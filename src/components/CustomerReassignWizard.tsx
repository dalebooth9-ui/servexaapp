import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, Loader2, MapPin, Sparkles, Users } from "lucide-react";

type Customer = { id: string; name: string; address: string | null };

type PreviewResult = {
  dry_run: true;
  from: { id: string; name: string; address: string | null };
  to: { id: string; name: string; will_create: boolean };
  counts: Record<string, number>;
  total: number;
};

/**
 * Heuristic — does this customer name look like a site/address rather than a
 * company? Used to surface likely candidates first.
 *
 *  - starts with a number ("7 Burlington Gardens", "60 Old House Street")
 *  - contains street-suffix words (Road, Street, Lane, Gardens, Avenue, etc.)
 *  - all-numeric postcodes / very short purely-numeric labels
 */
function looksLikeSiteName(name: string): boolean {
  if (!name) return false;
  const s = name.trim();
  if (/^\d/.test(s)) return true;
  const streetSuffix = /\b(road|street|lane|gardens|avenue|close|drive|crescent|court|place|square|terrace|way|mews|hill|rise|park|grove|walk|wharf|yard|estate|industrial|business park|block|house|tower|building|building [a-z0-9]+)\b/i;
  return streetSuffix.test(s);
}

export default function CustomerReassignWizard() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [fromQuery, setFromQuery] = useState("");
  const [from, setFrom] = useState<Customer | null>(null);

  const [toQuery, setToQuery] = useState("");
  const [to, setTo] = useState<Customer | null>(null);
  const [createNewName, setCreateNewName] = useState("");

  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [running, setRunning] = useState(false);

  // Fuzzy-match confirmation when typing a new target name
  const [similarMatch, setSimilarMatch] = useState<{ id: string; name: string; similarity: number } | null>(null);
  const [similarConfirmOpen, setSimilarConfirmOpen] = useState(false);
  const [checkingSimilar, setCheckingSimilar] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("customers")
        .select("id, name, address")
        .order("name");
      setCustomers((data as Customer[]) ?? []);
      setLoading(false);
    })();
  }, [open]);

  const reset = () => {
    setStep(1);
    setFromQuery("");
    setFrom(null);
    setToQuery("");
    setTo(null);
    setCreateNewName("");
    setPreview(null);
  };

  const closeAll = () => {
    setOpen(false);
    reset();
  };

  // Sorted/filtered candidate list for step 1 — site-named first
  const fromCandidates = useMemo(() => {
    const q = fromQuery.trim().toLowerCase();
    return customers
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ ...c, isSite: looksLikeSiteName(c.name) }))
      .sort((a, b) => (a.isSite === b.isSite ? a.name.localeCompare(b.name) : a.isSite ? -1 : 1))
      .slice(0, 30);
  }, [customers, fromQuery]);

  const toCandidates = useMemo(() => {
    const q = toQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => c.id !== from?.id && c.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [customers, toQuery, from]);

  if (userRole !== "admin") return null;

  const runPreview = async (opts?: { skipSimilarCheck?: boolean }) => {
    if (!from) return;
    if (!to && !createNewName.trim()) {
      toast({ title: "Pick a target customer or enter a new name", variant: "destructive" });
      return;
    }

    // Fuzzy-match guard: when creating a new target by name, warn if it's
    // very similar to an existing customer so the admin doesn't accidentally
    // create a near-duplicate (e.g. "Fireworks Fire Protection Ltd" vs
    // "Fireworks Fire Protection").
    if (!opts?.skipSimilarCheck && !to && createNewName.trim()) {
      setCheckingSimilar(true);
      try {
        const { data, error } = await supabase.rpc("find_similar_customer", {
          _name: createNewName.trim(),
          _threshold: 0.55,
        });
        if (error) throw error;
        const match = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
        if (match && match.id !== from.id && match.name?.toLowerCase() !== createNewName.trim().toLowerCase()) {
          setSimilarMatch({ id: match.id, name: match.name, similarity: Number(match.similarity) });
          setSimilarConfirmOpen(true);
          setCheckingSimilar(false);
          return; // wait for user to confirm in the dialog
        }
      } catch (e) {
        // Non-fatal — log but continue
        console.warn("Similarity check failed", e);
      } finally {
        setCheckingSimilar(false);
      }
    }

    setPreviewing(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("reassign-customer", {
        body: {
          from_customer_id: from.id,
          to_customer_id: to?.id || null,
          to_customer_name: to ? null : createNewName.trim(),
          dry_run: true,
        },
      });
      if (error) throw error;
      setPreview(data as PreviewResult);
      setStep(3);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Preview failed", description: msg, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const runReassign = async () => {
    if (!from) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("reassign-customer", {
        body: {
          from_customer_id: from.id,
          to_customer_id: to?.id || null,
          to_customer_name: to ? null : createNewName.trim(),
          dry_run: false,
        },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.errors?.length) {
        toast({
          title: "Completed with warnings",
          description: result.errors.slice(0, 3).join("; "),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Customer reassigned",
          description: `Moved ${result.total} record(s) from “${result.from.name}” → “${result.to.name}”.`,
        });
      }
      closeAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Reassignment failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <CardTitle className="text-lg">Customer Reassignment Wizard</CardTitle>
        </div>
        <CardDescription>
          Fix customers that were accidentally created from a site name (e.g. “7 Burlington Gardens”) by moving all linked jobs and records to the correct company (e.g. “Fireworks Fire Protection”) in one click.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => setOpen(true)} variant="outline">
          <Users className="h-4 w-4 mr-2" /> Open wizard
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeAll())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Reassign customer — Step {step} of 3
            </DialogTitle>
            <DialogDescription>
              {step === 1 && "Pick the customer that was created incorrectly (often a site or address)."}
              {step === 2 && "Pick the correct company name, or type a new one to create it."}
              {step === 3 && "Review the changes that will be applied, then confirm."}
            </DialogDescription>
          </DialogHeader>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-3">
              <Label>Search customers</Label>
              <Input
                placeholder="e.g. 7 Burlington Gardens"
                value={fromQuery}
                onChange={(e) => setFromQuery(e.target.value)}
                autoFocus
              />
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded border divide-y">
                  {fromCandidates.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">No customers match.</p>
                  )}
                  {fromCandidates.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setFrom({ id: c.id, name: c.name, address: c.address })}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors ${
                        from?.id === c.id ? "bg-muted" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium">{c.name}</span>
                        {c.isSite && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <MapPin className="h-3 w-3" /> looks like a site
                          </Badge>
                        )}
                      </span>
                      {c.address && (
                        <span className="truncate text-[11px] text-muted-foreground">{c.address}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && from && (
            <div className="space-y-4">
              <div className="rounded border bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Moving from</div>
                <div className="font-medium">{from.name}</div>
                {from.address && <div className="text-xs text-muted-foreground">{from.address}</div>}
              </div>

              <div>
                <Label>Search for the correct company</Label>
                <Input
                  placeholder="e.g. Fireworks Fire Protection"
                  value={toQuery}
                  onChange={(e) => { setToQuery(e.target.value); setTo(null); setCreateNewName(""); }}
                  autoFocus
                />
                {toCandidates.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded border divide-y">
                    {toCandidates.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => { setTo(c); setCreateNewName(""); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted transition-colors ${
                          to?.id === c.id ? "bg-muted" : ""
                        }`}
                      >
                        <span className="font-medium truncate">{c.name}</span>
                        {c.address && <span className="text-[11px] text-muted-foreground truncate">{c.address}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded border border-dashed p-3 space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Or create a new customer</Label>
                <Input
                  placeholder="New customer name"
                  value={createNewName}
                  onChange={(e) => { setCreateNewName(e.target.value); setTo(null); }}
                />
                {createNewName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    A new customer “{createNewName.trim()}” will be created and used as the target.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded border p-3 bg-muted/40">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">From</div>
                  <div className="font-medium truncate">{preview.from.name}</div>
                  {preview.from.address && <div className="text-xs text-muted-foreground truncate">{preview.from.address}</div>}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">To</div>
                  <div className="font-medium truncate">{preview.to.name}</div>
                  {preview.to.will_create && (
                    <Badge variant="secondary" className="text-[10px] mt-0.5">will be created</Badge>
                  )}
                </div>
              </div>

              <div className="rounded border">
                <div className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
                  Records that will move ({preview.total} total)
                </div>
                <div className="divide-y text-sm">
                  {Object.entries(preview.counts).map(([table, n]) => (
                    <div key={table} className="flex justify-between px-3 py-1.5">
                      <span className="font-mono text-xs">{table}</span>
                      <span className={n > 0 ? "font-medium" : "text-muted-foreground"}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                After applying, the source customer “{preview.from.name}” will be deleted. Job records will keep their full history; only the customer link is changed.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={closeAll}>Cancel</Button>
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={running || previewing}>
                  Back
                </Button>
              )}
              {step === 1 && (
                <Button onClick={() => from && setStep(2)} disabled={!from}>
                  Next
                </Button>
              )}
              {step === 2 && (
                <Button
                  onClick={() => runPreview()}
                  disabled={previewing || checkingSimilar || (!to && !createNewName.trim())}
                >
                  {(previewing || checkingSimilar) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Preview changes
                </Button>
              )}
              {step === 3 && (
                <Button onClick={runReassign} disabled={running}>
                  {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Apply reassignment
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
