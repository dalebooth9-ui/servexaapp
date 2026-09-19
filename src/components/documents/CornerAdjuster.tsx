import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Wand2 } from "lucide-react";
import { detectDocumentQuad, fullFrameQuad, orderQuad, type Point, type Quad } from "@/lib/documentEdgeDetection";

type Props = {
  canvas: HTMLCanvasElement;
  quad: Quad;
  onChange: (quad: Quad) => void;
};

/** Draggable four-corner crop editor over a captured frame. */
export default function CornerAdjuster({ canvas, quad, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [imgUrl, setImgUrl] = useState<string>("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [box, setBox] = useState({ width: 1, height: 1 });

  useEffect(() => {
    setImgUrl(canvas.toDataURL("image/jpeg", 0.85));
  }, [canvas]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setBox({ width: el.clientWidth || 1, height: el.clientHeight || 1 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgUrl]);

  const toDisplay = useCallback(
    (p: Point) => ({ x: (p.x / canvas.width) * box.width, y: (p.y / canvas.height) * box.height }),
    [canvas.width, canvas.height, box],
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (dragging === null) return;
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(canvas.width, Math.max(0, ((clientX - rect.left) / rect.width) * canvas.width));
      const y = Math.min(canvas.height, Math.max(0, ((clientY - rect.top) / rect.height) * canvas.height));
      const next = [...quad] as Quad;
      next[dragging] = { x, y };
      onChange(next);
    },
    [dragging, quad, onChange, canvas.width, canvas.height],
  );

  useEffect(() => {
    if (dragging === null) return;
    const move = (e: PointerEvent) => { e.preventDefault(); handleMove(e.clientX, e.clientY); };
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, handleMove]);

  const points = quad.map(toDisplay);
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative w-full touch-none select-none overflow-hidden rounded-lg bg-black">
        {imgUrl && <img src={imgUrl} alt="Captured document" className="block w-full" draggable={false} />}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${box.width} ${box.height}`}>
          <polygon points={polygon} fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth={2} />
        </svg>
        {points.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Corner ${i + 1}`}
            onPointerDown={(e) => { e.preventDefault(); setDragging(i); }}
            className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ left: p.x, top: p.y }}
          >
            <span className="h-5 w-5 rounded-full border-2 border-white bg-green-500 shadow-md" />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const found = detectDocumentQuad(canvas, canvas.width, canvas.height);
            onChange(found ? orderQuad(found) : fullFrameQuad(canvas.width, canvas.height));
          }}
        >
          <Wand2 className="h-4 w-4" /> Auto-detect
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => onChange(fullFrameQuad(canvas.width, canvas.height, 0))}
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
    </div>
  );
}
