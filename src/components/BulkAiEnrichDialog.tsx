import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Play } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

type ResultStatus = "pending" | "running" | "success" | "skipped" | "error";

interface EnrichResult {
  customerId: string;
  customerName: string;
  status: ResultStatus;
  updates?: Record<string, string>;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  onComplete: () => void;
}

export default function BulkAiEnrichDialog({ open, onOpenChange, customers, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cancelRef = useRef(false);

  const eligibleCustomers = customers.filter(
    (c) => !c.address || !c.email || !c.phone
  );

  const reset = () => {
    setResults([]);
    setCurrentIndex(0);
    cancelRef.current = false;
  };

  const runBulkEnrich = useCallback(async () => {
    if (eligibleCustomers.length === 0) return;
    setRunning(true);
    cancelRef.current = false;

    const initialResults: EnrichResult[] = eligibleCustomers.map((c) => ({
      customerId: c.id,
      customerName: c.name,
      status: "pending",
    }));
    setResults(initialResults);

    for (let i = 0; i < eligibleCustomers.length; i++) {
      if (cancelRef.current) break;
      setCurrentIndex(i);

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r))
      );

      try {
        const { data, error } = await supabase.functions.invoke("ai-enrich-customer", {
          body: { customer_id: eligibleCustomers[i].id },
        });

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        const updates = data?.updates || {};
        const hasUpdates = Object.keys(updates).length > 0;

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: hasUpdates ? "success" : "skipped",
                  updates: hasUpdates ? updates : undefined,
                }
              : r
          )
        );
      } catch (err: any) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "error", error: err.message } : r
          )
        );
      }

      // Small delay to avoid rate limits
      if (i < eligibleCustomers.length - 1 && !cancelRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    setRunning(false);
    onComplete();
  }, [eligibleCustomers, onComplete]);

  const cancel = () => {
    cancelRef.current = true;
  };

  const completed = results.filter((r) => r.status !== "pending" && r.status !== "running").length;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const progress = results.length > 0 ? (completed / results.length) * 100 : 0;

  const STATUS_ICON: Record<ResultStatus, React.ReactNode> = {
    pending: <span className="h-4 w-4 rounded-full bg-muted inline-block" />,
    running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    skipped: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) { reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Bulk AI Auto-Fill
          </DialogTitle>
          <DialogDescription>
            {eligibleCustomers.length} customer{eligibleCustomers.length !== 1 ? "s" : ""} with missing contact details found out of {customers.length} total.
          </DialogDescription>
        </DialogHeader>

        {results.length === 0 && !running && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
              <p className="font-medium">The AI agent will:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Look up each customer on Companies House for registered addresses</li>
                <li>Search internal site records for emails &amp; phone numbers</li>
                <li>Fall back to web search for any remaining gaps</li>
                <li>Automatically update the customer record</li>
              </ul>
            </div>
            {eligibleCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">All customers already have complete contact details.</p>
            ) : (
              <Button onClick={runBulkEnrich} className="w-full gap-2">
                <Play className="h-4 w-4" />
                Start Auto-Fill ({eligibleCustomers.length} customers)
              </Button>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{completed} / {results.length} processed</span>
                <span className="flex gap-2">
                  {successCount > 0 && <span className="text-green-600">{successCount} updated</span>}
                  {errorCount > 0 && <span className="text-destructive">{errorCount} failed</span>}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-1 pr-3">
                {results.map((r, i) => (
                  <div key={r.customerId} className="flex items-center gap-2 py-1.5 px-2 rounded text-sm hover:bg-muted/30">
                    {STATUS_ICON[r.status]}
                    <span className="flex-1 truncate">{r.customerName}</span>
                    {r.status === "success" && r.updates && (
                      <div className="flex gap-1">
                        {Object.keys(r.updates).map((field) => (
                          <Badge key={field} variant="outline" className="text-[10px] capitalize">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {r.status === "skipped" && (
                      <span className="text-[10px] text-muted-foreground">No data found</span>
                    )}
                    {r.status === "error" && (
                      <span className="text-[10px] text-destructive truncate max-w-[120px]">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              {running ? (
                <Button variant="destructive" size="sm" onClick={cancel}>
                  Stop
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
                  Close
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
