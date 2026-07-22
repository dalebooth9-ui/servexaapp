// Reusable zoom/pan wrapper used by the paper-scan side-by-side viewer and the
// single-pane Original scan / Electronic report views. Provides +/−/fit
// controls, Ctrl+wheel zoom, pinch-to-zoom on touch, and drag-to-pan.
//
// Content is measured at its natural layout width (matching the outer
// container's client width so PdfCanvasViewer renders sharp pages), then
// visually scaled via CSS transform. A spacer div gets width/height =
// naturalSize × zoom so the outer overflow container scrolls naturally when
// the user pans.
import {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  WheelEvent as ReactWheelEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZoomPaneProps {
  children: ReactNode;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  toolbarExtras?: ReactNode;
}

export default function ZoomPane({
  children,
  className,
  minZoom = 0.5,
  maxZoom = 6,
  toolbarExtras,
}: ZoomPaneProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [baseW, setBaseW] = useState(0);
  const [baseH, setBaseH] = useState(0);

  // Measure the outer client width and use it as the natural layout width for
  // the inner content. This keeps PDFs rendered at the container's native
  // resolution regardless of zoom.
  useLayoutEffect(() => {
    if (!outerRef.current) return;
    const el = outerRef.current;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setBaseW(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!innerRef.current) return;
    const inner = innerRef.current;
    const update = () => {
      setBaseH(inner.scrollHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const clamp = (z: number) => Math.min(maxZoom, Math.max(minZoom, z));

  const applyZoom = (
    nextZoomRaw: number,
    focusX?: number,
    focusY?: number,
  ) => {
    const outer = outerRef.current;
    const nextZoom = clamp(nextZoomRaw);
    if (!outer) {
      setZoom(nextZoom);
      return;
    }
    const rect = outer.getBoundingClientRect();
    const fx = focusX ?? rect.width / 2;
    const fy = focusY ?? rect.height / 2;
    const contentX = (outer.scrollLeft + fx) / zoom;
    const contentY = (outer.scrollTop + fy) / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      if (!outer) return;
      outer.scrollLeft = Math.max(0, contentX * nextZoom - fx);
      outer.scrollTop = Math.max(0, contentY * nextZoom - fy);
    });
  };

  const reset = () => {
    setZoom(1);
    requestAnimationFrame(() => {
      if (outerRef.current) {
        outerRef.current.scrollLeft = 0;
        outerRef.current.scrollTop = 0;
      }
    });
  };

  // Ctrl / ⌘ + wheel zoom, focused on the pointer.
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = outerRef.current?.getBoundingClientRect();
    const fx = rect ? e.clientX - rect.left : undefined;
    const fy = rect ? e.clientY - rect.top : undefined;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    applyZoom(zoom * factor, fx, fy);
  };

  // Drag-to-pan (mouse/pen). Touch is handled via pinch below.
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    sl: number;
    st: number;
  } | null>(null);

  // Pinch-to-zoom (two-finger touch).
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{
    startDist: number;
    startZoom: number;
    focusX: number;
    focusY: number;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current;
    if (!outer) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (e.pointerType === "touch" && pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const rect = outer.getBoundingClientRect();
      pinch.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startZoom: zoom,
        focusX: (pts[0].x + pts[1].x) / 2 - rect.left,
        focusY: (pts[0].y + pts[1].y) / 2 - rect.top,
      };
      drag.current = null;
      return;
    }

    if (e.pointerType === "touch") return; // single-finger scroll uses native
    drag.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sl: outer.scrollLeft,
      st: outer.scrollTop,
    };
    try {
      outer.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current;
    if (!outer) return;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      const pts = Array.from(pointers.current.values()).slice(0, 2);
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const nextZoom = pinch.current.startZoom * (dist / pinch.current.startDist);
      applyZoom(nextZoom, pinch.current.focusX, pinch.current.focusY);
      return;
    }

    if (drag.current && e.pointerId === drag.current.pointerId) {
      outer.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
      outer.scrollTop = drag.current.st - (e.clientY - drag.current.y);
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current && e.pointerId === drag.current.pointerId) {
      try {
        outerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      drag.current = null;
    }
  };

  const spacerW = Math.max(1, Math.round((baseW || 0) * zoom));
  const spacerH = Math.max(1, Math.round((baseH || 0) * zoom));
  const canPan = zoom > 1;

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => applyZoom(zoom / 1.2)}
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <div className="w-11 text-center text-[11px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => applyZoom(zoom * 1.2)}
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={reset}
          aria-label="Fit to width"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Fit
        </Button>
        {toolbarExtras && (
          <div className="ml-auto flex items-center gap-1">{toolbarExtras}</div>
        )}
      </div>
      <div
        ref={outerRef}
        className="relative flex-1 overflow-auto bg-muted/30"
        style={{
          cursor: canPan ? (drag.current ? "grabbing" : "grab") : "default",
          touchAction: "pan-x pan-y",
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        <div
          style={{
            width: spacerW,
            height: spacerH,
            position: "relative",
          }}
        >
          <div
            ref={innerRef}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
              width: baseW || "100%",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
