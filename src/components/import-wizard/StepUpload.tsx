import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { parseImportFile, ParsedFile, MAX_ROWS } from "@/lib/importMapping";

export default function StepUpload({
  file,
  parsed,
  onLoaded,
  onClear,
}: {
  file: File | null;
  parsed: ParsedFile | null;
  onLoaded: (file: File, parsed: ParsedFile) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (f: File) => {
    setLoading(true);
    try {
      const p = await parseImportFile(f);
      if (p.headers.length === 0 || p.rows.length === 0) {
        toast.error("File is empty or unreadable");
        return;
      }
      if (p.rows.length > MAX_ROWS) {
        toast.error(`This file has ${p.rows.length.toLocaleString()} rows. Please split it into files of ${MAX_ROWS.toLocaleString()} rows or fewer.`);
        return;
      }
      onLoaded(f, p);
    } catch (e: any) {
      toast.error(e.message || "Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-muted/30 transition"
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <div className="font-medium">{loading ? "Reading file…" : "Upload CSV or Excel"}</div>
          <div className="text-sm text-muted-foreground mt-1">
            Drop a file here or click to browse. Max {MAX_ROWS.toLocaleString()} rows.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="border rounded-lg p-4 flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <div className="font-medium">{file.name}</div>
            <div className="text-sm text-muted-foreground">
              {parsed?.rows.length.toLocaleString() ?? 0} rows · {parsed?.headers.length ?? 0} columns
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}><X className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
