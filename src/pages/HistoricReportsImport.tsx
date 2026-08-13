/**
 * Bulk historic-reports import.
 *
 * Drag-and-drop PDF/DOCX/images (dozens–hundreds). Per file we call the
 * parse-historic-report edge function to extract customer / site / date /
 * report type via AI, then fuzzy-match against existing customers & sites
 * in this org. Office staff review the whole batch in a sortable table
 * (filter by matched customer for per-folder batching), fix any
 * mis-matches, then confirm. Confirmed rows are uploaded to
 * submissions/{orgId}/historic-reports/... and persisted in
 * public.historic_reports.
 *
 * Failures stay listed with a retry button — nothing imports silently
 * with the wrong site.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fuzzyFilter, fuzzyScore } from "@/lib/fuzzyMatch";
import { getCurrentOrgId, buildOrgPath } from "@/lib/orgStoragePath";
import { formatDate } from "@/lib/dateFormat";
import { UKDateInput } from "@/components/ui/uk-date-input";

type Customer = { id: string; name: string };
type Site = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  customer_id: string | null;
};
type TemplateOpt = { id: string; name: string; slug: string | null };

type Extracted = {
  customer_name?: string;
  site_address?: string;
  report_date?: string;
  report_type?: string;
  report_type_label?: string;
  confidence?: "high" | "medium" | "low";
  notes?: string;
};

type RowStatus =
  | "queued"
  | "parsing"
  | "ready"
  | "needs_matching"
  | "importing"
  | "imported"
  | "failed";

type Row = {
  key: string;
  file: File;
  status: RowStatus;
  error?: string;
  extracted?: Extracted;
  customerId?: string | null;
  siteId?: string | null;
  templateId?: string | null;
  reportDate?: string;
  reportType?: string;
  reportTypeLabel?: string;
  confidence?: string;
};

const ACCEPTED_EXT = [".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".webp"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = extOf(file.name);
  return (
    {
      ".pdf": "application/pdf",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    } as Record<string, string>
  )[ext] || "application/octet-stream";
}

export default function HistoricReportsImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [confirming, setConfirming] = useState(false);
  const [parseConcurrency] = useState(3);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: s }, { data: cs }, { data: t }] = await Promise.all([
        supabase.from("customers").select("id, name").order("name"),
        supabase
          .from("sites")
          .select("id, name, address, postcode")
          .order("name"),
        supabase.from("customer_sites").select("customer_id, site_id"),
        supabase
          .from("job_sheet_templates")
          .select("id, name, job_category")
          .eq("status", "published"),
      ]);
      const csMap = new Map<string, string>();
      for (const row of cs || []) csMap.set(row.site_id, row.customer_id);
      setCustomers(c || []);
      setSites(
        (s || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          address: r.address ?? null,
          postcode: r.postcode ?? null,
          customer_id: csMap.get(r.id) ?? null,
        })),
      );
      setTemplates(
        (t || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          slug: r.job_category ?? null,
        })),
      );
    })();
  }, []);

  // ---------- Drag / drop ----------
  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) =>
      ACCEPTED_EXT.includes(extOf(f.name)),
    );
    if (arr.length === 0) {
      toast({
        title: "No supported files",
        description: `Accepted types: ${ACCEPTED_EXT.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    setRows((prev) => [
      ...prev,
      ...arr.map((f, i) => ({
        key: `${Date.now()}-${prev.length + i}-${f.name}`,
        file: f,
        status: "queued" as RowStatus,
      })),
    ]);
  };

  // Kick off parsing whenever new queued rows appear.
  useEffect(() => {
    const queued = rows.filter((r) => r.status === "queued");
    if (queued.length === 0) return;
    const running = rows.filter((r) => r.status === "parsing").length;
    const slots = Math.max(0, parseConcurrency - running);
    for (let i = 0; i < Math.min(slots, queued.length); i++) {
      parseRow(queued[i].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const setRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const parseRow = async (key: string) => {
    setRow(key, { status: "parsing", error: undefined });
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    try {
      const base64 = await fileToBase64(row.file);
      const { data, error } = await supabase.functions.invoke(
        "parse-historic-report",
        {
          body: {
            file_base64: base64,
            file_name: row.file.name,
            report_type_hints: templates.map((t) => t.name),
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const extracted: Extracted = (data as any)?.data || {};
      applyMatch(key, extracted);
    } catch (e: any) {
      setRow(key, {
        status: "failed",
        error: e?.message || "Extraction failed",
      });
    }
  };

  const applyMatch = (key: string, extracted: Extracted) => {
    // Fuzzy match customer
    let customerId: string | null = null;
    if (extracted.customer_name) {
      const ranked = customers
        .map((c) => ({
          c,
          score: fuzzyScore(extracted.customer_name!, c.name),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.score && ranked[0].score >= 200) {
        customerId = ranked[0].c.id;
      }
    }

    // Fuzzy match site (within matched customer if we have one)
    let siteId: string | null = null;
    if (extracted.site_address) {
      const pool = customerId
        ? sites.filter((s) => s.customer_id === customerId)
        : sites;
      const ranked = pool
        .map((s) => ({
          s,
          score: fuzzyScore(
            extracted.site_address!,
            s.name,
            s.address,
            s.postcode,
          ),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.score && ranked[0].score >= 150) {
        siteId = ranked[0].s.id;
        if (!customerId && ranked[0].s.customer_id) {
          customerId = ranked[0].s.customer_id;
        }
      }
    }

    // Template guess: match report_type slug or report_type_label to template name/slug
    let templateId: string | null = null;
    const typeHint =
      extracted.report_type_label || extracted.report_type || "";
    if (typeHint) {
      const ranked = templates
        .map((t) => ({
          t,
          score: fuzzyScore(typeHint, t.name, t.slug),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.score && ranked[0].score >= 150) {
        templateId = ranked[0].t.id;
      }
    }

    const needs = !customerId || !siteId;
    setRow(key, {
      status: needs ? "needs_matching" : "ready",
      extracted,
      customerId,
      siteId,
      templateId,
      reportDate: extracted.report_date || "",
      reportType: extracted.report_type || "",
      reportTypeLabel: extracted.report_type_label || "",
      confidence: extracted.confidence,
    });
  };

  // ---------- Confirm import ----------
  const importable = rows.filter(
    (r) =>
      (r.status === "ready" || r.status === "needs_matching") &&
      r.customerId &&
      r.siteId,
  );

  const confirmAll = async () => {
    if (importable.length === 0) {
      toast({ title: "Nothing to import", description: "Every row needs a matched customer & site." });
      return;
    }
    setConfirming(true);
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      toast({ title: "No organisation", variant: "destructive" });
      setConfirming(false);
      return;
    }
    let ok = 0;
    for (const row of importable) {
      setRow(row.key, { status: "importing" });
      try {
        const ext = extOf(row.file.name);
        const path = buildOrgPath(
          orgId,
          `historic-reports/${row.siteId}/${Date.now()}-${row.file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}${
            ext ? "" : ""
          }`,
        );
        const { error: upErr } = await supabase.storage
          .from("submissions")
          .upload(path, row.file, {
            contentType: mimeOf(row.file),
            upsert: false,
          });
        if (upErr) throw upErr;

        const { error: insErr } = await (supabase as any)
          .from("historic_reports")
          .insert({
            site_id: row.siteId,
            customer_id: row.customerId,
            template_id: row.templateId,
            report_date: row.reportDate || null,
            report_type: row.reportType || null,
            report_type_label: row.reportTypeLabel || null,
            original_filename: row.file.name,
            storage_path: path,
            file_size: row.file.size,
            mime_type: mimeOf(row.file),
            extracted_customer: row.extracted?.customer_name || null,
            extracted_site: row.extracted?.site_address || null,
            extracted_notes: row.extracted?.notes || null,
            match_confidence: row.confidence || null,
          });
        if (insErr) throw insErr;
        setRow(row.key, { status: "imported" });
        ok++;
      } catch (e: any) {
        setRow(row.key, {
          status: "failed",
          error: e?.message || "Import failed",
        });
      }
    }
    setConfirming(false);
    toast({
      title: `Imported ${ok} of ${importable.length}`,
      description: ok < importable.length ? "Some rows failed — retry them." : undefined,
    });
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const retryRow = (key: string) => {
    setRow(key, { status: "queued", error: undefined });
  };

  const clearImported = () => {
    setRows((prev) => prev.filter((r) => r.status !== "imported"));
  };

  // ---------- Filtering ----------
  const visibleRows = useMemo(() => {
    if (filterCustomer === "all") return rows;
    if (filterCustomer === "__unmatched__") {
      return rows.filter((r) => !r.customerId);
    }
    return rows.filter((r) => r.customerId === filterCustomer);
  }, [rows, filterCustomer]);

  const stats = useMemo(() => {
    const total = rows.length;
    const parsing = rows.filter((r) => r.status === "parsing" || r.status === "queued").length;
    const ready = rows.filter((r) => r.status === "ready").length;
    const needs = rows.filter((r) => r.status === "needs_matching").length;
    const imported = rows.filter((r) => r.status === "imported").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return { total, parsing, ready, needs, imported, failed };
  }, [rows]);

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings">
            <ArrowLeft className="h-4 w-4 mr-1" /> Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Import historic reports</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Drop years of legacy PDFs, Word docs, and scans here — AI extracts the customer, site, date and
        report type from each file. Review the matches (batch a whole customer folder in one go), fix any
        mismatches, then confirm. Imported reports appear on the Site page and are used by the
        "Previous report" comparison when no in-Servexa response exists yet.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose or drop legacy report files"
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); }
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drop legacy reports here or{" "}
          <span className="text-primary font-medium">tap to choose</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Accepted: {ACCEPTED_EXT.join(", ")} — no limit per batch
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_EXT.join(",")}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Toolbar */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground">
            <Badge variant="outline">{stats.total} total</Badge>{" "}
            {stats.parsing > 0 && (
              <Badge variant="secondary" className="ml-1">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {stats.parsing} parsing
              </Badge>
            )}
            {stats.ready > 0 && (
              <Badge variant="secondary" className="ml-1 bg-emerald-100 text-emerald-800">
                {stats.ready} ready
              </Badge>
            )}
            {stats.needs > 0 && (
              <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">
                {stats.needs} need matching
              </Badge>
            )}
            {stats.imported > 0 && (
              <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
                {stats.imported} imported
              </Badge>
            )}
            {stats.failed > 0 && (
              <Badge variant="destructive" className="ml-1">
                {stats.failed} failed
              </Badge>
            )}
          </div>

          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="h-8 w-[240px]">
              <SelectValue placeholder="Filter by matched customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              <SelectItem value="__unmatched__">Unmatched only</SelectItem>
              {customers
                .filter((c) => rows.some((r) => r.customerId === c.id))
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} (
                    {rows.filter((r) => r.customerId === c.id).length})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            {stats.imported > 0 && (
              <Button variant="ghost" size="sm" onClick={clearImported}>
                Clear imported
              </Button>
            )}
            <Button
              onClick={confirmAll}
              disabled={confirming || importable.length === 0}
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm &amp; import{" "}
                  {importable.length}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Review table */}
      {visibleRows.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[26%]">File</TableHead>
                <TableHead className="w-[18%]">Customer</TableHead>
                <TableHead className="w-[22%]">Site</TableHead>
                <TableHead className="w-[10%]">Date</TableHead>
                <TableHead className="w-[16%]">Report type</TableHead>
                <TableHead className="w-[8%] text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <ImportRow
                  key={row.key}
                  row={row}
                  customers={customers}
                  sites={sites}
                  templates={templates}
                  onChange={(patch) => setRow(row.key, patch)}
                  onRetry={() => retryRow(row.key)}
                  onRemove={() => removeRow(row.key)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ImportRow({
  row,
  customers,
  sites,
  templates,
  onChange,
  onRetry,
  onRemove,
}: {
  row: Row;
  customers: Customer[];
  sites: Site[];
  templates: TemplateOpt[];
  onChange: (patch: Partial<Row>) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const siteOptions = row.customerId
    ? sites.filter((s) => s.customer_id === row.customerId)
    : sites;

  return (
    <TableRow className={row.status === "failed" ? "bg-destructive/5" : undefined}>
      <TableCell>
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" title={row.file.name}>
              {row.file.name}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {(row.file.size / 1024).toFixed(0)} KB
              {row.confidence && (
                <>
                  {" · "}
                  <span
                    className={
                      row.confidence === "high"
                        ? "text-emerald-700"
                        : row.confidence === "medium"
                        ? "text-amber-700"
                        : "text-muted-foreground"
                    }
                  >
                    AI: {row.confidence}
                  </span>
                </>
              )}
            </div>
            {row.error && (
              <div className="text-[11px] text-destructive mt-0.5 truncate" title={row.error}>
                {row.error}
              </div>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <PickerCombobox
          value={row.customerId || ""}
          options={customers.map((c) => ({ id: c.id, label: c.name }))}
          extractedHint={row.extracted?.customer_name}
          placeholder="Pick customer…"
          onChange={(id) => onChange({ customerId: id || null, siteId: null })}
        />
      </TableCell>

      <TableCell>
        <PickerCombobox
          value={row.siteId || ""}
          options={siteOptions.map((s) => ({
            id: s.id,
            label: s.name,
            sub: [s.address, s.postcode].filter(Boolean).join(", "),
          }))}
          extractedHint={row.extracted?.site_address}
          placeholder={row.customerId ? "Pick site…" : "Pick customer first"}
          onChange={(id) => onChange({ siteId: id || null })}
          disabled={!row.customerId}
        />
      </TableCell>

      <TableCell>
        <UKDateInput
          value={row.reportDate || ""}
          onChange={(e) => onChange({ reportDate: e.target.value })}
          className="h-8 text-xs"
        />
      </TableCell>

      <TableCell>
        <Select
          value={row.templateId || row.reportType || ""}
          onValueChange={(v) => {
            const t = templates.find((tp) => tp.id === v);
            if (t) {
              onChange({
                templateId: t.id,
                reportTypeLabel: t.name,
                reportType: t.slug || row.reportType,
              });
            } else {
              onChange({ templateId: null, reportType: v, reportTypeLabel: v });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Report type…">
              {row.reportTypeLabel || row.reportType || "—"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <StatusBadge status={row.status} />
          {row.status === "failed" && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRetry} title="Retry">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {row.status !== "importing" && row.status !== "imported" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  switch (status) {
    case "queued":
      return <Badge variant="outline" className="text-[10px]">Queued</Badge>;
    case "parsing":
      return (
        <Badge variant="secondary" className="text-[10px]">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Parsing
        </Badge>
      );
    case "ready":
      return <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-800">Ready</Badge>;
    case "needs_matching":
      return (
        <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">
          <AlertTriangle className="h-3 w-3 mr-1" /> Match
        </Badge>
      );
    case "importing":
      return (
        <Badge variant="secondary" className="text-[10px]">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Importing
        </Badge>
      );
    case "imported":
      return (
        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Imported
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="text-[10px]">
          <XCircle className="h-3 w-3 mr-1" /> Failed
        </Badge>
      );
  }
}

function PickerCombobox({
  value,
  options,
  extractedHint,
  placeholder,
  onChange,
  disabled,
}: {
  value: string;
  options: { id: string; label: string; sub?: string }[];
  extractedHint?: string;
  placeholder: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.id === value);
  const filtered = fuzzyFilter(options, query, (o) => [o.label, o.sub]).slice(0, 40);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`w-full text-left h-8 px-2 rounded border text-xs bg-background hover:bg-muted/40 disabled:opacity-50 truncate ${
            !selected ? "text-muted-foreground" : ""
          }`}
          title={selected?.label || extractedHint || placeholder}
        >
          {selected ? (
            <span className="text-foreground">{selected.label}</span>
          ) : extractedHint ? (
            <span className="italic">“{extractedHint}” — pick match…</span>
          ) : (
            placeholder
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">No matches</div>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted ${
                o.id === value ? "bg-muted/60" : ""
              }`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
                setQuery("");
              }}
            >
              <div className="font-medium truncate">{o.label}</div>
              {o.sub && (
                <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
