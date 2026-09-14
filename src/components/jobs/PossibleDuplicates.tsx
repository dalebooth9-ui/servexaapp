import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import { findDuplicateJobs, type DuplicateJob } from "@/lib/duplicateJobs";
import { formatDate } from "@/lib/dateFormat";

interface Props {
  jobId: string;
  customerPo?: string | null;
  address?: string | null;
  customerId?: string | null;
}

/**
 * Small panel on the job detail page listing other non-cancelled jobs that
 * share this job's PO number, or the same customer + address in the last
 * 90 days. Renders nothing when there is nothing to show.
 */
export default function PossibleDuplicates({ jobId, customerPo, address, customerId }: Props) {
  const [dupes, setDupes] = useState<DuplicateJob[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await findDuplicateJobs({
        customerPo,
        address,
        customerId,
        excludeJobId: jobId,
      });
      if (!cancelled) setDupes(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, customerPo, address, customerId]);

  if (dupes.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Copy className="h-4 w-4 text-amber-600" />
        Possible duplicates ({dupes.length})
      </h2>
      <ul className="space-y-1.5">
        {dupes.map((d) => (
          <li key={d.id} className="text-sm">
            <Link to={`/jobs/${d.id}`} className="font-medium underline-offset-2 hover:underline">
              {d.reference_number || d.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {d.name && <> — {d.name}</>}
              {d.customer_po && <> · PO {d.customer_po}</>}
              {(d.sites?.name || d.address) && <> · {d.sites?.name || d.address}</>}
              {d.created_at && <> · created {formatDate(d.created_at)}</>}
              {" · "}
              {d.matchedBy === "customer_po" ? "same PO" : "same site"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
