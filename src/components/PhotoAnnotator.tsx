import { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Pen, Circle, Square, ArrowRight, Type, Trash2, Undo2, Check, Minus, Plus
} from "lucide-react";

type Tool = "pen" | "circle" | "rect" | "arrow" | "text";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#000000"];

interface Props {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export default function PhotoAnnotator({ open, imageUrl, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [history, setHistory] = useState<ImageData[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // Load image and set up canvas
  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const maxW = Math.min(window.innerWidth * 0.85, 800);
      const maxH = window.innerHeight * 0.65;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      setCanvasSize({ w, h });
      setImgLoaded(true);
    };
    img.src = imageUrl;
    setHistory([]);
    setTextPos(null);
    setTextInput("");
  }, [open, imageUrl]);

  // Draw base image when size is set
  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = canvasSize.w;
    canvas.height = canvasSize.h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imgRef.current, 0, 0, canvasSize.w, canvasSize.h);
    setHistory([ctx.getImageData(0, 0, canvasSize.w, canvasSize.h)]);
  }, [imgLoaded, canvasSize]);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;
  const getOverlayCtx = () => overlayRef.current?.getContext("2d") ?? null;

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const saveToHistory = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !canvasRef.current) return;
    const snap = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHistory((prev) => [...prev.slice(-19), snap]);
  }, []);

  const undo = () => {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    const ctx = getCtx();
    if (ctx) ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
    setHistory(newHistory);
  };

  const clearAnnotations = () => {
    const ctx = getCtx();
    if (!ctx || !imgRef.current || !canvasRef.current) return;
    ctx.drawImage(imgRef.current, 0, 0, canvasSize.w, canvasSize.h);
    setHistory([ctx.getImageData(0, 0, canvasSize.w, canvasSize.h)]);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === "text") {
      const pos = getPos(e);
      setTextPos(pos);
      return;
    }
    saveToHistory();
    setDrawing(true);
    const pos = getPos(e);
    setStartPos(pos);
    if (tool === "pen") {
      const ctx = getCtx()!;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const pos = getPos(e);
    if (tool === "pen") {
      const ctx = getCtx()!;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }
    // Shape preview on overlay
    const overlay = overlayRef.current!;
    const oCtx = getOverlayCtx()!;
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    oCtx.strokeStyle = color;
    oCtx.lineWidth = strokeWidth;
    oCtx.fillStyle = "transparent";
    if (tool === "circle") {
      const rx = (pos.x - startPos.x) / 2;
      const ry = (pos.y - startPos.y) / 2;
      oCtx.beginPath();
      oCtx.ellipse(startPos.x + rx, startPos.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      oCtx.stroke();
    } else if (tool === "rect") {
      oCtx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (tool === "arrow") {
      drawArrow(oCtx, startPos.x, startPos.y, pos.x, pos.y, strokeWidth, color);
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drawing) return;
    setDrawing(false);
    const pos = getPos(e);
    const ctx = getCtx()!;
    const oCtx = getOverlayCtx()!;
    oCtx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    if (tool === "circle") {
      const rx = (pos.x - startPos.x) / 2;
      const ry = (pos.y - startPos.y) / 2;
      ctx.beginPath();
      ctx.ellipse(startPos.x + rx, startPos.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === "rect") {
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (tool === "arrow") {
      drawArrow(ctx, startPos.x, startPos.y, pos.x, pos.y, strokeWidth, color);
    }
  };

  const commitText = () => {
    if (!textInput.trim() || !textPos) return;
    saveToHistory();
    const ctx = getCtx()!;
    const fontSize = 16 + strokeWidth * 3;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeText(textInput, textPos.x, textPos.y);
    ctx.fillText(textInput, textPos.x, textPos.y);
    setTextPos(null);
    setTextInput("");
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    onSave(canvasRef.current.toDataURL("image/jpeg", 0.92));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-sm font-semibold">Annotate Photo</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-muted/50 border-b">
          {/* Tool selection */}
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-background">
            {([
              { id: "pen", icon: Pen, label: "Draw" },
              { id: "circle", icon: Circle, label: "Circle" },
              { id: "rect", icon: Square, label: "Rectangle" },
              { id: "arrow", icon: ArrowRight, label: "Arrow" },
              { id: "text", icon: Type, label: "Text" },
            ] as const).map(({ id, icon: Icon, label }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <Button
                    size="icon" variant={tool === id ? "default" : "ghost"}
                    className="h-7 w-7" onClick={() => setTool(id)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Colors */}
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "scale-125 border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {/* Stroke width */}
          <div className="flex items-center gap-1 ml-auto">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setStrokeWidth(w => Math.max(1, w - 1))}>
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-xs w-4 text-center font-mono">{strokeWidth}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setStrokeWidth(w => Math.min(12, w + 1))}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={undo} disabled={history.length <= 1}>
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={clearAnnotations}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear all</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex items-center justify-center bg-neutral-900 overflow-auto" style={{ minHeight: 300, maxHeight: "65vh" }}>
          <div className="relative" style={{ width: canvasSize.w, height: canvasSize.h }}>
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              className="absolute top-0 left-0"
              style={{ cursor: tool === "text" ? "text" : "crosshair", touchAction: "none" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { if (drawing) onMouseUp({} as any); }}
            />
            <canvas
              ref={overlayRef}
              width={canvasSize.w}
              height={canvasSize.h}
              className="absolute top-0 left-0 pointer-events-none"
            />
            {/* Text input overlay */}
            {textPos && (
              <div className="absolute z-10" style={{ left: textPos.x, top: textPos.y - 24 }}>
                <div className="flex items-center gap-1 bg-background border rounded shadow-md px-2 py-1">
                  <input
                    autoFocus
                    className="text-sm outline-none bg-transparent w-40"
                    placeholder="Type text…"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setTextPos(null); setTextInput(""); } }}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commitText}>
                    <Check className="h-3 w-3 text-green-600" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> Save Annotation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Arrow drawing helper ──────────────────────────────────────────────────────
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  lw: number,
  color: string
) {
  const headLen = Math.max(12, lw * 5);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  // Line
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
