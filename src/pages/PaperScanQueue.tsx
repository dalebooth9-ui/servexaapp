import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatDistanceToNow } from "date-fns";
import {
  ScanLine,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCw,
  Trash2,
  Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ScanReviewDialog, {
  type ScanQueueItemInput,
} from "@/components/paper-scan/ScanReviewDialog";
import BulkActionBar from "@/components/BulkActionBar";
import { deletePaperScanItems } from "@/lib/deletePaperScanItems";
import { bulkFileAndConvertArchiveItems } from "@/lib/bulkFileAndConvertArchiveItems";


type Item = {
  id: string;
  batch_id: string;
  status: string;
  confidence: number | null;
  detected_template_id: string | null;
  candidate_matches: any;
  extracted: any;
  header_data: any;
  guess_customer_id: string | null;
  guess_site_id: string | null;
  guess_date: string | null;
  image_paths: string[];
  error: string | null;
  created_at: string;
  created_job_id: string | null;
  matched_existing_job?: boolean | null;
  mode?: "job" | "archive" | null;
  archived_document_id?: string | null;
  template_name?: string | null;
  customer_name?: string | null;
  site_name?: string | null;
  created_job_ref?: string | null;
};


const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready to review",
  low_confidence: "Low confidence",
  failed: "Failed to read",
  confirmed: "Filed",
  rejected: "Discarded",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  processing: "outline",
  ready: "default",
  low_confidence: "secondary",
  failed: "destructive",
  confirmed: "secondary",
  rejected: "outline",
};

interface PaperScanQueueProps {
  /** When true, render just the page body (no AppLayout wrapper) so it can
   *  be embedded as a tab inside the unified `/paper-scans` shell. */
  embedded?: boolean;
  /** Optional callback used by the empty-state action to jump to the Upload
   *  tab when the queue is embedded inside `/paper-scans`. */
  onGoUpload?: () => void;
}

export default function PaperScanQueue({ embedded = false, onGoUpload }: PaperScanQueueProps = {}) {
  const { userRole, user, orgId } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [modeTab, setModeTab] = useState<"job" | "archive">("job");
  const [openItem, setOpenItem] = useState<
    (ScanQueueItemInput & { _mode: "job" | "archive" }) | null
  >(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { toast } = useToast();


  const isAdmin = userRole === "admin";

  // Clear selection whenever the tab changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [modeTab]);

  const retryItem = useCallback(async (item: Item) => {
    setRetrying((r) => ({ ...r, [item.id]: true }));
    try {
      const { error } = await (supabase as any)
        .from("paper_scan_batch_items")
        .update({ status: "pending", error: null })
        .eq("id", item.id);
      if (error) throw error;
      await supabase.functions.invoke("process-paper-scan-batch", {
        body: { batch_id: item.batch_id },
      });
      toast({ title: "Retrying", description: "The item is being reprocessed." });
    } catch (e: any) {
      toast({ title: "Retry failed", description: e?.message, variant: "destructive" });
    } finally {
      setRetrying((r) => ({ ...r, [item.id]: false }));
    }
  }, [toast]);


  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("paper_scan_batch_items")
      .select(
        "id, batch_id, status, confidence, detected_template_id, candidate_matches, extracted, header_data, guess_customer_id, guess_site_id, guess_date, image_paths, error, created_at, created_job_id, matched_existing_job, mode, archived_document_id",
      )
      .order("created_at", { ascending: false })

      .limit(200);
    const rows = (data as any as Item[]) || [];

    // Enrich with template/customer/site names
    const templateIds = Array.from(
      new Set(rows.map((r) => r.detected_template_id).filter(Boolean)),
    ) as string[];
    const customerIds = Array.from(
      new Set(rows.map((r) => r.guess_customer_id).filter(Boolean)),
    ) as string[];
    const siteIds = Array.from(
      new Set(rows.map((r) => r.guess_site_id).filter(Boolean)),
    ) as string[];

    const jobIds = Array.from(
      new Set(rows.map((r) => r.created_job_id).filter(Boolean)),
    ) as string[];

    const [tplRes, custRes, siteRes, jobRes] = await Promise.all([
      templateIds.length
        ? supabase.from("job_sheet_templates").select("id, name").in("id", templateIds)
        : Promise.resolve({ data: [] as any[] }),
      customerIds.length
        ? supabase.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [] as any[] }),
      siteIds.length
        ? supabase.from("sites").select("id, name").in("id", siteIds)
        : Promise.resolve({ data: [] as any[] }),
      jobIds.length
        ? supabase.from("jobs").select("id, reference_number").in("id", jobIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const tplMap = new Map((tplRes.data as any[]).map((t) => [t.id, t.name]));
    const custMap = new Map((custRes.data as any[]).map((c) => [c.id, c.name]));
    const siteMap = new Map((siteRes.data as any[]).map((s) => [s.id, s.name]));
    const jobMap = new Map((jobRes.data as any[]).map((j) => [j.id, j.reference_number]));

    setItems(
      rows.map((r) => ({
        ...r,
        template_name: r.detected_template_id
          ? (tplMap.get(r.detected_template_id) as string | undefined) || null
          : null,
        customer_name: r.guess_customer_id
          ? (custMap.get(r.guess_customer_id) as string | undefined) || null
          : null,
        site_name: r.guess_site_id
          ? (siteMap.get(r.guess_site_id) as string | undefined) || null
          : null,
        created_job_ref: r.created_job_id
          ? (jobMap.get(r.created_job_id) as string | undefined) || null
          : null,
      })),
    );
    // Auto-kick the processor for any batches that have pending items but no
    // one currently processing (e.g. after a Retry, or if a batch stalled).
    const pendingBatches = Array.from(
      new Set(rows.filter((r) => r.status === "pending").map((r) => r.batch_id)),
    );
    for (const bId of pendingBatches) {
      supabase.functions
        .invoke("process-paper-scan-batch", { body: { batch_id: bId } })
        .catch(() => {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("paper_scan_queue")
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
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Load thumbnails (signed URLs) lazily for first photo of each item
  useEffect(() => {
    const missing = items.filter(
      (i) => i.image_paths?.[0] && !thumbs[i.image_paths[0]],
    );
    if (missing.length === 0) return;
    (async () => {
      const updates: Record<string, string> = {};
      for (const i of missing) {
        const p = i.image_paths[0];
        const { data } = await supabase.storage
          .from("submissions")
          .createSignedUrl(p, 60 * 60);
        if (data?.signedUrl) updates[p] = data.signedUrl;
      }
      if (Object.keys(updates).length) {
        setThumbs((prev) => ({ ...prev, ...updates }));
      }
    })();
  }, [items, thumbs]);

  const filtered = useMemo(() => {
    const modeFiltered = items.filter(
      (i) => (i.mode || "job") === modeTab,
    );
    if (filter === "all") return modeFiltered;
    return modeFiltered.filter((i) =>
      ["pending", "processing", "ready", "low_confidence", "failed"].includes(
        i.status,
      ),
    );
  }, [items, filter, modeTab]);


  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    items
      .filter((i) => (i.mode || "job") === modeTab)
      .forEach((i) => {
        c[i.status] = (c[i.status] || 0) + 1;
      });
    return c;
  }, [items, modeTab]);

  // Prune selection to only ids present in the current filtered view so
  // hidden-and-selected rows can't be silently deleted/converted. Runs
  // whenever the filter or the underlying items list changes.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  const selectedItems = useMemo(
    () => filtered.filter((i) => selectedIds.has(i.id)),
    [filtered, selectedIds],
  );
  const selectedFailed = selectedItems.filter((i) => i.status === "failed");
  const selectedProcessing = selectedItems.filter(
    (i) => i.status === "processing" || i.status === "pending",
  );
  const selectedReadyArchive = selectedItems.filter(
    (i) =>
      (i.mode || "job") === "archive" &&
      (i.status === "ready" || i.status === "low_confidence"),
  );

  const toggleId = (id: string, on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAllVisible = (on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) filtered.forEach((r) => next.add(r.id));
      else filtered.forEach((r) => next.delete(r.id));
      return next;
    });
  };

  const runBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      await deletePaperScanItems(ids);
      toast({
        title: `Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}`,
      });
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      await load();
    } catch (e: any) {
      toast({
        title: "Bulk delete failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkRetry = async () => {
    if (selectedFailed.length === 0) return;
    setBulkBusy(true);
    try {
      const ids = selectedFailed.map((i) => i.id);
      const batchIds = Array.from(new Set(selectedFailed.map((i) => i.batch_id)));
      const { error } = await (supabase as any)
        .from("paper_scan_batch_items")
        .update({ status: "pending", error: null })
        .in("id", ids);
      if (error) throw error;
      for (const bId of batchIds) {
        supabase.functions
          .invoke("process-paper-scan-batch", { body: { batch_id: bId } })
          .catch(() => {});
      }
      toast({
        title: `Retrying ${ids.length} item${ids.length === 1 ? "" : "s"}`,
      });
      setSelectedIds(new Set());
    } catch (e: any) {
      toast({
        title: "Bulk retry failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkConvertArchive = async () => {
    if (!user || !orgId || selectedReadyArchive.length === 0) return;
    setBulkBusy(true);
    try {
      const { filed, failed } = await bulkFileAndConvertArchiveItems({
        items: selectedReadyArchive.map((i) => ({
          id: i.id,
          batch_id: i.batch_id,
          detected_template_id: i.detected_template_id,
          extracted: i.extracted,
          header_data: i.header_data,
          guess_customer_id: i.guess_customer_id,
          guess_site_id: i.guess_site_id,
          guess_date: i.guess_date,
          image_paths: i.image_paths,
          template_name: i.template_name || null,
        })),
        userId: user.id,
        orgId,
      });
      toast({
        title: `Filed ${filed} and queued for conversion`,
        description:
          failed > 0
            ? `${failed} failed to file — check the queue.`
            : "AI will extract answers and generate the electronic report in the background.",
        variant: failed > 0 ? "destructive" : "default",
      });
      setSelectedIds(new Set());
      await load();
    } catch (e: any) {
      toast({
        title: "Bulk convert failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const openReview = (i: Item) => {
    // Fall back to archive-mode review when a job-mode item has no template
    // detected — the reviewer can still file it (as an unmatched archive)
    // instead of hitting a dead-end with no action button.
    const currentMode: "job" | "archive" =
      (i.mode || "job") === "archive" || !i.detected_template_id ? "archive" : "job";
    setOpenItem({
      _mode: currentMode,
      itemId: i.id,
      batchId: i.batch_id,
      templateId: i.detected_template_id,
      templateName: i.template_name || null,
      documentType: (i.header_data?.document_type as string) || null,
      extracted: i.extracted || {},
      header: i.header_data || {},
      imagePaths: i.image_paths || [],
      guessCustomerId: i.guess_customer_id,
      guessSiteId: i.guess_site_id,
      guessDate: i.guess_date,
      candidateMatches: Array.isArray(i.candidate_matches)
        ? i.candidate_matches
        : [],
    });
  };



  if (!isAdmin) {
    const denied = (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          This page is available to administrators only.
        </p>
      </div>
    );
    return embedded ? denied : <AppLayout>{denied}</AppLayout>;
  }

  const body = (
    <>

      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ScanLine className="h-6 w-6" /> Paper scan review queue
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Forms digitised from bulk paper-report uploads. Review each one,
              correct the extracted answers, and file it as a completed job.
            </p>
          </div>
          <div className="flex gap-2 text-xs items-center">
            <span className="text-muted-foreground">
              {modeTab === "job" ? "Job scans:" : "Archive scans:"}
            </span>
            <Badge variant="outline">Ready: {counts.ready || 0}</Badge>
            <Badge variant="secondary">
              Low confidence: {counts.low_confidence || 0}
            </Badge>
            <Badge variant="destructive">Failed: {counts.failed || 0}</Badge>
            <Badge variant="outline">Filed: {counts.confirmed || 0}</Badge>
          </div>

        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-md border p-0.5">
            <Button
              size="sm"
              variant={modeTab === "job" ? "default" : "ghost"}
              onClick={() => setModeTab("job")}
            >
              Job scans
            </Button>
            <Button
              size="sm"
              variant={modeTab === "archive" ? "default" : "ghost"}
              onClick={() => setModeTab("archive")}
            >
              Archive scans
            </Button>
            <div className="w-px bg-border self-stretch mx-0.5" />
            <Button
              size="sm"
              variant={filter === "pending" ? "default" : "ghost"}
              onClick={() => setFilter("pending")}
            >
              Awaiting review
            </Button>
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "ghost"}
              onClick={() => setFilter("all")}
            >
              All (last 200)
            </Button>
          </div>
        </div>


        <Card>
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm space-y-3">
              <div>Nothing to review right now.</div>
              {onGoUpload ? (
                <Button size="sm" variant="outline" onClick={onGoUpload}>
                  Upload sheets in the Upload tab
                </Button>
              ) : (
                <div className="text-xs">
                  Upload new sheets from the Upload tab in Paper scans.
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all rows in view"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((r) => selectedIds.has(r.id))
                      }
                      onCheckedChange={(v) => toggleAllVisible(v === true)}
                    />
                  </TableHead>
                  <TableHead className="w-16"></TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Customer / Site (guessed)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => {
                  const thumb = i.image_paths?.[0]
                    ? thumbs[i.image_paths[0]]
                    : null;
                  return (
                    <TableRow
                      key={i.id}
                      data-state={selectedIds.has(i.id) ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          aria-label={`Select item ${i.id}`}
                          checked={selectedIds.has(i.id)}
                          onCheckedChange={(v) => toggleId(i.id, v === true)}
                        />
                      </TableCell>
                      <TableCell>
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="h-10 w-10 object-cover rounded border"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded border bg-muted" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {i.template_name || (
                            <span className="text-muted-foreground italic">
                              Not detected
                            </span>
                          )}
                        </div>
                        {i.confidence != null && (
                          <div className="text-xs text-muted-foreground">
                            {Math.round((i.confidence || 0) * 100)}% match
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{i.customer_name || <span className="text-muted-foreground italic">—</span>}</div>
                        <div className="text-xs text-muted-foreground">
                          {i.site_name || (i.header_data?.site as string) || ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {i.guess_date || (i.header_data?.date as string) || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[i.status] || "outline"}>
                          {STATUS_LABEL[i.status] || i.status}
                        </Badge>
                        {i.status === "failed" && i.error && (
                          <div className="text-xs text-destructive mt-1 flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{i.error}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {i.status === "confirmed" ? (
                          i.matched_existing_job ? (
                            <Badge variant="outline" className="border-blue-500/60 text-blue-700 bg-blue-500/10">
                              Matched to {i.created_job_ref || "job"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500/60 text-amber-700 bg-amber-500/10">
                              New job (historic) {i.created_job_ref ? `· ${i.created_job_ref}` : ""}
                            </Badge>
                          )
                        ) : i.status === "ready" || i.status === "low_confidence" ? (
                          <span className="text-xs text-muted-foreground">
                            Will create new (historic) unless matched in review
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(i.created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {i.status === "confirmed" && i.created_job_id ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/jobs/${i.created_job_id}`}>
                              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open job
                            </Link>
                          </Button>
                        ) : i.status === "confirmed" && i.archived_document_id ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/paper-scans?tab=history&doc=${i.archived_document_id}`}>
                              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open in archive
                            </Link>
                          </Button>
                        ) : i.status === "rejected" ? (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Discarded
                          </span>
                        ) : i.status === "ready" ||
                          i.status === "low_confidence" ? (
                          <Button size="sm" onClick={() => openReview(i)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Review
                          </Button>

                        ) : i.status === "processing" ||
                          i.status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />{" "}
                              Processing
                            </span>
                            {/* Safety valve: if the background processor crashed
                                mid-item this row would stay stuck forever with
                                no action. Allow the reviewer to force a retry. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={!!retrying[i.id]}
                              onClick={() => retryItem(i)}
                              title="Force reprocess if this row seems stuck"
                            >
                              {retrying[i.id] ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCw className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : i.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!retrying[i.id]}
                            onClick={() => retryItem(i)}
                          >
                            {retrying[i.id] ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCw className="mr-1 h-3.5 w-3.5" />
                            )}
                            Retry
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
        >
          {selectedFailed.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={runBulkRetry}
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry ({selectedFailed.length})
            </Button>
          )}
          {modeTab === "archive" && selectedReadyArchive.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={runBulkConvertArchive}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Convert ({selectedReadyArchive.length})
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkBusy}
            onClick={() => setConfirmBulkDelete(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete ({selectedIds.size})
          </Button>
        </BulkActionBar>
      </div>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} queue item{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected review-queue rows and their stored
              page images.
              {selectedProcessing.length > 0 && (
                <>
                  {" "}
                  <span className="text-destructive font-medium">
                    {selectedProcessing.length} of these are still processing —
                    deleting mid-conversion will cancel them.
                  </span>
                </>
              )}
              {" "}This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScanReviewDialog
        open={!!openItem}
        mode={openItem?._mode || "job"}
        item={openItem}
        onOpenChange={(o) => {
          if (!o) setOpenItem(null);
        }}
        onResolved={() => {
          setOpenItem(null);
          load();
        }}
      />

    </>
  );

  return embedded ? body : <AppLayout>{body}</AppLayout>;
}

