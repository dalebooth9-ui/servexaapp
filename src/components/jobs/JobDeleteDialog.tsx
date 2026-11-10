import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { jobDeleteSummary, plainDeleteError, type JobDeletePreview } from "@/lib/jobDelete";

interface Props {
  jobIds: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Called with the ids that were removed or archived. */
  onDone: (ids: string[], action: "deleted" | "archived") => void;
  beforeDelete?: (ids: string[]) => Promise<void>;
}

export default function JobDeleteDialog({ jobIds, open, onOpenChange, onDone, beforeDelete }: Props) {
  const [preview, setPreview] = useState<JobDeletePreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || jobIds.length === 0) return;
    setPreview(null); setError(null);
    supabase.rpc("preview_job_delete" as any, { _job_ids: jobIds }).then(({ data, error }) => {
      if (error) setError(plainDeleteError(error.message));
      else setPreview((data as any) ?? []);
    });
  }, [open, jobIds.join(",")]);

  const blocked = (preview ?? []).filter((p) => p.blockers.length > 0);
  const deletable = (preview ?? []).filter((p) => p.blockers.length === 0);

  const doDelete = async () => {
    const ids = deletable.map((p) => p.id);
    if (!ids.length) return;
    setBusy(true);
    await beforeDelete?.(ids);
    const { error } = await supabase.rpc("delete_jobs_safely" as any, { _job_ids: ids });
    setBusy(false);
    if (error) { setError(plainDeleteError(error.message)); return; }
    toast.success(`${ids.length} job${ids.length === 1 ? "" : "s"} deleted`);
    onDone(ids, "deleted");
    if (!blocked.length) onOpenChange(false);
    else setPreview(blocked);
  };

  const doArchive = async () => {
    const ids = blocked.map((p) => p.id);
    setBusy(true);
    const { error } = await supabase.from("jobs").update({ status: "archived" } as any).in("id", ids);
    setBusy(false);
    if (error) { setError(plainDeleteError(error.message)); return; }
    toast.success(`${ids.length} job${ids.length === 1 ? "" : "s"} archived`);
    onDone(ids, "archived");
    if (!deletable.length) onOpenChange(false);
    else setPreview(deletable);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {jobIds.length === 1 ? "this job" : `${jobIds.length} jobs`}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {!preview && !error && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking what's linked…</p>}
              {error && <p className="text-destructive">{error}</p>}
              {deletable.map((p) => (
                <div key={p.id} className="rounded-md border p-2">
                  <p className="font-medium text-foreground">{p.reference} – {p.name}</p>
                  <p>{jobDeleteSummary(p)}</p>
                </div>
              ))}
              {deletable.length > 0 && (
                <p>The site, customer, risers and their past service history are kept. Defects stay on the riser.</p>
              )}
              {blocked.map((p) => (
                <div key={p.id} className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                  <p className="font-medium text-foreground">{p.reference} – {p.name}</p>
                  <p>This job has {p.blockers.join(", ")}. Archive it instead.</p>
                </div>
              ))}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {blocked.length > 0 && (
            <Button variant="outline" disabled={busy} onClick={doArchive}>
              Archive {blocked.length === 1 ? "job" : `${blocked.length} jobs`}
            </Button>
          )}
          {deletable.length > 0 && (
            <Button variant="destructive" disabled={busy} onClick={doDelete}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Delete {deletable.length === 1 ? "job" : `${deletable.length} jobs`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
