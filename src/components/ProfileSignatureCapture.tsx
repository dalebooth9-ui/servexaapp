import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PenLine, RotateCcw, Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string;       // profile.user_id
  readOnly?: boolean;   // admin viewing someone else's
}

export default function ProfileSignatureCapture({ userId, readOnly = false }: Props) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingSig, setExistingSig] = useState<string | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("signature_data")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data?.signature_data) setExistingSig(data.signature_data);
      });
  }, [userId]);

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    lastPoint.current = getCanvasPoint(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const point = getCanvasPoint(e);
    if (!ctx || !point || !lastPoint.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPoint.current = point;
    setHasStrokes(true);
  };

  const endDraw = () => { setIsDrawing(false); lastPoint.current = null; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const { error } = await supabase
        .from("profiles")
        .update({ signature_data: dataUrl } as any)
        .eq("user_id", userId);
      if (error) throw error;
      setExistingSig(dataUrl);
      clearCanvas();
      setDrawing(false);
      toast({ title: "Signature saved", description: "This signature will be used automatically on job sheets and RAMS." });
    } catch (err: any) {
      toast({ title: "Error saving signature", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase
      .from("profiles")
      .update({ signature_data: null } as any)
      .eq("user_id", userId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setExistingSig(null);
      toast({ title: "Signature removed" });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        This signature is automatically added to job sheet PDFs and RAMS documents when this engineer is assigned to a job.
      </p>

      {existingSig && !drawing && (
        <div className="space-y-2">
          <div className="rounded-lg border bg-white p-3 flex items-center justify-between gap-3">
            <img src={existingSig} alt="Saved signature" className="h-16 object-contain max-w-[220px]" />
            {!readOnly && (
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setDrawing(true)}>
                  <PenLine className="mr-1.5 h-3.5 w-3.5" /> Update
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {!existingSig && !drawing && !readOnly && (
        <Button variant="outline" size="sm" onClick={() => setDrawing(true)}>
          <PenLine className="mr-1.5 h-4 w-4" /> Add Signature
        </Button>
      )}

      {drawing && !readOnly && (
        <div className="space-y-2">
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={600}
              height={160}
              className="w-full cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">Draw your signature above</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasStrokes}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
            <Button variant="outline" size="sm" onClick={() => { clearCanvas(); setDrawing(false); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasStrokes || saving}>
              <Check className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Signature"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
