import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { plainError } from "@/lib/plainError";
import { ARCHIVE_CONFIRM_TEXT } from "@/lib/customerArchive";

type Props = {
  customerId: string;
  archivedAt: string | null | undefined;
  archivedBy: string | null | undefined;
  isAdmin: boolean;
  onChanged: (archivedAt: string | null, archivedBy: string | null) => void;
};

export default function CustomerArchiveControl({ customerId, archivedAt, archivedBy, isAdmin, onChanged }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [byName, setByName] = useState<string | null>(null);

  useEffect(() => {
    if (!archivedBy) { setByName(null); return; }
    supabase.from("profiles").select("full_name").eq("user_id", archivedBy).maybeSingle()
      .then(({ data }) => setByName((data as any)?.full_name || null));
  }, [archivedBy]);

  const run = async (archive: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("set_customer_archived" as any, { _customer_id: customerId, _archive: archive } as any);
    setBusy(false);
    setConfirmOpen(false);
    if (error) {
      const msg = plainError(error);
      console.error("[customer-archive]", msg, error);
      toast.error(archive ? "Customer not archived" : "Customer not restored", { description: msg });
      return;
    }
    const row = data as any;
    onChanged(row?.archived_at ?? null, row?.archived_by ?? null);
    toast.success(archive ? "Customer archived. You can restore it any time." : "Customer restored");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {archivedAt && (
        <Badge variant="secondary">
          Archived {format(new Date(archivedAt), "dd/MM/yyyy HH:mm")}{byName ? ` by ${byName}` : ""}
        </Badge>
      )}
      {isAdmin && (archivedAt ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(false)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />}Restore
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmOpen(true)}>
          <Archive className="h-3.5 w-3.5 mr-1.5" />Archive
        </Button>
      ))}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ARCHIVE_CONFIRM_TEXT}</AlertDialogTitle>
            <AlertDialogDescription>
              The customer is hidden from the Customers list, search and job pickers. Their jobs, sites, reports, invoices and history stay exactly as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); run(true); }}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
