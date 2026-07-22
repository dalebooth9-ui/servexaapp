import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Archive,
  ScanLine,
  Loader2,
  AlertTriangle,
  Trash2,
  Wand2,
  FileText,
  Images,
  Download,
  Send,
} from "lucide-react";
import SendArchiveDialog from "@/components/paper-scan/SendArchiveDialog";
import ArchiveScanDialog from "@/components/paper-scan/ArchiveScanDialog";
import { useAuth } from "@/hooks/useAuth";
import { resolveSubmissionsSignedUrls, resolveSubmissionsSignedUrl } from "@/lib/resolveSubmissionsPath";
import { useToast } from "@/hooks/use-toast";
import { deleteArchivedDocument } from "@/lib/deleteArchivedDocument";
import {
  archiveConversionQueue,
  useArchiveConversionEntry,
  useArchiveConversionSummary,
} from "@/lib/archiveConversionQueue";
import type { ProposedDefect } from "@/lib/proposeArchiveDefects";
import { createArchiveSourcedDefects } from "@/lib/proposeArchiveDefects";
import ProposedDefectsSection from "@/components/paper-scan/ProposedDefectsSection";
import { Checkbox } from "@/components/ui/checkbox";
import BulkActionBar from "@/components/BulkActionBar";
import { usePaperScanPendingCount } from "@/hooks/usePaperScanQueue";
import { formatDate } from "@/lib/dateFormat";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";

type EmailSend = {
  sent_at?: string;
  recipient?: string;
  subject?: string;
  channel?: string;
};

type ArchivedDoc = {
  id: string;
  customer_id: string | null;
  site_id: string | null;
  document_date: string | null;
  document_type: string | null;
  template_id: string | null;
  template_name: string | null;
  title: string | null;
  notes: string | null;
  file_paths: string[];
  report_pdf_path: string | null;
  page_count: number;
  status: "filed" | "unmatched";
  created_at: string;
  header_data: Record<string, any> | null;
};

interface ArchivedDocumentsProps {
  /** When true, render just the page body (no AppLayout wrapper) so it can
   *  be embedded as a tab inside the unified `/paper-scans` shell. Also hides
   *  the "Archive scan" launcher since Upload has its own tab. */
  embedded?: boolean;
  /** Called when the user clicks the "N sheets awaiting review" hint — the
   *  parent tab shell switches to the review tab. */
  onGoReview?: () => void;
}

export default function ArchivedDocuments({ embedded = false, onGoReview }: ArchivedDocumentsProps = {}) {
  const [params, setParams] = useSearchParams();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<ArchivedDoc[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "filed" | "unmatched">(
    "all",
  );
  const [typeFilter, setTypeFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState<string>(
    params.get("customer") || "all",
  );
  const [scanOpen, setScanOpen] = useState(false);
  const [openDoc, setOpenDoc] = useState<ArchivedDoc | null>(null);
  const [openUrls, setOpenUrls] = useState<string[]>([]);
  const [openFailed, setOpenFailed] = useState<string[]>([]);
  const [openPdfUrl, setOpenPdfUrl] = useState<string | null>(null);
  const [openView, setOpenView] = useState<"pdf" | "scan" | "split">("split");
  const [openLoading, setOpenLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ArchivedDoc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [sendDoc, setSendDoc] = useState<ArchivedDoc | null>(null);

  const isAdmin = userRole === "admin";

  const pendingReviewCount = usePaperScanPendingCount();

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("archived_documents")
      .select(
        "id, customer_id, site_id, document_date, document_type, template_id, template_name, title, notes, file_paths, report_pdf_path, page_count, status, created_at, header_data",
      )
      .order("document_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = ((data as any) || []) as ArchivedDoc[];
    setDocs(rows);

    const cIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[];
    const sIds = Array.from(new Set(rows.map((r) => r.site_id).filter(Boolean))) as string[];
    const [cRes, sRes] = await Promise.all([
      cIds.length
        ? supabase.from("customers").select("id, name").in("id", cIds)
        : Promise.resolve({ data: [] as any[] }),
      sIds.length
        ? supabase.from("sites").select("id, name").in("id", sIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setCustomers(Object.fromEntries((cRes.data as any[]).map((c) => [c.id, c.name])));
    setSites(Object.fromEntries((sRes.data as any[]).map((s) => [s.id, s.name])));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime: newly-filed archive docs (or converts that add a
    // report_pdf_path) should show up without switching tabs.
    const channel = supabase
      .channel("archived_documents_list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "archived_documents" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const docId = params.get("doc");
    if (docId && docs.length) {
      const d = docs.find((x) => x.id === docId);
      if (d) openViewDialog(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, params]);

  const openViewDialog = async (d: ArchivedDoc) => {
    setOpenDoc(d);
    setOpenUrls([]);
    setOpenFailed([]);
    setOpenPdfUrl(null);
    setOpenView(d.report_pdf_path ? "split" : "scan");
    setOpenLoading(true);
    if (d.report_pdf_path) {
      const pdf = await resolveSubmissionsSignedUrl(d.report_pdf_path);
      setOpenPdfUrl(pdf?.signedUrl || null);
    }
    const { urls, failed } = await resolveSubmissionsSignedUrls(d.file_paths);
    if (failed.length) {
      console.error(
        "[archive] unresolved page paths for doc",
        d.id,
        failed,
      );
    }
    setOpenUrls(urls.map((u) => u.signedUrl));
    setOpenFailed(failed);
    setOpenLoading(false);
  };

  const types = useMemo(() => {
    const t = new Set<string>();
    docs.forEach((d) => d.document_type && t.add(d.document_type));
    return Array.from(t).sort();
  }, [docs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (typeFilter !== "all" && d.document_type !== typeFilter) return false;
      if (customerFilter !== "all" && d.customer_id !== customerFilter) return false;
      if (!term) return true;
      const hay = [
        d.title,
        d.notes,
        d.template_name,
        d.document_type,
        d.customer_id ? customers[d.customer_id] : "",
        d.site_id ? sites[d.site_id] : "",
        d.document_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [docs, q, statusFilter, typeFilter, customerFilter, customers, sites]);

  // Queue of successful conversions awaiting defect review. FIFO: the
  // dialog shows one at a time so the office isn't overwhelmed by a bulk
  // "Convert all" run.
  const [defectReviewQueue, setDefectReviewQueue] = useState<
    {
      archivedId: string;
      templateName?: string;
      customerId: string | null;
      siteId: string | null;
      documentDate: string | null;
      proposals: ProposedDefect[];
    }[]
  >([]);

  // Reload the document list whenever the conversion queue reports a
  // successful conversion, so newly-generated report_pdf_path values
  // surface as "Electronic" chips without a manual refresh.
  useEffect(() => {
    let doneIds = new Set<string>();
    const unsub = archiveConversionQueue.subscribe(() => {
      const snap = archiveConversionQueue.snapshot();
      const nowDone = snap.filter((e) => e.state === "done").map((e) => e.id);
      const newlyDone = nowDone.filter((id) => !doneIds.has(id));
      if (newlyDone.length > 0) {
        doneIds = new Set(nowDone);
        // Capture any pending defect proposals BEFORE we clear the entry,
        // and enqueue them for office review.
        const pending = newlyDone
          .map((id) => archiveConversionQueue.getEntry(id))
          .filter((e): e is NonNullable<typeof e> => !!e && !!e.proposedDefects?.length)
          .map((e) => ({
            archivedId: e.id,
            templateName: e.templateName,
            customerId: e.customerId ?? null,
            siteId: e.siteId ?? null,
            documentDate: e.documentDate ?? null,
            proposals: e.proposedDefects!,
          }));
        if (pending.length > 0) {
          setDefectReviewQueue((prev) => [...prev, ...pending]);
        }
        load();
        for (const id of newlyDone) archiveConversionQueue.clear(id);
      }
    });
    return unsub;
  }, []);

  const handleConvert = (d: ArchivedDoc) => {
    archiveConversionQueue.enqueue([d.id]);
  };

  const convertibleIds = useMemo(
    () =>
      filtered
        .filter((d) => !d.report_pdf_path && d.file_paths?.length > 0)
        .map((d) => d.id),
    [filtered],
  );
  const [confirmBulk, setConfirmBulk] = useState(false);

  const summary = useArchiveConversionSummary();

  // Prune selection to only ids currently in view.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((d) => d.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  const selectedDocs = useMemo(
    () => filtered.filter((d) => selectedIds.has(d.id)),
    [filtered, selectedIds],
  );
  const selectedConvertible = selectedDocs.filter(
    (d) => !d.report_pdf_path && d.file_paths?.length > 0,
  );
  const selectedInFlight = selectedDocs.filter((d) => {
    const entry = archiveConversionQueue.getEntry(d.id);
    return entry?.state === "queued" || entry?.state === "converting";
  });

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
      if (on) filtered.forEach((d) => next.add(d.id));
      else filtered.forEach((d) => next.delete(d.id));
      return next;
    });
  };

  const runBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        try {
          await deleteArchivedDocument(id);
        } catch (e) {
          console.error("[archive bulk delete] failed for", id, e);
        }
      }
      toast({
        title: `Deleted ${ids.length} document${ids.length === 1 ? "" : "s"}`,
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

  const runBulkConvert = () => {
    if (selectedConvertible.length === 0) return;
    archiveConversionQueue.enqueue(selectedConvertible.map((d) => d.id));
    toast({
      title: `Queued ${selectedConvertible.length} conversion${selectedConvertible.length === 1 ? "" : "s"}`,
      description: "Running 2 at a time in the background.",
    });
    setSelectedIds(new Set());
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setBusyId(id);
    try {
      await deleteArchivedDocument(id);
      toast({ title: "Archived document deleted" });
      setConfirmDelete(null);
      if (openDoc?.id === id) setOpenDoc(null);
      await load();
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    const denied = (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Only administrators can view the archive library.
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
              <Archive className="h-6 w-6" /> Archive library
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Electronic copies of historic paper reports. Digitised without
              creating jobs or planner entries.
            </p>
          </div>
          {!embedded && (
            <Button onClick={() => setScanOpen(true)}>
              <ScanLine className="mr-1.5 h-4 w-4" /> Archive scan
            </Button>
          )}
        </div>

        {pendingReviewCount > 0 && (
          <Card className="p-3 flex items-center gap-3 border-amber-300 bg-amber-50 text-amber-900">
            <ClipboardCheck className="h-5 w-5 shrink-0" />
            <div className="text-sm flex-1">
              <div className="font-medium">
                {pendingReviewCount} sheet{pendingReviewCount === 1 ? "" : "s"} awaiting review
              </div>
              <div className="text-xs opacity-90">
                Scanned sheets only appear here once you confirm them in the Review tab.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="bg-white"
              onClick={() => (onGoReview ? onGoReview() : window.location.assign("/paper-scans?tab=review"))}
            >
              Open review queue
            </Button>
          </Card>
        )}




        <Card className="p-3 flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search customer, site, title, type…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as any)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="filed">Filed</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {(summary.queued > 0 || summary.converting > 0 || summary.failed > 0) && (
              <span className="text-xs text-muted-foreground">
                {summary.converting > 0 && (
                  <>
                    <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                    {summary.converting} converting
                  </>
                )}
                {summary.queued > 0 && (
                  <span className="ml-2">{summary.queued} queued</span>
                )}
                {summary.failed > 0 && (
                  <span className="ml-2 text-destructive">
                    {summary.failed} failed
                  </span>
                )}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmBulk(true)}
              disabled={convertibleIds.length === 0}
              title="Queue every scan-only row in the current filter for AI conversion"
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              Convert all scan-only ({convertibleIds.length})
            </Button>
          </div>
        </Card>

        <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Queue {convertibleIds.length} conversion
                {convertibleIds.length === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each scan-only document will be classified against a matching
                template, its handwritten answers extracted, and a filled
                electronic report generated. Conversions run 2 at a time in
                the background — you can keep browsing while they finish.
                Failed rows keep their Retry button.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  archiveConversionQueue.enqueue(convertibleIds);
                  setConfirmBulk(false);
                  toast({
                    title: `Queued ${convertibleIds.length} conversion${convertibleIds.length === 1 ? "" : "s"}`,
                    description: "Running 2 at a time in the background.",
                  });
                }}
              >
                Queue conversions
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <Card>
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No archived documents yet. Use "Archive scan" to digitise a stack.
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
                  <TableHead>Customer / Site</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const canConvert = !d.report_pdf_path && d.file_paths?.length > 0;
                  return (
                    <TableRow
                      key={d.id}
                      data-state={selectedIds.has(d.id) ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          aria-label={`Select document ${d.id}`}
                          checked={selectedIds.has(d.id)}
                          onCheckedChange={(v) => toggleId(d.id, v === true)}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>
                          {d.customer_id
                            ? customers[d.customer_id] || "—"
                            : (
                              <span className="text-muted-foreground italic">
                                Unmatched
                              </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {d.site_id ? sites[d.site_id] || "" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.document_type || d.template_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.document_date ? (
                          formatDate(d.document_date)
                        ) : (
                          <span
                            className="text-muted-foreground"
                            title="Document date not detected on the sheet — showing when it was scanned."
                          >
                            {formatDate(d.created_at)}{" "}
                            <span className="text-[10px] italic">(scanned)</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.report_pdf_path ? (
                          <Badge variant="secondary" className="gap-1">
                            <FileText className="h-3 w-3" /> Electronic
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Images className="h-3 w-3" /> Scan only
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const sends = (d.header_data?._email_sends as EmailSend[] | undefined) || [];
                          const last = sends[sends.length - 1];
                          if (last?.sent_at) {
                            return (
                              <Badge
                                variant="secondary"
                                className="gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                                title={`Sent to ${last.recipient || "customer"} on ${formatDate(last.sent_at)}`}
                              >
                                <CheckCircle2 className="h-3 w-3" /> Sent {formatDate(last.sent_at)}
                              </Badge>
                            );
                          }
                          return (
                            <Badge variant={d.status === "unmatched" ? "outline" : "secondary"}>
                              {d.status}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canConvert && (
                            <ConvertCell doc={d} onConvert={handleConvert} />
                          )}
                          {d.report_pdf_path && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => setSendDoc(d)}
                              title="Email report to customer"
                            >
                              <Send className="h-3.5 w-3.5 mr-1" /> Send
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openViewDialog(d)}
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(d)}
                            disabled={busyId === d.id}
                            title="Delete archived document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
          {selectedConvertible.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={runBulkConvert}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Convert ({selectedConvertible.length})
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

      <ArchiveScanDialog open={scanOpen} onOpenChange={setScanOpen} />

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} archived document{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected archive rows, their stored pages and
              any generated electronic reports.
              {selectedInFlight.length > 0 && (
                <>
                  {" "}
                  <span className="text-destructive font-medium">
                    {selectedInFlight.length} of these are still being converted —
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

      <Dialog
        open={!!openDoc}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDoc(null);
            setOpenUrls([]);
            setOpenFailed([]);
            setOpenPdfUrl(null);
            if (params.get("doc")) {
              params.delete("doc");
              setParams(params, { replace: true });
            }
          }
        }}
      >
        <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {openDoc?.title || openDoc?.document_type || "Archived document"}
            </DialogTitle>
          </DialogHeader>
          {openDoc && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {openDoc.customer_id ? customers[openDoc.customer_id] : "Unmatched"}
                {openDoc.site_id ? ` · ${sites[openDoc.site_id]}` : ""}
                {openDoc.document_date ? ` · ${openDoc.document_date}` : ""}
              </div>
              {openDoc.notes && (
                <p className="text-sm whitespace-pre-line">{openDoc.notes}</p>
              )}

              {openDoc.report_pdf_path && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                    <Button
                      size="sm"
                      variant={openView === "split" ? "default" : "ghost"}
                      className="h-7 px-2"
                      onClick={() => setOpenView("split")}
                    >
                      <Images className="h-3.5 w-3.5 mr-1" />
                      <FileText className="h-3.5 w-3.5 mr-1" /> Side by side
                    </Button>
                    <Button
                      size="sm"
                      variant={openView === "pdf" ? "default" : "ghost"}
                      className="h-7 px-2"
                      onClick={() => setOpenView("pdf")}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" /> Electronic report
                    </Button>
                    <Button
                      size="sm"
                      variant={openView === "scan" ? "default" : "ghost"}
                      className="h-7 px-2"
                      onClick={() => setOpenView("scan")}
                    >
                      <Images className="h-3.5 w-3.5 mr-1" /> Original scan
                    </Button>
                  </div>
                  {openPdfUrl && openView !== "scan" && (
                    <a
                      href={openPdfUrl}
                      download
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Download PDF
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 gap-1"
                    onClick={() => openDoc && setSendDoc(openDoc)}
                  >
                    <Send className="h-3.5 w-3.5" /> Send to customer
                  </Button>
                </div>
              )}

              {openLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
                  Loading…
                </div>
              )}

              {!openLoading && openView === "split" && openDoc.report_pdf_path && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border rounded-md bg-muted/20 flex flex-col min-h-0">
                    <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium flex items-center gap-1.5">
                      <Images className="h-3.5 w-3.5" /> Original scan
                    </div>
                    <div className="p-2 space-y-2 max-h-[75vh] overflow-y-auto">
                      {openUrls.length === 0 ? (
                        <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs p-3 flex gap-2">
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>Scan pages unavailable.</div>
                        </div>
                      ) : (
                        openUrls.map((u, i) => (
                          <img
                            key={i}
                            src={u}
                            alt={`Page ${i + 1}`}
                            className="w-full rounded border bg-white"
                            loading="lazy"
                          />
                        ))
                      )}
                    </div>
                  </div>
                  <div className="border rounded-md bg-muted/20 flex flex-col min-h-0">
                    <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Electronic report
                    </div>
                    <iframe
                      src={openPdfUrl || ""}
                      title="Electronic report"
                      className="w-full h-[75vh] bg-white rounded-b-md"
                    />
                  </div>
                </div>
              )}

              {!openLoading && openView === "pdf" && openPdfUrl && (
                <iframe
                  src={openPdfUrl}
                  title="Electronic report"
                  className="w-full h-[70vh] rounded border bg-white"
                />
              )}

              {!openLoading && openView === "scan" && (
                <div className="space-y-2">
                  {openUrls.length === 0 && (
                    <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3 flex gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium">Pages unavailable</div>
                        <div className="text-xs mt-1">
                          {openDoc.file_paths?.length
                            ? `Couldn't load ${openFailed.length} page${openFailed.length === 1 ? "" : "s"} from storage. The file may have been moved or deleted.`
                            : "This archived document has no page images attached."}
                        </div>
                      </div>
                    </div>
                  )}
                  {openUrls.map((u, i) => (
                    <img
                      key={i}
                      src={u}
                      alt={`Page ${i + 1}`}
                      className="w-full rounded border"
                    />
                  ))}
                  {openFailed.length > 0 && openUrls.length > 0 && (
                    <p className="text-xs text-amber-700">
                      {openFailed.length} page
                      {openFailed.length === 1 ? "" : "s"} could not be loaded.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete archived document?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the archived record and its stored pages
              {confirmDelete?.report_pdf_path ? " and electronic report" : ""}.
              The original scan-batch files in your review queue are not
              affected. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProposedDefectsReviewDialog
        item={defectReviewQueue[0]}
        onClose={() => setDefectReviewQueue((prev) => prev.slice(1))}
      />

      {sendDoc && (
        <SendArchiveDialog
          archivedId={sendDoc.id}
          open={!!sendDoc}
          onOpenChange={(o) => !o && setSendDoc(null)}
        />
      )}
    </>
  );

  return embedded ? body : <AppLayout>{body}</AppLayout>;
}


/**
 * Per-row convert cell — subscribes to the shared conversion queue so its
 * chip updates whether the enqueue was triggered from this button, the
 * bulk action, or a background refresh-resume.
 */
function ConvertCell({
  doc,
  onConvert,
}: {
  doc: ArchivedDoc;
  onConvert: (d: ArchivedDoc) => void;
}) {
  const entry = useArchiveConversionEntry(doc.id);
  if (entry?.state === "queued") {
    return (
      <Badge variant="outline" className="gap-1 h-7 px-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Queued
      </Badge>
    );
  }
  if (entry?.state === "converting") {
    return (
      <Badge variant="secondary" className="gap-1 h-7 px-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Converting…
      </Badge>
    );
  }
  if (entry?.state === "failed") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => onConvert(doc)}
        title={entry.reason || "Conversion failed"}
        className="text-destructive border-destructive/40 hover:text-destructive"
      >
        <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Retry
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onConvert(doc)}
      title="Run AI extraction and generate a filled electronic report"
    >
      <Wand2 className="mr-1 h-3.5 w-3.5" /> Convert
    </Button>
  );
}

/**
 * Post-convert defect review — surfaces AI-proposed defects extracted
 * during archive conversion. Defects are NEVER auto-created; the office
 * ticks/unticks and confirms. Skipping just discards the proposals for
 * this document (they can be regenerated by re-running Convert).
 */
function ProposedDefectsReviewDialog({
  item,
  onClose,
}: {
  item:
    | {
        archivedId: string;
        templateName?: string;
        customerId: string | null;
        siteId: string | null;
        documentDate: string | null;
        proposals: ProposedDefect[];
      }
    | undefined;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<
    Record<string, Partial<ProposedDefect>>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const s: Record<string, boolean> = {};
    for (const p of item.proposals) s[p.key] = true;
    setSelection(s);
    setOverrides({});
  }, [item?.archivedId]);

  if (!item) return null;

  const confirm = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const chosen = item.proposals
        .filter((p) => selection[p.key] !== false)
        .map((p) => ({ ...p, ...(overrides[p.key] || {}) }));
      const created = chosen.length
        ? await createArchiveSourcedDefects({
            userId: user.id,
            archivedId: item.archivedId,
            customerId: item.customerId,
            siteId: item.siteId,
            documentDate: item.documentDate,
            templateName: item.templateName || null,
            proposals: chosen,
          })
        : [];
      toast({
        title: created.length
          ? `${created.length} defect${created.length === 1 ? "" : "s"} logged`
          : "No defects logged",
      });
      onClose();
    } catch (e: any) {
      toast({
        title: "Defect logging failed",
        description: e?.message || "Try again from the archive.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review defects from converted document</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          The AI spotted possible defects on this historic report. Untick any
          that have since been resolved — the rest will be added to the
          Defects list, linked to the customer/site and this archived
          document. Nothing is linked to a job.
        </p>
        <ProposedDefectsSection
          proposals={item.proposals}
          selection={selection}
          onSelectionChange={setSelection}
          overrides={overrides}
          onOverridesChange={setOverrides}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Skip
          </Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? "Saving…" : "Log selected defects"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

