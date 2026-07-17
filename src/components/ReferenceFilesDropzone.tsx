/**
 * Drag-and-drop zone for attaching Reference files (last year's report,
 * historic PDF, contract page, etc.) to a job in-place.
 *
 * Used in:
 *   • the Create-New-Job dialog (stashes files client-side, uploads after
 *     the job row exists — jobId then swapped in)
 *   • each Pending-Review card
 *   • the Job page → Documents tab
 *
 * Reference files are internal by default — see uploadReferenceFile.ts.
 */
import { useRef, useState } from "react";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { uploadReferenceFiles } from "@/lib/uploadReferenceFile";

const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif";

type Props =
  | {
      /** Live mode: files upload immediately against this jobId. */
      mode: "live";
      jobId: string;
      onUploaded?: () => void;
      variant?: "block" | "compact";
      label?: string;
    }
  | {
      /** Deferred mode: caller collects a list of files, uploads later. */
      mode: "deferred";
      files: File[];
      onFilesChange: (files: File[]) => void;
      variant?: "block" | "compact";
      label?: string;
    };

export default function ReferenceFilesDropzone(props: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const compact = props.variant === "compact";
  const label = props.label ?? "Attach reference file";

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;

    if (props.mode === "deferred") {
      props.onFilesChange([...props.files, ...files]);
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const { succeeded, failed } = await uploadReferenceFiles({
      jobId: props.jobId,
      files,
      userId: user?.id,
      onProgress: (done, total, err) => {
        setProgress({ done, total });
        if (err) console.warn("Reference upload failed:", err);
      },
    });
    setUploading(false);
    setProgress(null);
    if (succeeded > 0) {
      toast({
        title: `Attached ${succeeded} reference file${succeeded === 1 ? "" : "s"}`,
        description: failed > 0 ? `${failed} failed — retry from the Documents tab.` : undefined,
      });
      props.onUploaded?.();
    } else {
      toast({ title: "Upload failed", description: "No reference files were attached.", variant: "destructive" });
    }
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`flex items-center gap-2 rounded-md border border-dashed cursor-pointer transition-colors ${
        dragOver
          ? "border-primary bg-primary/10"
          : "border-muted-foreground/30 hover:border-primary/40 hover:bg-primary/5"
      } ${compact ? "px-2.5 py-1.5 text-xs" : "px-4 py-3 text-sm"}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <span className="text-primary font-medium">
            Uploading {progress?.done}/{progress?.total}…
          </span>
        </>
      ) : (
        <>
          <Paperclip className={`shrink-0 text-muted-foreground ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
          <span className="text-muted-foreground">
            {label}
            {compact ? "" : " — drop PDFs, Word docs or photos here (internal to office)"}
          </span>
          {props.mode === "deferred" && props.files.length > 0 && (
            <span className="ml-auto text-xs text-primary font-medium">
              {props.files.length} pending
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Small list of files staged for a deferred upload (create-job flow).
 * Lets the user remove one before submitting.
 */
export function DeferredReferenceFilesList({
  files,
  onFilesChange,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1">
      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-xs"
        >
          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1" title={f.name}>{f.name}</span>
          <span className="text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onFilesChange(files.filter((_, j) => j !== i));
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
