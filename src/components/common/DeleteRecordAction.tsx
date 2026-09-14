import { useState, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shared, admin-only delete action.
 *
 * Every destructive action in the app should go through this so the rules stay
 * consistent: office/admin roles only, an explicit confirmation dialog, a check
 * for attached records before anything is removed, and a toast on success.
 */
export interface DeleteRecordActionProps {
  /** What is being deleted, e.g. "INV-0042" or "Acme Ltd". Used in the dialog title. */
  label: string;
  /** Extra sentence describing exactly what will be removed. */
  description?: string;
  /**
   * Optional pre-flight check. Return a message naming what is attached to
   * block the delete, or null/undefined to allow it.
   */
  checkDependants?: () => Promise<string | null | undefined>;
  /** Performs the delete. Throw to surface an error toast. */
  onDelete: () => Promise<void>;
  /** Called after a successful delete (e.g. refetch the list). */
  onDeleted?: () => void;
  /** How the trigger renders. */
  variant?: "menu-item" | "icon" | "button";
  /** Override the trigger text for the button/menu-item variants. */
  triggerLabel?: string;
  /** Success toast text. Defaults to "Deleted". */
  successMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Render the trigger even for non-admins (rarely needed). */
  allowNonAdmin?: boolean;
  children?: ReactNode;
}

export default function DeleteRecordAction({
  label,
  description,
  checkDependants,
  onDelete,
  onDeleted,
  variant = "menu-item",
  triggerLabel = "Delete",
  successMessage,
  disabled,
  className,
  allowNonAdmin = false,
}: DeleteRecordActionProps) {
  const { userRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const isOffice = userRole === "admin" || userRole === "platform_admin";
  if (!isOffice && !allowNonAdmin) return null;

  const openDialog = async () => {
    setBlocked(null);
    setOpen(true);
    if (!checkDependants) return;
    setBusy(true);
    try {
      const msg = await checkDependants();
      if (msg) setBlocked(msg);
    } catch (err: any) {
      setBlocked(err?.message || "Could not check what is attached to this record.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await onDelete();
      toast.success(successMessage || `${label} deleted`);
      setOpen(false);
      onDeleted?.();
    } catch (err: any) {
      toast.error(err?.message || "Could not delete — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const trigger =
    variant === "menu-item" ? (
      <DropdownMenuItem
        className={`text-destructive focus:text-destructive ${className || ""}`}
        disabled={disabled}
        onSelect={(e) => {
          e.preventDefault();
          openDialog();
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" /> {triggerLabel}
      </DropdownMenuItem>
    ) : variant === "icon" ? (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        aria-label={`Delete ${label}`}
        title={`Delete ${label}`}
        className={`text-destructive hover:text-destructive ${className || ""}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          openDialog();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        className={`gap-1.5 text-destructive hover:text-destructive ${className || ""}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          openDialog();
        }}
      >
        <Trash2 className="h-4 w-4" /> {triggerLabel}
      </Button>
    );

  return (
    <>
      {trigger}
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{blocked ? `Can't delete ${label}` : `Delete ${label}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {blocked
                ? blocked
                : description
                  ? `${description} This can't be undone.`
                  : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{blocked ? "Close" : "Cancel"}</AlertDialogCancel>
            {!blocked && (
              <AlertDialogAction
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  confirm();
                }}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
