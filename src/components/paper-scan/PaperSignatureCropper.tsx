// Manual drag-to-crop tool for pulling a signature out of a scanned paper
// form when the AI didn't return a usable bounding box. The user drags a
// rectangle over the photo; on release we return a PNG blob of that region
// plus the bounding box as percentages so it can be persisted.
//
// NOTE: the source photo is typically served from a Supabase signed URL on
// a different origin. Drawing that image into a canvas without CORS opt-in
// taints the canvas, so `canvas.toBlob()` silently returns null and the
// "Use this crop" button appeared to do nothing. We now pre-fetch the
// image into a same-origin `blob:` URL before rendering, which sidesteps
// the taint entirely, and we surface any remaining failure as a visible
// error instead of a no-op.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

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
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  // Pre-fetch the source image as a blob so the canvas isn't cross-origin
  // tainted. Large phone-camera photos are fine here — we're not decoding
  // them ourselves, just re-hosting the bytes via object URL.
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(imageUrl, { credentials: "omit" });
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setLocalUrl(created);
      } catch (e: any) {
        console.error("[PaperSignatureCropper] preload failed", e);
        if (!cancelled) {
          // Fall back to the original URL with crossOrigin so at least the
          // image renders. Cropping may still fail if CORS is missing, in
          // which case doCrop will surface a visible error.
          setLocalUrl(imageUrl);
          setError(
            "Couldn't preload the photo locally — cropping may fail if the image server doesn't allow cross-origin reads.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [imageUrl]);

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
    setError(null);
    const img = imgRef.current;
    if (!img || !rect || rect.w < 8 || rect.h < 8) {
      setError("Draw a larger box around the signature and try again.");
      return;
    }
    if (!img.complete || !img.naturalWidth) {
      setError("The photo hasn't finished loading yet. Try again in a second.");
      return;
    }
    setBusy(true);
    try {
      // Scale from the RENDERED image box (not the wrap), because
      // object-contain / max-h can shrink the img inside the wrap.
      const imgBox = img.getBoundingClientRect();
      const wrapBox = wrapRef.current!.getBoundingClientRect();
      // Convert crop rect from wrap-coordinates into image-coordinates.
      const offsetX = imgBox.left - wrapBox.left;
      const offsetY = imgBox.top - wrapBox.top;
      const localX = rect.x - offsetX;
      const localY = rect.y - offsetY;
      const clampedX = Math.max(0, Math.min(imgBox.width, localX));
      const clampedY = Math.max(0, Math.min(imgBox.height, localY));
      const clampedW = Math.max(1, Math.min(imgBox.width - clampedX, rect.w));
      const clampedH = Math.max(1, Math.min(imgBox.height - clampedY, rect.h));
      const scaleX = img.naturalWidth / imgBox.width;
      const scaleY = img.naturalHeight / imgBox.height;
      const sx = Math.round(clampedX * scaleX);
      const sy = Math.round(clampedY * scaleY);
      const sw = Math.max(1, Math.round(clampedW * scaleX));
      const sh = Math.max(1, Math.round(clampedH * scaleY));

      // Clamp output canvas size — some phones return 4000x6000 images and
      // a full-height crop would blow up. Signatures are small: 1600px on
      // the long edge is plenty for print.
      const MAX_EDGE = 1600;
      const outScale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * outScale));
      const outH = Math.max(1, Math.round(sh * outScale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported in this browser.");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      let blob: Blob | null = null;
      try {
        blob = await new Promise<Blob | null>((resolve, reject) => {
          try {
            canvas.toBlob((b) => resolve(b), "image/png");
          } catch (err) {
            reject(err);
          }
        });
      } catch (err) {
        throw new Error(
          "Couldn't read the cropped area (the source photo may be blocked by CORS).",
        );
      }
      if (!blob) {
        throw new Error(
          "Couldn't produce a signature image from that crop. Try a slightly different area.",
        );
      }
      let previewUrl: string;
      try {
        previewUrl = canvas.toDataURL("image/png");
      } catch {
        previewUrl = URL.createObjectURL(blob);
      }
      onCrop(blob, previewUrl);
    } catch (e: any) {
      console.error("[PaperSignatureCropper] crop failed", e);
      setError(e?.message || "Crop failed.");
    } finally {
      setBusy(false);
    }
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
        className="relative select-none touch-none overflow-hidden rounded border bg-muted min-h-[120px] flex items-center justify-center"
        onPointerDown={loading ? undefined : onDown}
        onPointerMove={loading ? undefined : onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photo…
          </div>
        )}
        {localUrl && (
          <img
            ref={imgRef}
            src={localUrl}
            alt="paper form"
            crossOrigin="anonymous"
            className="w-full h-auto max-h-[60vh] object-contain pointer-events-none"
            draggable={false}
          />
        )}
        {rect && (
          <div
            className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={doCrop}
          disabled={loading || busy || !rect || rect.w < 8 || rect.h < 8}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cropping…
            </>
          ) : (
            "Use this crop"
          )}
        </Button>
      </div>
    </div>
  );
}
