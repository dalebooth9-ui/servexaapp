import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Archive } from "lucide-react";
import BulkScanTab from "@/components/paper-scan/BulkScanTab";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Digitise-only bulk scan: multi-page PDF or many photos, split into individual
// sheets, run the same recognition pass — but file each sheet into the archive
// library instead of creating jobs.
export default function ArchiveScanDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" /> Archive scan (digitise only)
          </DialogTitle>
          <DialogDescription>
            Multi-scan a stack of handwritten sheets and file them as electronic
            copies in the archive library. No jobs, visits or planner entries
            are created in this mode.
          </DialogDescription>
        </DialogHeader>
        <BulkScanTab mode="archive" onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
