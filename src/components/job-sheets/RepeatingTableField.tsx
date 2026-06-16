import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

export default function RepeatingTableField({ columns, value, onChange, jobId, userId, fieldId }: Props) {
  const rows = parseRows(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const backfilledRef = useRef(false);

  const commit = (next: Row[]) => onChange(JSON.stringify(next));

  // Backfill stable ids on any existing rows that don't have one. Runs once
  // per mount when rows are first loaded so legacy data (saved before stable
  // ids existed) gets a permanent id without disturbing user-entered values.
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

  const updateCell = (rowIdx: number, colId: string, v: any) => {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colId]: v } : r));
    commit(next);
  };

  const addRow = () => {
    const blank: Row = { id: genId() };
    columns.forEach((c) => {
      if (c.id !== "id") blank[c.id] = "";
    });
    commit([...rows, blank]);
  };

  const removeRow = (idx: number) => {
    commit(rows.filter((_, i) => i !== idx));
  };

  const scrollIntoView = (el: HTMLElement | null) => {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <div ref={containerRef} className="space-y-3 w-full">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No rows yet. Tap "Add Row" to begin.</p>
      )}

      {rows.map((row, rowIdx) => {
        const rowId: string = row.id || `idx-${rowIdx}`;
        const unitLabel: string = String(row.unit_number || "").trim();
        return (
        <div
          key={rowId}
          className="relative rounded-lg border border-border bg-muted/30 p-3 pr-9 space-y-3"
        >
          <button
            type="button"
            onClick={() => removeRow(rowIdx)}
            aria-label="Remove row"
            className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {unitLabel ? `Row ${rowIdx + 1} — ${unitLabel}` : `Row ${rowIdx + 1}`}
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
                    onChange={(e) => updateCell(rowIdx, col.id, e.target.value)}
                    className="h-9 text-sm"
                  />
                )}

                {col.type === "number" && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={val}
                    onFocus={(e) => scrollIntoView(e.currentTarget)}
                    onChange={(e) => updateCell(rowIdx, col.id, e.target.value)}
                    className="h-9 text-sm"
                  />
                )}

                {col.type === "dropdown" && (
                  <Select
                    value={val || ""}
                    onValueChange={(v) => updateCell(rowIdx, col.id, v)}
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
                          onClick={() => updateCell(rowIdx, col.id, active ? "" : opt.v)}
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
                    onChange={(v) => updateCell(rowIdx, col.id, v)}
                    fieldId={`${fieldId || "row"}-${rowId}-${col.id}`}
                    groupLabel={unitLabel}
                    jobId={jobId}
                    userId={userId}
                  />
                )}

                {col.type === "photo_gallery" && (
                  <RowPhotoGalleryCell
                    value={val}
                    onChange={(v) => updateCell(rowIdx, col.id, v)}
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
      })}


      <Button
        type="button"
        onClick={addRow}
        className="w-full min-h-[44px] bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Row
      </Button>
    </div>
  );
}

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
    const { error } = await supabase.storage.from("submissions").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      console.error("Upload error:", error);
    } else {
      onChange(path);
      if (jobId && userId) {
        const { data: signedData } = await supabase.storage
          .from("submissions")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (signedData?.signedUrl) {
          // Prefix the submission file_name with the human-readable group label
          // (e.g. unit/flat number) when available so reports/PDFs can group
          // photos by the dwelling label rather than by array index.
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
          <img src={signedUrl} alt="Captured" className="max-w-[140px] max-h-[100px] rounded border object-cover" />
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
