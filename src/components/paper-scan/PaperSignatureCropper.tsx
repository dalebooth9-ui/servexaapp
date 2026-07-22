// Manual drag-to-crop tool for pulling a signature out of a scanned paper
// form when the AI didn't return a usable bounding box. The user drags a
// rectangle over the photo; on release we return a PNG blob of that region.
//
// Zoom + pan: signatures are tiny on a full-page A4 photo, so cropping at
// fit-to-screen zoom is imprecise. The toolbar exposes zoom in / out / reset,
// plus scroll-wheel and pinch zoom. When zoomed, users switch to Pan mode (or
// hold space) to drag the image around before drawing the crop box in Select
// mode. Crop coordinates are always mapped back to the ORIGINAL image
// resolution regardless of on-screen zoom level.
//
// NOTE: the source photo is typically served from a Supabase signed URL on a
// different origin. Drawing that image into a canvas without CORS opt-in
// taints the canvas and `canvas.toBlob()` silently returns null. We pre-fetch
// the image into a same-origin `blob:` URL to sidestep the taint.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Hand,
  Loader2,
  Maximize2,
  MousePointer2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };
type Mode = "select" | "pan";

interface Props {
  imageUrl: string;
  onCancel: () => void;
  onCrop: (blob: Blob, previewUrl: string) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export default function PaperSignatureCropper({ imageUrl, onCancel, onCrop }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  // rect stored in image-layer (pre-transform) coordinates, i.e. pixels on the
  // rendered <img> as if zoom were 1. This keeps it stable across zoom/pan.
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("select");
  const [spaceDown, setSpaceDown] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useRef<{ x: number; y: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Multi-touch (pinch) tracking.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number; midX: number; midY: number; panX: number; panY: number } | null>(null);

  // Pre-fetch the source image as a blob so the canvas isn't cross-origin
  // tainted at crop time.
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

  // Space bar toggles temporary pan mode, so keyboard users can pan without
  // clicking the toolbar.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const effectiveMode: Mode = spaceDown ? "pan" : mode;

  // Convert a pointer position (in wrap coordinates) into layer coordinates
  // (pre-transform image-space).
  const toLayer = (wrapX: number, wrapY: number) => ({
    x: (wrapX - pan.x) / zoom,
    y: (wrapY - pan.y) / zoom,
  });

  const getWrapPoint = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const r = wrap.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const clampPan = (nx: number, ny: number, z: number = zoom) => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return { x: nx, y: ny };
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    // offsetWidth/Height are pre-transform intrinsic size of the layer.
    const layerW = img.offsetWidth * z;
    const layerH = img.offsetHeight * z;
    // Allow layer to sit anywhere between fully-visible edges.
    const minX = Math.min(0, wrapW - layerW);
    const maxX = Math.max(0, wrapW - layerW);
    const minY = Math.min(0, wrapH - layerH);
    const maxY = Math.max(0, wrapH - layerH);
    return {
      x: Math.max(minX, Math.min(maxX, nx)),
      y: Math.max(minY, Math.min(maxY, ny)),
    };
  };

  const applyZoom = (nextZoom: number, focus?: { x: number; y: number }) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const wrap = wrapRef.current;
    if (!wrap) {
      setZoom(z);
      return;
    }
    const fx = focus?.x ?? wrap.clientWidth / 2;
    const fy = focus?.y ?? wrap.clientHeight / 2;
    // Keep the layer point under (fx, fy) stationary.
    const layerX = (fx - pan.x) / zoom;
    const layerY = (fy - pan.y) / zoom;
    const newPanX = fx - layerX * z;
    const newPanY = fy - layerY * z;
    const clamped = clampPan(newPanX, newPanY, z);
    setZoom(z);
    setPan(clamped);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (loading) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const p = getWrapPoint(e.clientX, e.clientY);
    applyZoom(zoom * factor, p);
  };

  const onDown = (e: React.PointerEvent) => {
    if (loading) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = getWrapPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);

    // Pinch: second finger starts a pinch gesture.
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStart.current = {
        dist,
        zoom,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        panX: pan.x,
        panY: pan.y,
      };
      // Cancel any in-progress rect drag when pinch begins.
      setDragging(false);
      start.current = null;
      panStart.current = null;
      return;
    }

    if (effectiveMode === "pan") {
      panStart.current = { x: p.x, y: p.y, px: pan.x, py: pan.y };
    } else {
      const layer = toLayer(p.x, p.y);
      start.current = layer;
      setDragging(true);
      setRect({ x: layer.x, y: layer.y, w: 0, h: 0 });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (loading) return;
    const p = getWrapPoint(e.clientX, e.clientY);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);

    // Pinch update.
    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && pinchStart.current.dist > 0) {
        const scale = dist / pinchStart.current.dist;
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStart.current.zoom * scale));
        // Anchor at initial midpoint (in layer coords at that time).
        const anchorLayerX = (pinchStart.current.midX - pinchStart.current.panX) / pinchStart.current.zoom;
        const anchorLayerY = (pinchStart.current.midY - pinchStart.current.panY) / pinchStart.current.zoom;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const newPanX = midX - anchorLayerX * nextZoom;
        const newPanY = midY - anchorLayerY * nextZoom;
        const clamped = clampPan(newPanX, newPanY, nextZoom);
        setZoom(nextZoom);
        setPan(clamped);
      }
      return;
    }

    if (panStart.current) {
      const dx = p.x - panStart.current.x;
      const dy = p.y - panStart.current.y;
      setPan(clampPan(panStart.current.px + dx, panStart.current.py + dy));
      return;
    }

    if (dragging && start.current) {
      const layer = toLayer(p.x, p.y);
      const x = Math.min(layer.x, start.current.x);
      const y = Math.min(layer.y, start.current.y);
      setRect({
        x,
        y,
        w: Math.abs(layer.x - start.current.x),
        h: Math.abs(layer.y - start.current.y),
      });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    setDragging(false);
    start.current = null;
    panStart.current = null;
  };

  const doCrop = async () => {
    setError(null);
    const img = imgRef.current;
    if (!img || !rect || rect.w < 4 || rect.h < 4) {
      setError("Draw a larger box around the signature and try again.");
      return;
    }
    if (!img.complete || !img.naturalWidth) {
      setError("The photo hasn't finished loading yet. Try again in a second.");
      return;
    }
    setBusy(true);
    try {
      // rect is in image-layer (pre-transform) coordinates. Convert to
      // natural image pixels using the intrinsic display size.
      const dispW = img.offsetWidth;
      const dispH = img.offsetHeight;
      const clampedX = Math.max(0, Math.min(dispW, rect.x));
      const clampedY = Math.max(0, Math.min(dispH, rect.y));
      const clampedW = Math.max(1, Math.min(dispW - clampedX, rect.w));
      const clampedH = Math.max(1, Math.min(dispH - clampedY, rect.h));
      const scaleX = img.naturalWidth / dispW;
      const scaleY = img.naturalHeight / dispH;
      const sx = Math.round(clampedX * scaleX);
      const sy = Math.round(clampedY * scaleY);
      const sw = Math.max(1, Math.round(clampedW * scaleX));
      const sh = Math.max(1, Math.round(clampedH * scaleY));

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

  const cursor =
    effectiveMode === "pan"
      ? panStart.current
        ? "grabbing"
        : "grab"
      : "crosshair";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {effectiveMode === "pan"
            ? "Drag to pan around the photo."
            : "Drag a box over the signature. Zoom in first for precision."}
        </p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap rounded-md border bg-muted/30 p-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "select" && !spaceDown ? "default" : "ghost"}
          className="h-8 gap-1.5"
          onClick={() => setMode("select")}
          title="Select signature area"
        >
          <MousePointer2 className="h-3.5 w-3.5" /> Select
        </Button>
        <Button
          type="button"
          size="sm"
          variant={effectiveMode === "pan" ? "default" : "ghost"}
          className="h-8 gap-1.5"
          onClick={() => setMode("pan")}
          title="Pan (or hold space)"
        >
          <Hand className="h-3.5 w-3.5" /> Pan
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => applyZoom(zoom / 1.25)}
          disabled={zoom <= MIN_ZOOM + 0.001}
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          value={zoom}
          onChange={(e) => applyZoom(parseFloat(e.target.value))}
          className="h-1 w-24 accent-primary"
          aria-label="Zoom level"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => applyZoom(zoom * 1.25)}
          disabled={zoom >= MAX_ZOOM - 0.001}
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5"
          onClick={resetView}
          title="Fit to screen"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Fit
        </Button>
      </div>

      <div
        ref={wrapRef}
        className="relative select-none touch-none overflow-hidden rounded border bg-muted flex items-center justify-center"
        style={{ height: "60vh", cursor }}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photo…
          </div>
        )}
        {localUrl && (
          <div
            ref={layerRef}
            className="absolute top-0 left-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <img
              ref={imgRef}
              src={localUrl}
              alt="paper form"
              crossOrigin="anonymous"
              className="block max-w-none pointer-events-none"
              draggable={false}
              onLoad={() => {
                // Fit width to wrap on first load.
                const wrap = wrapRef.current;
                const img = imgRef.current;
                if (!wrap || !img) return;
                const nat = img.naturalWidth;
                if (!nat) return;
                // Constrain intrinsic display width to wrap width.
                img.style.width = `${wrap.clientWidth}px`;
                img.style.height = "auto";
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            />
            {rect && (
              <div
                className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  // Keep border visually consistent regardless of zoom.
                  borderWidth: `${Math.max(1, 2 / zoom)}px`,
                }}
              />
            )}
          </div>
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
          disabled={loading || busy || !rect || rect.w < 4 || rect.h < 4}
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
