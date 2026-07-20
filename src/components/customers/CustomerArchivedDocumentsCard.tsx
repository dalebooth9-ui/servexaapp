import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ExternalLink,
  FileText,
  Loader2,
  AlertTriangle,
  Trash2,
  Images,
  Download,
} from "lucide-react";
import {
  resolveSubmissionsSignedUrls,
  resolveSubmissionsSignedUrl,
} from "@/lib/resolveSubmissionsPath";
import { deleteArchivedDocument } from "@/lib/deleteArchivedDocument";

type ArchivedDoc = {
  id: string;
  document_date: string | null;
  document_type: string | null;
  template_name: string | null;
  title: string | null;
  notes: string | null;
  file_paths: string[];
  report_pdf_path: string | null;
  page_count: number;
  status: "filed" | "unmatched";
  created_at: string;
  site_id: string | null;
};

interface Props {
  customerId: string;
}

export default function CustomerArchivedDocumentsCard({ customerId }: Props) {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";
  const [docs, setDocs] = useState<ArchivedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openDoc, setOpenDoc] = useState<ArchivedDoc | null>(null);
  const [openUrls, setOpenUrls] = useState<string[]>([]);
  const [openFailed, setOpenFailed] = useState<string[]>([]);
  const [openPdfUrl, setOpenPdfUrl] = useState<string | null>(null);
  const [openView, setOpenView] = useState<"pdf" | "scan">("pdf");
  const [openLoading, setOpenLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ArchivedDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("archived_documents")
      .select(
        "id, document_date, document_type, template_name, title, notes, file_paths, report_pdf_path, page_count, status, created_at, site_id",
      )
      .eq("customer_id", customerId)
      .order("document_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    setDocs(((data as any) || []) as ArchivedDoc[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin || !customerId) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, isAdmin]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter((d) =>
      [d.title, d.document_type, d.template_name, d.document_date, d.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [docs, q]);

  const openViewDialog = async (d: ArchivedDoc) => {
    setOpenDoc(d);
    setOpenUrls([]);
    setOpenFailed([]);
    setOpenPdfUrl(null);
    setOpenView(d.report_pdf_path ? "pdf" : "scan");
    setOpenLoading(true);
    if (d.report_pdf_path) {
      const pdf = await resolveSubmissionsSignedUrl(d.report_pdf_path);
      setOpenPdfUrl(pdf?.signedUrl || null);
    }
    const { urls, failed } = await resolveSubmissionsSignedUrls(d.file_paths);
    if (failed.length) {
      console.error("[archive-card] unresolved pages", d.id, failed);
    }
    setOpenUrls(urls.map((u) => u.signedUrl));
    setOpenFailed(failed);
    setOpenLoading(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteArchivedDocument(confirmDelete.id);
      toast({ title: "Archived document deleted" });
      if (openDoc?.id === confirmDelete.id) setOpenDoc(null);
      setConfirmDelete(null);
      await load();
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Archived documents
            <Badge variant="secondary" className="ml-1">
              {docs.length}
            </Badge>
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/archive?customer=${customerId}`}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              View all in archive
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
              Loading…
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No archived documents
            </p>
          ) : (
            <>
              {docs.length > 8 && (
                <Input
                  placeholder="Search archived documents…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="max-w-xs mb-3"
                />
              )}
              <div className="divide-y">
                {filtered.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 py-2 hover:bg-muted/40 rounded px-2 -mx-2"
                  >
                    <button
                      type="button"
                      onClick={() => openViewDialog(d)}
                      className="flex-1 flex items-start gap-3 text-left min-w-0"
                    >
                      {d.report_pdf_path ? (
                        <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      ) : (
                        <Images className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {d.title ||
                            d.document_type ||
                            d.template_name ||
                            "Archived document"}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                          {d.document_type && <span>{d.document_type}</span>}
                          {d.document_date && <span>· {d.document_date}</span>}
                          <span>
                            · {d.page_count} page{d.page_count === 1 ? "" : "s"}
                          </span>
                          {!d.report_pdf_path && (
                            <span className="text-amber-700">· scan only</span>
                          )}
                          {d.status === "unmatched" && (
                            <Badge variant="outline" className="ml-1">
                              unmatched
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(d)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    No matches
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!openDoc}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDoc(null);
            setOpenUrls([]);
            setOpenFailed([]);
            setOpenPdfUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {openDoc?.title || openDoc?.document_type || "Archived document"}
            </DialogTitle>
          </DialogHeader>
          {openDoc && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {openDoc.document_type || openDoc.template_name || ""}
                {openDoc.document_date ? ` · ${openDoc.document_date}` : ""}
                {` · ${openDoc.page_count} page${openDoc.page_count === 1 ? "" : "s"}`}
              </div>
              {openDoc.notes && (
                <p className="text-sm whitespace-pre-line">{openDoc.notes}</p>
              )}

              {openDoc.report_pdf_path && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
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
                  {openPdfUrl && openView === "pdf" && (
                    <a
                      href={openPdfUrl}
                      download
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Download PDF
                    </a>
                  )}
                </div>
              )}

              {openLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
                  Loading…
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
                            ? `Couldn't load ${openFailed.length} page${openFailed.length === 1 ? "" : "s"} from storage.`
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
                </div>
              )}

              <div className="pt-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/archive?doc=${openDoc.id}`}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open in archive
                  </Link>
                </Button>
              </div>
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
              Removes this archived record, its stored pages
              {confirmDelete?.report_pdf_path ? " and electronic report" : ""}.
              Original scan-batch files stay in the review queue. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
