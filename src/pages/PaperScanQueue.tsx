import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import {
  ScanLine,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import ScanCompletedJobDialog, {
  type QueueItemInput,
} from "@/components/ScanCompletedJobDialog";
import ArchiveReviewDialog, {
  type ArchiveQueueItemInput,
} from "@/components/paper-scan/ArchiveReviewDialog";


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

export default function PaperScanQueue() {
  const { userRole } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [modeTab, setModeTab] = useState<"job" | "archive">("job");
  const [openItem, setOpenItem] = useState<QueueItemInput | null>(null);
  const [openArchiveItem, setOpenArchiveItem] =
    useState<ArchiveQueueItemInput | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});


  const isAdmin = userRole === "admin";

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
    items.forEach((i) => {
      c[i.status] = (c[i.status] || 0) + 1;
    });
    return c;
  }, [items]);

  const openReview = (i: Item) => {
    if ((i.mode || "job") === "archive") {
      setOpenArchiveItem({
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
      });
      return;
    }
    if (!i.detected_template_id) return;
    setOpenItem({
      itemId: i.id,
      batchId: i.batch_id,
      templateId: i.detected_template_id,
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
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            This page is available to administrators only.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
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
          <div className="flex gap-2 text-xs">
            <Badge variant="outline">
              Ready: {counts.ready || 0}
            </Badge>
            <Badge variant="secondary">
              Low confidence: {counts.low_confidence || 0}
            </Badge>
            <Badge variant="destructive">
              Failed: {counts.failed || 0}
            </Badge>
            <Badge variant="outline">
              Filed: {counts.confirmed || 0}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 rounded-md border p-0.5">
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
          </div>
          <Button
            size="sm"
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => setFilter("pending")}
          >
            Awaiting review
          </Button>
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All (last 200)
          </Button>
        </div>


        <Card>
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              Nothing in the queue. Use “Scan Paper Report” → “Bulk scan” on the
              Jobs page to add forms.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableRow key={i.id}>
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
                            <Link to={`/archive?doc=${i.archived_document_id}`}>
                              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open in archive
                            </Link>
                          </Button>
                        ) : i.status === "rejected" ? (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Discarded
                          </span>
                        ) : (i.status === "ready" ||
                            i.status === "low_confidence") &&
                          ((i.mode || "job") === "archive" ||
                            i.detected_template_id) ? (
                          <Button size="sm" onClick={() => openReview(i)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Review
                          </Button>

                        ) : i.status === "processing" ||
                          i.status === "pending" ? (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />{" "}
                            Processing
                          </span>
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
      </div>

      {openItem && (
        <ScanCompletedJobDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setOpenItem(null);
          }}
          queueItem={openItem}
          onQueueItemResolved={() => {
            setOpenItem(null);
            load();
          }}
        />
      )}
    </AppLayout>
  );
}
