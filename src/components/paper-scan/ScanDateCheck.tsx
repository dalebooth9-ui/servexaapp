import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { paperDateText, parseSheetDate } from "@/lib/paperReportDate";
import { dateCheckText, type DateCheckReason } from "@/lib/scanDateCheck";

type Bbox = { x_min?: number; y_min?: number; x_max?: number; y_max?: number; page_index?: number } | null | undefined;

/** Zoomed crop of the handwritten date cut from the scanned page. */
export function DateCropPreview({ urls, bbox }: { urls: string[]; bbox: Bbox }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const has = bbox && [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max].every((n) => typeof n === "number") && (bbox.x_max as number) > (bbox.x_min as number) && (bbox.y_max as number) > (bbox.y_min as number);
  const pageIdx = has ? Math.min(Math.max(0, Number(bbox!.page_index || 0)), Math.max(0, urls.length - 1)) : 0;
  const url = urls[pageIdx];
  useEffect(() => {
    setFailed(false);
    if (!url || !ref.current) return;
    const img = new Image();
    img.onload = () => {
      const c = ref.current; if (!c) return;
      const pad = 2;
      const [x0, y0, x1, y1] = has
        ? [Math.max(0, bbox!.x_min! - pad), Math.max(0, bbox!.y_min! - pad), Math.min(100, bbox!.x_max! + pad), Math.min(100, bbox!.y_max! + pad)]
        : [0, 0, 100, 22]; // no located date: show the sheet header strip
      const sx = (x0 / 100) * img.naturalWidth, sy = (y0 / 100) * img.naturalHeight;
      const sw = ((x1 - x0) / 100) * img.naturalWidth, sh = ((y1 - y0) / 100) * img.naturalHeight;
      const W = 320, H = Math.max(40, Math.min(140, Math.round((sh / sw) * W)));
      c.width = W; c.height = H;
      c.getContext("2d")?.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    };
    img.onerror = () => setFailed(true);
    img.src = url;
  }, [url, has, bbox?.x_min, bbox?.y_min, bbox?.x_max, bbox?.y_max]);
  if (!url || failed) return null;
  return (
    <figure className="space-y-1">
      <canvas ref={ref} className="w-full max-w-xs rounded border bg-background" aria-label="Date as written on the scan" />
      <figcaption className="text-[11px] text-muted-foreground">
        {has ? "Date as written on the scan" : "Top of the scanned page (the date box wasn't located)"}
      </figcaption>
    </figure>
  );
}

/** Amber "Check date" badge, scanner's alternative reading and the Date checked tick. */
export function DateCheckNotice({ reasons, siblingDates, alternative, currentDate, onUseAlternative, checked, onCheckedChange }: {
  reasons: DateCheckReason[];
  siblingDates: string[];
  alternative?: string | null;
  currentDate: string;
  onUseAlternative: (uk: string) => void;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  if (!reasons.length) return null;
  const altIso = parseSheetDate(alternative);
  const altUk = altIso ? paperDateText(altIso) : null;
  const showAlt = altUk && altIso !== parseSheetDate(currentDate);
  return (
    <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-2">
      <Badge variant="outline" className="border-warning bg-warning text-warning-foreground gap-1">
        <AlertTriangle className="h-3 w-3" /> Check date
      </Badge>
      <p className="text-xs">{dateCheckText(reasons, siblingDates)} Compare with the scan, correct it if needed, then tick Date checked.</p>
      {showAlt && (
        <Button type="button" size="sm" variant="outline" onClick={() => onUseAlternative(altUk!)}>
          Scanner's other reading: use {altUk}
        </Button>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(!!c)} /> Date checked
      </label>
    </div>
  );
}
