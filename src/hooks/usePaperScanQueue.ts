import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PaperScanItemStatus =
  | "pending"
  | "processing"
  | "ready"
  | "low_confidence"
  | "failed"
  | "confirmed"
  | "rejected";

const PENDING_STATUSES: PaperScanItemStatus[] = [
  "ready",
  "low_confidence",
  "failed",
];

export function usePaperScanPendingCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { count: c } = await supabase
        .from("paper_scan_batch_items")
        .select("id", { count: "exact", head: true })
        .in("status", PENDING_STATUSES);
      if (!cancelled) setCount(c || 0);
    };
    load();

    const channel = supabase
      .channel("paper_scan_items_count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "paper_scan_batch_items",
        },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
