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
import { Archive, ScanLine, Loader2, AlertTriangle } from "lucide-react";
import ArchiveScanDialog from "@/components/paper-scan/ArchiveScanDialog";
import { useAuth } from "@/hooks/useAuth";
import { resolveSubmissionsSignedUrls } from "@/lib/resolveSubmissionsPath";

type ArchivedDoc = {
  id: string;
  customer_id: string | null;
  site_id: string | null;
  document_date: string | null;
  document_type: string | null;
  template_name: string | null;
  title: string | null;
  notes: string | null;
  file_paths: string[];
  page_count: number;
  status: "filed" | "unmatched";
  created_at: string;
};

export default function ArchivedDocuments() {
  const [params, setParams] = useSearchParams();
  const { userRole } = useAuth();
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
  const [openLoading, setOpenLoading] = useState(false);

  const isAdmin = userRole === "admin";

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("archived_documents")
      .select(
        "id, customer_id, site_id, document_date, document_type, template_name, title, notes, file_paths, page_count, status, created_at",
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
  }, []);

  useEffect(() => {
    const docId = params.get("doc");
    if (docId && docs.length) {
      const d = docs.find((x) => x.id === docId);
      if (d) openView(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, params]);

  const openView = async (d: ArchivedDoc) => {
    setOpenDoc(d);
    setOpenUrls([]);
    setOpenFailed([]);
    setOpenLoading(true);
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

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Only administrators can view the archive library.
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
              <Archive className="h-6 w-6" /> Archive library
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Electronic copies of historic paper reports. Digitised without
              creating jobs or planner entries.
            </p>
          </div>
          <Button onClick={() => setScanOpen(true)}>
            <ScanLine className="mr-1.5 h-4 w-4" /> Archive scan
          </Button>
        </div>

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
        </Card>

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
                  <TableHead>Customer / Site</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
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
                      {d.document_date || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{d.page_count}</TableCell>
                    <TableCell>
                      <Badge
                        variant={d.status === "unmatched" ? "outline" : "secondary"}
                      >
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openView(d)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <ArchiveScanDialog open={scanOpen} onOpenChange={setScanOpen} />

      <Dialog
        open={!!openDoc}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDoc(null);
            setOpenUrls([]);
            setOpenFailed([]);
            if (params.get("doc")) {
              params.delete("doc");
              setParams(params, { replace: true });
            }
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
                {openDoc.customer_id ? customers[openDoc.customer_id] : "Unmatched"}
                {openDoc.site_id ? ` · ${sites[openDoc.site_id]}` : ""}
                {openDoc.document_date ? ` · ${openDoc.document_date}` : ""}
              </div>
              {openDoc.notes && (
                <p className="text-sm whitespace-pre-line">{openDoc.notes}</p>
              )}
              <div className="space-y-2">
                {openLoading && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
                    Loading pages…
                  </div>
                )}
                {!openLoading && openUrls.length === 0 && (
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
                {!openLoading && openFailed.length > 0 && openUrls.length > 0 && (
                  <p className="text-xs text-amber-700">
                    {openFailed.length} page
                    {openFailed.length === 1 ? "" : "s"} could not be loaded.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
