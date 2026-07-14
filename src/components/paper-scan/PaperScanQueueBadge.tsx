import { Badge } from "@/components/ui/badge";
import { usePaperScanPendingCount } from "@/hooks/usePaperScanQueue";

export default function PaperScanQueueBadge() {
  const count = usePaperScanPendingCount();
  if (count === 0) return null;
  return (
    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
      {count}
    </Badge>
  );
}
