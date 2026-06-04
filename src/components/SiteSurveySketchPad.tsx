import { useRef, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Eraser, Save, Pencil } from "lucide-react";

const BUCKET = "site-survey-media";

export default function SiteSurveySketchPad({ surveyId, onSaved }: { surveyId: string; onSaved?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
  }, [open]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    if ("touches" in e) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const stop = () => { drawing.current = false; last.current = null; };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const blob: Blob | null = await new Promise((r) => canvasRef.current!.toBlob(r, "image/png"));
    if (!blob) { setSaving(false); return; }
    const path = `${surveyId}/sketch-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/png" });
    if (upErr) {
      toast({ title: "Save failed", description: upErr.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    const { error: insErr } = await supabase.from("site_survey_photos" as any).insert({
      survey_id: surveyId, file_path: path, kind: "sketch", created_by: user.id,
    });
    setSaving(false);
    if (insErr) { toast({ title: "Save failed", description: insErr.message, variant: "destructive" }); return; }
    toast({ title: "Sketch saved" });
    setOpen(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5 mr-1.5" /> Sketch</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Sketch / floor plan</DialogTitle></DialogHeader>
        <div className="border rounded-md overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={900}
            height={600}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
            onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
          />
        </div>
        <div className="flex justify-between">
          <Button variant="outline" size="sm" onClick={clear}><Eraser className="h-3.5 w-3.5 mr-1.5" /> Clear</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save sketch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
