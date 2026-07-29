import { memo, useCallback, useEffect, useMemo, useRef, useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Camera, Loader2, Search, Trash2, Rows3, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

export type RepeatingColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "yn_na" | "dropdown" | "photo" | "photo_gallery";
  options?: string[];
};

type Row = Record<string, any>;

type Props = {
  columns: RepeatingColumn[];
  value: any;
  onChange: (value: string) => void;
  jobId?: string;
  userId?: string;
  fieldId?: string;
};

function parseRows(value: any): Row[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const WINDOW_THRESHOLD = 20;
const WINDOW_PAGE = 20;

export default function RepeatingTableField({ columns, value, onChange, jobId, userId, fieldId }: Props) {
  const rows = useMemo(() => parseRows(value), [value]);
  const containerRef = useRef<HTMLDivElement>(null);
  const backfilledRef = useRef(false);

  // Keep latest rows + onChange in refs so handlers can be stable (so memoized
  // rows don't re-render when an unrelated row changes).
  const rowsRef = useRef<Row[]>(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const commit = useCallback((next: Row[]) => {
    onChangeRef.current(JSON.stringify(next));
  }, []);

  // Backfill stable ids on legacy rows.
  useEffect(() => {
    if (backfilledRef.current) return;
    if (rows.length === 0) return;
    const missing = rows.some((r) => !r || !r.id);
    if (!missing) {
      backfilledRef.current = true;
      return;
    }
    const next = rows.map((r) => (r && r.id ? r : { ...r, id: genId() }));
    backfilledRef.current = true;
    commit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const updateCellById = useCallback((rowId: string, colId: string, v: any) => {
    const current = rowsRef.current;
    const next = current.map((r) => (r.id === rowId ? { ...r, [colId]: v } : r));
    commit(next);
  }, [commit]);

  const removeRowById = useCallback((rowId: string) => {
    commit(rowsRef.current.filter((r) => r.id !== rowId));
  }, [commit]);

  const addRow = useCallback(() => {
    const blank: Row = { id: genId() };
    columns.forEach((c) => {
      if (c.id !== "id") blank[c.id] = "";
    });
    commit([...rowsRef.current, blank]);
    // Scroll new row into view shortly after it mounts
    setTimeout(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-row-id="${blank.id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [columns, commit]);

  // --- Search / filter ---
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!trimmedQuery) return rows;
    return rows.filter((r) => {
      const unit = String(r?.unit_number || "").toLowerCase();
      if (unit.includes(trimmedQuery)) return true;
      // Also search across any text-ish cell for convenience
      return columns.some((c) => {
        if (c.id === "id") return false;
        const v = r?.[c.id];
        return typeof v === "string" && v.toLowerCase().includes(trimmedQuery);
      });
    });
  }, [rows, columns, trimmedQuery]);

  // --- Windowing for long lists ---
  const isWindowed = filteredRows.length > WINDOW_THRESHOLD;
  const [visibleCount, setVisibleCount] = useState(WINDOW_PAGE);
  useEffect(() => {
    // Reset window when filter changes or list shrinks below current window
    setVisibleCount(Math.min(WINDOW_PAGE, Math.max(filteredRows.length, WINDOW_PAGE)));
  }, [trimmedQuery, filteredRows.length]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isWindowed) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(filteredRows.length, c + WINDOW_PAGE));
      }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [isWindowed, filteredRows.length]);

  const visibleRows = isWindowed ? filteredRows.slice(0, visibleCount) : filteredRows;

  // Find original row index (used only for the row label).
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => { if (r?.id) m.set(r.id, i); });
    return m;
  }, [rows]);

  const isMobile = useIsMobile();
  const [bulkOpen, setBulkOpen] = useState(false);

  const bulkAddRows = useCallback((unitLabels: string[]) => {
    if (unitLabels.length === 0) return;
    const newRows: Row[] = unitLabels.map((label) => {
      const blank: Row = { id: genId(), unit_number: label };
      columns.forEach((c) => {
        if (c.id !== "id" && c.id !== "unit_number") blank[c.id] = "";
      });
      return blank;
    });
    commit([...rowsRef.current, ...newRows]);
  }, [columns, commit]);

  const hasUnitColumn = columns.some((c) => c.id === "unit_number");

  return (
    <div ref={containerRef} className="space-y-3 w-full">
      {rows.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${rows.length} rows by unit number…`}
            className="h-9 pl-7 text-sm"
          />
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No rows yet. Tap "Add Row" or "Bulk Add" to begin.</p>
      )}

      {trimmedQuery && filteredRows.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No rows match "{query}".</p>
      )}

      {!isMobile ? (
        <DesktopGrid
          rows={visibleRows}
          allRowsLength={rows.length}
          columns={columns}
          fieldId={fieldId}
          jobId={jobId}
          userId={userId}
          onUpdateCell={updateCellById}
          onRemove={removeRowById}
          onAddRow={addRow}
        />
      ) : (
        visibleRows.map((row) => {
          const rowId: string = row.id || `idx-${indexById.get(row.id) ?? 0}`;
          const rowIdx = indexById.get(row.id) ?? 0;
          return (
            <DwellingRow
              key={rowId}
              row={row}
              rowIndex={rowIdx}
              columns={columns}
              fieldId={fieldId}
              jobId={jobId}
              userId={userId}
              onUpdateCell={updateCellById}
              onRemove={removeRowById}
            />
          );
        })
      )}

      {isWindowed && visibleCount < filteredRows.length && (
        <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
          Loading more rows… ({visibleCount} of {filteredRows.length})
        </div>
      )}

      {/* Sticky footer add bar so engineers don't have to scroll to the bottom */}
      <div className="sticky bottom-0 z-10 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-t border-border flex gap-2">
        <Button
          type="button"
          onClick={addRow}
          className="flex-1 min-h-[44px] bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Row{rows.length > 0 ? ` (${rows.length})` : ""}
        </Button>
        {hasUnitColumn && (
          <BulkAddDialog
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            onAdd={bulkAddRows}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memoized row
// ---------------------------------------------------------------------------

type DwellingRowProps = {
  row: Row;
  rowIndex: number;
  columns: RepeatingColumn[];
  fieldId?: string;
  jobId?: string;
  userId?: string;
  onUpdateCell: (rowId: string, colId: string, v: any) => void;
  onRemove: (rowId: string) => void;
};

const DwellingRow = memo(function DwellingRow({
  row, rowIndex, columns, fieldId, jobId, userId, onUpdateCell, onRemove,
}: DwellingRowProps) {
  const rowId: string = row.id;
  const unitLabel: string = String(row.unit_number || "").trim();

  const scrollIntoView = (el: HTMLElement | null) => {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <div
      data-row-id={rowId}
      className="relative rounded-lg border border-border bg-muted/30 p-3 pr-9 space-y-3"
    >
      <button
        type="button"
        onClick={() => onRemove(rowId)}
        aria-label="Remove row"
        className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {unitLabel ? `Row ${rowIndex + 1} — ${unitLabel}` : `Row ${rowIndex + 1}`}
      </div>

      {columns.filter((c) => c.id !== "id").map((col) => {
        const val = row[col.id] ?? "";
        return (
          <div key={col.id} className="space-y-1">
            <Label className="text-xs text-foreground/80">{col.label}</Label>

            {col.type === "text" && (
              <Input
                value={val}
                onFocus={(e) => scrollIntoView(e.currentTarget)}
                onChange={(e) => onUpdateCell(rowId, col.id, e.target.value)}
                className="h-9 text-sm"
              />
            )}

            {col.type === "number" && (
              <Input
                type="number"
                inputMode="decimal"
                value={val}
                onFocus={(e) => scrollIntoView(e.currentTarget)}
                onChange={(e) => onUpdateCell(rowId, col.id, e.target.value)}
                className="h-9 text-sm"
              />
            )}

            {col.type === "dropdown" && (
              <Select
                value={val || ""}
                onValueChange={(v) => onUpdateCell(rowId, col.id, v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {(col.options || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {col.type === "yn_na" && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "Y", label: "Y", cls: "bg-green-600 hover:bg-green-700 text-white border-green-600" },
                  { v: "N", label: "N", cls: "bg-destructive hover:bg-destructive/90 text-white border-destructive" },
                  { v: "N/A", label: "N/A", cls: "bg-muted hover:bg-muted/80 text-muted-foreground border-border" },
                ].map((opt) => {
                  const active = val === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => onUpdateCell(rowId, col.id, active ? "" : opt.v)}
                      className={`min-h-[44px] rounded-md border text-sm font-semibold transition ${
                        active ? opt.cls : "bg-background hover:bg-muted text-foreground border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {col.type === "photo" && (
              <RowPhotoCell
                value={val}
                onChange={(v) => onUpdateCell(rowId, col.id, v)}
                fieldId={`${fieldId || "row"}-${rowId}-${col.id}`}
                groupLabel={unitLabel}
                jobId={jobId}
                userId={userId}
              />
            )}

            {col.type === "photo_gallery" && (
              <RowPhotoGalleryCell
                value={val}
                onChange={(v) => onUpdateCell(rowId, col.id, v)}
                fieldId={`${fieldId || "row"}-${rowId}-${col.id}`}
                groupLabel={unitLabel}
                jobId={jobId}
                userId={userId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}, (prev, next) => {
  // Re-render only when this row's own data, position, columns, or
  // identity-related props actually change. Handlers are stable (refs).
  return (
    prev.row === next.row &&
    prev.rowIndex === next.rowIndex &&
    prev.columns === next.columns &&
    prev.fieldId === next.fieldId &&
    prev.jobId === next.jobId &&
    prev.userId === next.userId &&
    prev.onUpdateCell === next.onUpdateCell &&
    prev.onRemove === next.onRemove
  );
});

function RowPhotoCell({ value, onChange, fieldId, groupLabel, jobId, userId }: { value: any; onChange: (v: any) => void; fieldId: string; groupLabel?: string; jobId?: string; userId?: string }) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      supabase.storage.from("submissions").createSignedUrl(value, 3600).then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
    } else {
      setSignedUrl(null);
    }
  }, [value]);

  const handleUpload = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${fieldId}-${Date.now()}.${ext}`;
    const path = jobId ? `${jobId}/template-photos/${fileName}` : `template-photos/${fileName}`;
    const { error } = await supabase.storage.from("submissions").upload(await buildOrgPathAsync(path), file, { upsert: true, contentType: file.type });
    if (error) {
      console.error("Upload error:", error);
    } else {
      onChange(path);
      if (jobId && userId) {
        const { data: signedData } = await supabase.storage
          .from("submissions")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signedData?.signedUrl) {
          const label = (groupLabel || "").trim().replace(/[\/\\]/g, "-");
          const displayName = label ? `${label} — ${fileName}` : fileName;
          await supabase.from("submissions").insert({
            job_id: jobId,
            engineer_id: userId,
            type: "photo",
            file_url: signedData.signedUrl,
            file_name: displayName,
          } as any);
        }
      }
    }
    setUploading(false);
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      {signedUrl ? (
        <div className="relative inline-block">
          <img src={signedUrl} alt="Captured" data-uploaded="true" className="max-w-[140px] max-h-[100px] rounded border object-cover" />
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
            onClick={() => { onChange(null); setSignedUrl(null); }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-9 text-xs"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          {uploading ? "Uploading..." : "Take Photo"}
        </Button>
      )}
    </div>
  );
}

type GalleryPhoto = {
  path: string;
  caption?: string;
  uploaded_at?: string;
};

function parseGallery(value: any): GalleryPhoto[] {
  if (Array.isArray(value)) return value.filter((p) => p && typeof p === "object" && p.path);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v.filter((p) => p && typeof p === "object" && p.path) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function RowPhotoGalleryCell({
  value, onChange, fieldId, groupLabel, jobId, userId,
}: {
  value: any;
  onChange: (v: any) => void;
  fieldId: string;
  groupLabel?: string;
  jobId?: string;
  userId?: string;
}) {
  const photos = parseGallery(value);
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = { ...signedUrls };
      const missing = photos.filter((p) => !next[p.path]);
      if (missing.length === 0) return;
      for (const p of missing) {
        const { data } = await supabase.storage.from("submissions").createSignedUrl(p.path, 3600);
        if (data?.signedUrl) next[p.path] = data.signedUrl;
      }
      if (!cancelled) setSignedUrls(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map((p) => p.path).join("|")]);

  const commit = (next: GalleryPhoto[]) => onChange(next);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const added: GalleryPhoto[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${fieldId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = jobId ? `${jobId}/template-photos/${fileName}` : `template-photos/${fileName}`;
      const { error } = await supabase.storage.from("submissions").upload(await buildOrgPathAsync(path), file, { upsert: true, contentType: file.type });
      if (error) {
        console.error("Upload error:", error);
        continue;
      }
      added.push({ path, caption: "", uploaded_at: new Date().toISOString() });

      if (jobId && userId) {
        const { data: signedData } = await supabase.storage
          .from("submissions")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signedData?.signedUrl) {
          const label = (groupLabel || "").trim().replace(/[\/\\]/g, "-");
          const displayName = label ? `${label} — ${fileName}` : fileName;
          await supabase.from("submissions").insert({
            job_id: jobId,
            engineer_id: userId,
            type: "photo",
            file_url: signedData.signedUrl,
            file_name: displayName,
          } as any);
        }
      }
    }
    if (added.length > 0) commit([...photos, ...added]);
    setUploading(false);
  };

  const removeAt = (idx: number) => {
    commit(photos.filter((_, i) => i !== idx));
  };

  const setCaption = (idx: number, caption: string) => {
    commit(photos.map((p, i) => (i === idx ? { ...p, caption: caption.slice(0, 150) } : p)));
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => { handleUpload(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        {uploading ? "Uploading..." : "Add Photo"}
      </Button>

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, idx) => (
            <div key={p.path} className="shrink-0 w-[88px] space-y-1">
              <div className="relative">
                {signedUrls[p.path] ? (
                  <img
                    src={signedUrls[p.path]}
                    alt={p.caption || `Photo ${idx + 1}`}
                    data-uploaded="true"
                    className="w-[88px] h-[66px] rounded border object-cover bg-muted"
                  />
                ) : (
                  <div className="w-[88px] h-[66px] rounded border bg-muted flex items-center justify-center">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground inline-flex items-center justify-center shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Input
                value={p.caption || ""}
                onChange={(e) => setCaption(idx, e.target.value)}
                placeholder="Caption (optional)"
                maxLength={150}
                title={`${(p.caption || "").length}/150`}
                className="h-6 text-[10px] px-1.5"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop grid (spreadsheet-style, editable inline)
// ---------------------------------------------------------------------------

type DesktopGridProps = {
  rows: Row[];
  allRowsLength: number;
  columns: RepeatingColumn[];
  fieldId?: string;
  jobId?: string;
  userId?: string;
  onUpdateCell: (rowId: string, colId: string, v: any) => void;
  onRemove: (rowId: string) => void;
  onAddRow: () => void;
};

function DesktopGrid({
  rows, columns, fieldId, jobId, userId, onUpdateCell, onRemove, onAddRow,
}: DesktopGridProps) {
  const dataCols = useMemo(() => columns.filter((c) => c.id !== "id"), [columns]);
  const cellRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const setCellRef = (rowId: string, colId: string) => (el: HTMLElement | null) => {
    cellRefs.current.set(`${rowId}::${colId}`, el);
  };

  const focusCell = (rowId: string, colId: string) => {
    const el = cellRefs.current.get(`${rowId}::${colId}`);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select?.();
    }
  };

  const handleKeyNav = (rowIdx: number, colIdx: number, rowId: string) => (e: KeyboardEvent) => {
    const isLastCol = colIdx === dataCols.length - 1;
    const isLastRow = rowIdx === rows.length - 1;
    const advance = () => {
      if (isLastCol) {
        if (isLastRow) {
          e.preventDefault();
          onAddRow();
          // Focus will be handled after the new row mounts — approximate.
          setTimeout(() => {
            const keys = Array.from(cellRefs.current.keys());
            const first = keys.find((k) => k.endsWith(`::${dataCols[0].id}`) && !k.startsWith(`${rowId}::`));
            // Focus the last newly appended row's first cell:
            const lastNew = [...cellRefs.current.entries()].reverse().find(([k]) => k.endsWith(`::${dataCols[0].id}`));
            lastNew?.[1]?.focus();
          }, 80);
        } else {
          e.preventDefault();
          focusCell(rows[rowIdx + 1].id, dataCols[0].id);
        }
      } else {
        e.preventDefault();
        focusCell(rowId, dataCols[colIdx + 1].id);
      }
    };
    if (e.key === "Enter") advance();
    else if (e.key === "Tab" && !e.shiftKey && isLastCol && isLastRow) advance();
  };

  const colWidth = (col: RepeatingColumn): string => {
    switch (col.type) {
      case "number": return "w-24";
      case "yn_na": return "w-32";
      case "dropdown": return "w-40";
      case "photo": return "w-20";
      case "photo_gallery": return "w-24";
      default: return "min-w-[180px]";
    }
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/60 sticky top-0">
          <tr>
            <th className="w-10 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">#</th>
            {dataCols.map((col) => (
              <th
                key={col.id}
                className={`px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border ${colWidth(col)}`}
              >
                {col.label}
              </th>
            ))}
            <th className="w-10 border-b border-border" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={row.id} data-row-id={row.id} className="border-b border-border last:border-0 hover:bg-muted/20">
              <td className="px-2 py-1 text-xs text-muted-foreground align-middle">{rowIdx + 1}</td>
              {dataCols.map((col, colIdx) => {
                const val = row[col.id] ?? "";
                const commonInputProps = {
                  ref: setCellRef(row.id, col.id) as any,
                  onKeyDown: handleKeyNav(rowIdx, colIdx, row.id),
                };
                return (
                  <td key={col.id} className="px-1.5 py-1 align-middle">
                    {(col.type === "text") && (
                      <Input
                        {...commonInputProps}
                        value={val}
                        onChange={(e) => onUpdateCell(row.id, col.id, e.target.value)}
                        dictation={/comment|note|remark|observation|descri|defect|action|finding/i.test(col.label || "")}
                        className="h-8 text-sm"
                      />
                    )}
                    {col.type === "number" && (
                      <Input
                        {...commonInputProps}
                        type="number"
                        inputMode="decimal"
                        value={val}
                        onChange={(e) => onUpdateCell(row.id, col.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                    )}
                    {col.type === "dropdown" && (
                      <Select
                        value={val || ""}
                        onValueChange={(v) => onUpdateCell(row.id, col.id, v)}
                      >
                        <SelectTrigger
                          ref={setCellRef(row.id, col.id) as any}
                          onKeyDown={handleKeyNav(rowIdx, colIdx, row.id)}
                          className="h-8 text-sm"
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {(col.options || []).map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {col.type === "yn_na" && (
                      <Select
                        value={val || ""}
                        onValueChange={(v) => onUpdateCell(row.id, col.id, v)}
                      >
                        <SelectTrigger
                          ref={setCellRef(row.id, col.id) as any}
                          onKeyDown={handleKeyNav(rowIdx, colIdx, row.id)}
                          className="h-8 text-sm"
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Y">Y</SelectItem>
                          <SelectItem value="N">N</SelectItem>
                          <SelectItem value="N/A">N/A</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {(col.type === "photo" || col.type === "photo_gallery") && (
                      <PhotoCellPopover
                        colType={col.type}
                        value={val}
                        onChange={(v) => onUpdateCell(row.id, col.id, v)}
                        fieldId={`${fieldId || "row"}-${row.id}-${col.id}`}
                        groupLabel={String(row.unit_number || "").trim()}
                        jobId={jobId}
                        userId={userId}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-1 py-1 align-middle text-right">
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  aria-label="Remove row"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Compact photo cell for grid: shows icon or thumbnail; opens popover for full picker.
function PhotoCellPopover({
  colType, value, onChange, fieldId, groupLabel, jobId, userId,
}: {
  colType: "photo" | "photo_gallery";
  value: any;
  onChange: (v: any) => void;
  fieldId: string;
  groupLabel?: string;
  jobId?: string;
  userId?: string;
}) {
  const hasValue = colType === "photo"
    ? !!value
    : parseGallery(value).length > 0;
  const count = colType === "photo_gallery" ? parseGallery(value).length : (value ? 1 : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={hasValue ? "secondary" : "outline"}
          size="sm"
          className="h-8 w-full px-2 gap-1 text-xs"
        >
          {colType === "photo_gallery" ? <ImageIcon className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          {count > 0 ? count : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3">
        {colType === "photo" ? (
          <RowPhotoCell
            value={value}
            onChange={onChange}
            fieldId={fieldId}
            groupLabel={groupLabel}
            jobId={jobId}
            userId={userId}
          />
        ) : (
          <RowPhotoGalleryCell
            value={value}
            onChange={onChange}
            fieldId={fieldId}
            groupLabel={groupLabel}
            jobId={jobId}
            userId={userId}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Bulk Add dialog
// ---------------------------------------------------------------------------

export type BulkParseResult =
  | { ok: true; labels: string[]; prefix: string; start: number; end: number }
  | { ok: false; reason: string };

/**
 * Forgiving bulk-range parser. Accepts any of:
 *   "1 to 12", "1-12", "1 – 12", "1 through 12"
 *   "Flat 1 to 12", "Flat 1 - Flat 12", "flat 1 to flat 12"
 *   "Unit 3 to Unit 8", "Room 1-4"
 * Case-insensitive, whitespace tolerant. If either side supplies a word prefix
 * (e.g. "Flat"), that prefix is applied to every generated label. If neither
 * side supplies one, generated labels are bare numbers (caller can default).
 */
export function parseBulkRange(input: string): BulkParseResult {
  const trimmed = (input || "").trim();
  if (!trimmed) return { ok: false, reason: "Enter a range like 'Flat 1 to 12'." };

  // Grab "[prefix?] number [separator] [prefix?] number"
  const re = /^\s*([A-Za-z][A-Za-z .'&-]*?)?\s*(\d+)\s*(?:to|through|thru|-|–|—|…)\s*([A-Za-z][A-Za-z .'&-]*?)?\s*(\d+)\s*$/i;
  const m = trimmed.match(re);
  if (!m) {
    return {
      ok: false,
      reason: "Couldn't read the range. Try 'Flat 1 to 12', '1-12', or 'Unit 3 to Unit 8'.",
    };
  }

  const rawPrefixA = (m[1] || "").trim();
  const rawPrefixB = (m[3] || "").trim();
  const start = parseInt(m[2], 10);
  const end = parseInt(m[4], 10);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { ok: false, reason: "Numbers on both sides of the range are required." };
  }
  if (end < start) {
    return { ok: false, reason: `End (${end}) must be greater than or equal to start (${start}).` };
  }
  if (end - start + 1 > 500) {
    return { ok: false, reason: "Too many rows (max 500)." };
  }

  // Prefer whichever side supplied a word prefix. If both, they should match
  // (case-insensitive) — otherwise fall back to the leading one.
  let prefix = rawPrefixA || rawPrefixB;
  if (rawPrefixA && rawPrefixB && rawPrefixA.toLowerCase() !== rawPrefixB.toLowerCase()) {
    prefix = rawPrefixA;
  }
  // Normalise casing: Title Case first word ("flat" → "Flat").
  if (prefix) {
    prefix = prefix.replace(/\s+/g, " ").trim();
    prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  const labels: string[] = [];
  for (let i = start; i <= end; i++) {
    labels.push(prefix ? `${prefix} ${i}` : String(i));
  }
  return { ok: true, labels, prefix, start, end };
}


function BulkAddDialog({
  open, onOpenChange, onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (labels: string[]) => void;
}) {
  const [text, setText] = useState("Flat 1 to 12");
  const { toast } = useToast();
  const parsed = useMemo(() => parseBulkRange(text), [text]);
  const labels = parsed.ok ? parsed.labels : [];
  const count = labels.length;

  const handleAdd = () => {
    if (parsed.ok !== true) {
      toast({
        title: "Couldn't parse range",
        description: parsed.reason,
        variant: "destructive",
      });
      return;
    }
    onAdd(labels);
    onOpenChange(false);
    toast({ title: `Added ${count} rows` });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] gap-2"
        >
          <Rows3 className="h-4 w-4" />
          Bulk Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk add rows</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Range</Label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Flat 1 to 12"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Accepts "Flat 1 to 12", "1-12", "Flat 1 - Flat 12", "Unit 3 to Unit 8".
            </p>
          </div>
          <div
            className={`rounded-md border p-2 text-xs max-h-32 overflow-y-auto ${
              parsed.ok
                ? "border-border bg-muted/30"
                : "border-destructive/40 bg-destructive/5"
            }`}
            aria-live="polite"
          >
            {parsed.ok !== true ? (
              <span className="text-destructive">{parsed.reason}</span>

            ) : (
              <>
                <div className="font-medium mb-1">
                  Will create {count} rows: {labels[0]} … {labels[count - 1]}
                </div>
                <div className="text-muted-foreground">
                  {labels.slice(0, 6).join(", ")}
                  {count > 6 ? `, … ${labels[count - 1]}` : ""}
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!parsed.ok}>
            Add {count || ""} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

