/**
 * ConflictResolutionDialog — Mounted once at the app root. Subscribes to the
 * conflict bus and walks the engineer through any optimistic-locking
 * conflicts surfaced by the sync drainer.
 *
 * Default selection is "Keep my version" because the engineer's offline edits
 * almost always reflect what they saw on site.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { subscribeConflicts, resolveConflict, type Conflict } from "@/lib/conflictBus";
import { enqueue } from "@/lib/syncQueue";
import { drainNow } from "@/hooks/useSyncQueueDrainer";

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export default function ConflictResolutionDialog() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = conflicts[0];

  useEffect(() => {
    const unsub = subscribeConflicts((list) => {
      setConflicts(list);
      if (list.length > 0) setOpen(true);
      else setOpen(false);
    });
    return unsub;
  }, []);

  const fields = useMemo(() => {
    if (!current || current.item.op.kind !== "update") return [] as string[];
    const op: any = current.item.op;
    return Object.keys(op.values || {});
  }, [current]);

  if (!current || current.item.op.kind !== "update") return null;
  const op: any = current.item.op;

  const handleKeepMine = async () => {
    setBusy(true);
    try {
      await enqueue({ ...op, force: true, baseUpdatedAt: undefined }, current.item.label);
      await resolveConflict(current.id);
      toast.success("Your version will be saved");
      void drainNow();
    } finally {
      setBusy(false);
    }
  };

  const handleKeepTheirs = async () => {
    setBusy(true);
    try {
      await resolveConflict(current.id);
      toast.message("Server version kept — your local edit was discarded");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && conflicts.length === 0) setOpen(false); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Conflict detected
            {conflicts.length > 1 && <Badge variant="secondary">1 of {conflicts.length}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Someone else changed <span className="font-medium">{op.table}</span> while you were offline.
            Choose which version to keep — the default is your version.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-2">
          <div className="grid grid-cols-[1fr_1fr] gap-3 text-sm">
            <div className="font-semibold">Your version</div>
            <div className="font-semibold text-muted-foreground">Server version</div>
            {fields.map((f) => (
              <div key={f} className="contents">
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{f}</div>
                  <div className="break-words">{formatValue(op.values[f])}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{f}</div>
                  <div className="break-words">{formatValue((current.serverRow as any)?.[f])}</div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleKeepTheirs} disabled={busy}>
            Keep server version
          </Button>
          <Button onClick={handleKeepMine} disabled={busy}>
            Keep my version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
