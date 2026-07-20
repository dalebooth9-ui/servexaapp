import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Archive, ExternalLink, FileText, Loader2 } from "lucide-react";

type ArchivedDoc = {
  id: string;
  document_date: string | null;
  document_type: string | null;
  template_name: string | null;
  title: string | null;
  notes: string | null;
  file_paths: string[];
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
  const isAdmin = userRole === "admin";
  const [docs, setDocs] = useState<ArchivedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openDoc, setOpenDoc] = useState<ArchivedDoc | null>(null);
  const [openUrls, setOpenUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!isAdmin || !customerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("archived_documents")
        .select(
          "id, document_date, document_type, template_name, title, notes, file_paths, page_count, status, created_at, site_id",
        )
        .eq("customer_id", customerId)
        .order("document_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled) {
        setDocs(((data as any) || []) as ArchivedDoc[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  const openView = async (d: ArchivedDoc) => {
    setOpenDoc(d);
    const urls: string[] = [];
    for (const p of d.file_paths || []) {
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(p, 60 * 60);
      if (data?.signedUrl) urls.push(data.signedUrl);
    }
    setOpenUrls(urls);
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
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => openView(d)}
                    className="w-full flex items-start gap-3 py-2 text-left hover:bg-muted/40 rounded px-2 -mx-2"
                  >
                    <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
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
                        {d.status === "unmatched" && (
                          <Badge variant="outline" className="ml-1">
                            unmatched
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
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
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
              <div className="space-y-2">
                {openUrls.map((u, i) => (
                  <img
                    key={i}
                    src={u}
                    alt={`Page ${i + 1}`}
                    className="w-full rounded border"
                  />
                ))}
              </div>
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
    </div>
  );
}
