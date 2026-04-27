import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ExternalLink, Loader2, ChevronDown, FileText, Droplet } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useWatermarkSettings,
  type WatermarkMode,
  type WatermarkSettings,
} from "@/hooks/useWatermarkSettings";

export interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown in the dialog header. */
  title?: string;
  /** A direct URL to the document (PDF / image / etc.). One of `url` or `blob` is required. */
  url?: string | null;
  /** A Blob to render — useful for in-memory generated PDFs (no upload). */
  blob?: Blob | null;
  /** Suggested file name for the download button. */
  fileName?: string;
  /** Optional alternative filenames the user can pick from in the dropdown. */
  fileNameOptions?: string[];
  /** MIME type — used to decide between iframe (PDF / HTML) and <img>. Defaults to application/pdf. */
  mimeType?: string;
  /** When true, show the watermark mode/opacity controls in the toolbar. Requires onRebuildWithWatermark. */
  watermarkControls?: boolean;
  /** Called when the user changes the watermark override; should rebuild the PDF and update `blob`. */
  onRebuildWithWatermark?: (override: Partial<WatermarkSettings>) => Promise<void> | void;
}

/** Slugify a candidate filename so it renders cleanly inside browser viewer chrome. */
function sanitizeFileName(name: string, ext: string): string {
  const base = (name || "document")
    .replace(/\.[a-z0-9]{2,5}$/i, "") // strip existing extension
    .trim()
    .replace(/[^\w\-. ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${base || "document"}.${ext}`;
}

/**
 * Lightweight in-app document preview shown in a large dialog.
 *
 * Renders PDFs and images directly via an <iframe>/<img>, so the user can
 * view documents without saving or downloading them first. A Download button
 * is always available inside the dialog for the cases where they do want a copy.
 *
 * The header includes a filename dropdown — picking a preset updates the URL
 * fragment so the browser's built-in PDF viewer / fallback UI displays a
 * descriptive name instead of the blob UUID.
 */
export default function PdfPreviewDialog({
  open,
  onOpenChange,
  title,
  url: urlProp,
  blob,
  fileName,
  fileNameOptions,
  mimeType = "application/pdf",
  watermarkControls = false,
  onRebuildWithWatermark,
}: PdfPreviewDialogProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const { settings: savedWatermark, loaded: watermarkLoaded } = useWatermarkSettings();
  // Local override the dialog applies on top of the saved org-wide setting.
  // Reset to "use saved value" each time the dialog opens.
  const [localMode, setLocalMode] = useState<WatermarkMode | "default">("default");
  const [localOpacity, setLocalOpacity] = useState<number | null>(null);
  const [localAccredOpacity, setLocalAccredOpacity] = useState<number | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalMode("default");
      setLocalOpacity(null);
      setLocalAccredOpacity(null);
    }
  }, [open]);

  const effectiveMode: WatermarkMode = localMode === "default" ? savedWatermark.mode : localMode;
  const effectiveOpacity = localOpacity ?? savedWatermark.opacity;
  const effectiveAccredOpacity = localAccredOpacity ?? savedWatermark.accreditationOpacity;

  // Sequence counter so only the latest rebuild's result wins when the user
  // toggles modes faster than the PDF can regenerate.
  const rebuildSeq = useRef(0);
  const triggerRebuild = async (override: Partial<WatermarkSettings>) => {
    if (!onRebuildWithWatermark) return;
    const id = ++rebuildSeq.current;
    setRebuilding(true);
    try {
      await onRebuildWithWatermark(override);
    } finally {
      // Only clear the spinner if this was the latest invocation.
      if (id === rebuildSeq.current) setRebuilding(false);
    }
  };

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const isImage = mimeType.startsWith("image/");
  const ext = useMemo(() => {
    if (isImage) return mimeType.split("/")[1]?.split("+")[0] || "png";
    if (mimeType === "application/pdf") return "pdf";
    return (fileName?.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "bin").toLowerCase();
  }, [mimeType, isImage, fileName]);

  // Build the dropdown options: dedupe + sanitize.
  const options = useMemo(() => {
    const raw = [fileName, ...(fileNameOptions || [])].filter(
      (n): n is string => typeof n === "string" && n.trim().length > 0,
    );
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of raw) {
      const clean = sanitizeFileName(n, ext);
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
    if (out.length === 0) out.push(sanitizeFileName("document", ext));
    return out;
  }, [fileName, fileNameOptions, ext]);

  const [selectedName, setSelectedName] = useState<string>(options[0]);

  // Reset selection whenever the dialog (re-)opens or the source changes.
  useEffect(() => {
    setSelectedName(options[0]);
  }, [options, open]);

  const downloadName = selectedName || options[0];

  // Append the filename as a URL fragment so the browser's built-in PDF
  // viewer (and any fallback UI) shows a human-readable name instead of the
  // blob UUID. The fragment is ignored when fetching the blob.
  const rawSrc = objectUrl || urlProp || null;
  const src = rawSrc
    ? `${rawSrc.split("#")[0]}#filename=${encodeURIComponent(downloadName)}`
    : null;

  const handleDownload = () => {
    if (!rawSrc) return;
    const a = document.createElement("a");
    a.href = rawSrc.split("#")[0];
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenInTab = () => {
    if (src) window.open(src, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex-row items-center justify-between space-y-0 gap-2">
          <DialogTitle className="text-sm truncate pr-2 flex-1 min-w-0">
            {title || downloadName}
          </DialogTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 max-w-[260px]"
                  title="Choose filename"
                  disabled={!src}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline truncate">{downloadName}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-[360px]">
                <DropdownMenuLabel>Filename</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {options.map((name) => (
                  <DropdownMenuItem
                    key={name}
                    onSelect={() => setSelectedName(name)}
                    className="text-xs"
                  >
                    <span className="truncate">{name}</span>
                    {name === downloadName && (
                      <span className="ml-auto pl-2 text-muted-foreground">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {watermarkControls && onRebuildWithWatermark && watermarkLoaded && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    title="Watermark settings for this preview"
                    disabled={!src || rebuilding}
                  >
                    {rebuilding ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Droplet className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Watermark</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Watermark for this preview</p>
                    <p className="text-xs text-muted-foreground">
                      Org default: <span className="font-medium capitalize">{savedWatermark.mode}</span>
                      {savedWatermark.mode !== "none" && ` · ${Math.round(savedWatermark.opacity * 100)}%`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Mode</Label>
                    <RadioGroup
                      value={effectiveMode}
                      onValueChange={(v) => {
                        const next = v as WatermarkMode;
                        setLocalMode(next);
                        triggerRebuild({
                          mode: next,
                          opacity: effectiveOpacity,
                          accreditationOpacity: effectiveAccredOpacity,
                        });
                      }}
                      className="grid grid-cols-3 gap-1"
                    >
                      {(["tinted", "untinted", "none"] as WatermarkMode[]).map((m) => (
                        <Label
                          key={m}
                          htmlFor={`wm-${m}`}
                          className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs capitalize cursor-pointer hover:bg-accent has-[input:checked]:bg-accent has-[input:checked]:border-primary"
                        >
                          <RadioGroupItem id={`wm-${m}`} value={m} className="h-3 w-3" />
                          {m}
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                  {effectiveMode !== "none" && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Watermark opacity</Label>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {Math.round(effectiveOpacity * 100)}%
                          </span>
                        </div>
                        <Slider
                          value={[effectiveOpacity]}
                          min={0}
                          max={0.3}
                          step={0.01}
                          onValueChange={([v]) => setLocalOpacity(v)}
                          onValueCommit={([v]) =>
                            triggerRebuild({
                              mode: effectiveMode,
                              opacity: v,
                              accreditationOpacity: effectiveAccredOpacity,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Accreditation logo opacity</Label>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {Math.round(effectiveAccredOpacity * 100)}%
                          </span>
                        </div>
                        <Slider
                          value={[effectiveAccredOpacity]}
                          min={0}
                          max={1}
                          step={0.05}
                          onValueChange={([v]) => setLocalAccredOpacity(v)}
                          onValueCommit={([v]) =>
                            triggerRebuild({
                              mode: effectiveMode,
                              opacity: effectiveOpacity,
                              accreditationOpacity: v,
                            })
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Independent of the watermark — set to 100% for fully solid logos.
                        </p>
                      </div>
                    </>
                  )}
                  {(localMode !== "default" || localOpacity !== null || localAccredOpacity !== null) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full text-xs"
                      onClick={() => {
                        setLocalMode("default");
                        setLocalOpacity(null);
                        setLocalAccredOpacity(null);
                        triggerRebuild({
                          mode: savedWatermark.mode,
                          opacity: savedWatermark.opacity,
                          accreditationOpacity: savedWatermark.accreditationOpacity,
                        });
                      }}
                    >
                      Reset to org default
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleOpenInTab}
              disabled={!src}
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleDownload}
              disabled={!src}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/40 relative">
          {!src ? (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing preview…
            </div>
          ) : isImage ? (
            <div className="h-full w-full overflow-auto flex items-start justify-center p-4">
              <img src={src} alt={downloadName} className="max-w-full h-auto" />
            </div>
          ) : (
            <iframe
              key={src}
              src={src}
              title={downloadName}
              className="w-full h-full border-0 bg-background"
            />
          )}
          {rebuilding && src && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Updating preview…
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
