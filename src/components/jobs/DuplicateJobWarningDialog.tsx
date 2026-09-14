import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { duplicateJobLabel, type DuplicateJob } from "@/lib/duplicateJobs";
import { formatUKDate } from "@/lib/dateFormat";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateJob[];
  /** PO the user is about to save, used in the headline message. */
  customerPo?: string | null;
  /** Proceed with creating the job anyway. */
  onCreateAnyway: () => void;
}

/**
 * Shown before a job is saved when an existing non-cancelled job shares the
 * same customer PO, or the same customer + address within the last 90 days.
 * The user must choose: open the existing job, create anyway, or cancel.
 */
export default function DuplicateJobWarningDialog({
  open,
  onOpenChange,
  duplicates,
  customerPo,
  onCreateAnyway,
}: Props) {
  const navigate = useNavigate();
  if (duplicates.length === 0) return null;

  const poMatch = duplicates.find((d) => d.matchedBy === "customer_po");
  const headline = poMatch
    ? `PO ${(customerPo || poMatch.customer_po || "").trim()} is already on ${duplicateJobLabel(poMatch)}`
    : `A job for this customer at the same address already exists — ${duplicateJobLabel(duplicates[0])}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Possible duplicate job
          </DialogTitle>
          <DialogDescription>{headline}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{d.name || d.reference_number}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{d.reference_number}</span>
                {d.customer_po && <> · PO {d.customer_po}</>}
                {(d.sites?.name || d.address) && <> · {d.sites?.name || d.address}</>}
                {d.created_at && <> · created {formatUKDate(d.created_at)}</>}
                {d.status && <> · {d.status}</>}
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/jobs/${d.id}`);
                }}
              >
                Open existing job
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onCreateAnyway();
            }}
          >
            Create anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
