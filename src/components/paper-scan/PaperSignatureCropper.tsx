// Manual drag-to-crop tool for pulling a signature out of a scanned paper
// form when the AI didn't return a usable bounding box. The user drags a
// rectangle over the photo; on release we return a PNG blob of that region
// plus the bounding box as percentages so it can be persisted.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };

interface Props {
  imageUrl: string;
  onCancel: () => void;
  onCrop: (blob: Blob, previewUrl: string) => void;
}

export default function PaperSignatureCropper({ imageUrl, onCancel, onCrop }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const getPoint = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const r = wrap.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
      y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = getPoint(e);
    start.current = p;
    setDragging(true);
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging || !start.current) return;
    const p = getPoint(e);
    const x = Math.min(p.x, start.current.x);
    const y = Math.min(p.y, start.current.y);
    setRect({
      x,
      y,
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    });
  };
  const onUp = () => {
    setDragging(false);
    start.current = null;
  };

  const doCrop = async () => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap || !rect || rect.w < 8 || rect.h < 8) return;
    const wrapRect = wrap.getBoundingClientRect();
    const scaleX = img.naturalWidth / wrapRect.width;
    const scaleY = img.naturalHeight / wrapRect.height;
    const sx = Math.round(rect.x * scaleX);
    const sy = Math.round(rect.y * scaleY);
    const sw = Math.round(rect.w * scaleX);
    const sh = Math.round(rect.h * scaleY);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;
    const previewUrl = canvas.toDataURL("image/png");
    onCrop(blob, previewUrl);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Drag a box over the signature on the photo.
        </p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={wrapRef}
        className="relative select-none touch-none overflow-hidden rounded border bg-muted"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="paper form"
          className="w-full h-auto max-h-[60vh] object-contain pointer-events-none"
          draggable={false}
        />
        {rect && (
          <div
            className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={doCrop} disabled={!rect || rect.w < 8 || rect.h < 8}>
          Use this crop
        </Button>
      </div>
    </div>
  );
}
