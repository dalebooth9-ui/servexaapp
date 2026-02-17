import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  uploading: boolean;
  accept?: string;
  allowedExtensions?: string[];
  maxSizeMB?: number;
  className?: string;
}

export default function FileDropZone({
  onFilesSelected,
  uploading,
  accept = ".pdf,.doc,.docx,.xls,.xlsx",
  allowedExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx"],
  maxSizeMB = 20,
  className,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const getExt = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

  const validateFiles = useCallback(
    (fileList: FileList | File[]): File[] => {
      const valid: File[] = [];
      for (const file of Array.from(fileList)) {
        const ext = getExt(file.name);
        if (!allowedExtensions.includes(ext)) continue;
        if (file.size > maxSizeMB * 1024 * 1024) continue;
        valid.push(file);
      }
      return valid;
    },
    [allowedExtensions, maxSizeMB]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = validateFiles(e.dataTransfer.files);
    if (files.length > 0) {
      setPendingFiles((prev) => [...prev, ...files]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = validateFiles(e.target.files);
      if (files.length > 0) {
        setPendingFiles((prev) => [...prev, ...files]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (pendingFiles.length === 0) return;
    onFilesSelected(pendingFiles);
    setPendingFiles([]);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          "relative cursor-pointer rounded-lg border-2 border-dashed px-6 py-8 text-center transition-all",
          isDragOver
            ? "border-primary bg-primary/5 text-primary"
            : "border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:bg-muted/50",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-medium">Uploading files...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8" />
            <p className="text-sm font-medium">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs">
              Supported: PDF, Word, Excel, JPG, PNG • Max {maxSizeMB}MB per file
            </p>
          </div>
        )}
      </div>

      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {pendingFiles.length} file(s) ready to upload
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingFiles([])}
                disabled={uploading}
              >
                Clear all
              </Button>
              <Button size="sm" onClick={handleUpload} disabled={uploading}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload {pendingFiles.length} file(s)
              </Button>
            </div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
            {pendingFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ({(file.size / 1024 / 1024).toFixed(1)}MB)
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
