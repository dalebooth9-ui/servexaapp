import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PenLine, Trash2, RotateCcw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Signature {
  id: string;
  signer_name: string;
  signer_role: string;
  file_path: string;
  created_at: string;
  signer_id: string;
}

export default function SignatureCapture({ jobId }: { jobId: string }) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const fetchSignatures = async () => {
    const { data } = await supabase
      .from("job_signatures" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    const sigs = (data as any[]) || [];
    setSignatures(sigs);

    // Generate signed URLs
    const urls: Record<string, string> = {};
    await Promise.all(
      sigs.map(async (sig) => {
        const { data: urlData } = await supabase.storage
          .from("signatures")
          .createSignedUrl(sig.file_path, 3600);
        if (urlData?.signedUrl) urls[sig.id] = urlData.signedUrl;
      })
    );
    setSignedUrls(urls);
    setLoading(false);
  };

  useEffect(() => { fetchSignatures(); }, [jobId]);

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
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPoint.current = point;
    setHasStrokes(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !user || !hasStrokes) return;
    setSaving(true);

    try {
      // Get user profile name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      const filePath = `${user.id}/${jobId}-${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage
        .from("signatures")
        .upload(filePath, blob, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("job_signatures" as any).insert({
        job_id: jobId,
        signer_id: user.id,
        signer_name: profile?.full_name || "Unknown",
        signer_role: userRole || "engineer",
        file_path: filePath,
      } as any);
      if (insertErr) throw insertErr;

      toast({ title: "Signature saved" });
      clearCanvas();
      setDrawing(false);
      fetchSignatures();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sig: Signature) => {
    await supabase.storage.from("signatures").remove([sig.file_path]);
    const { error } = await supabase.from("job_signatures" as any).delete().eq("id", sig.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSignatures((prev) => prev.filter((s) => s.id !== sig.id));
      toast({ title: "Signature removed" });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading signatures...</p>;

  return (
    <div className="space-y-4">
      {/* Existing signatures */}
      {signatures.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signatures.map((sig) => (
            <Card key={sig.id} className="overflow-hidden">
              <CardContent className="p-3">
                {signedUrls[sig.id] ? (
                  <img
                    src={signedUrls[sig.id]}
                    alt={`Signature by ${sig.signer_name}`}
                    className="h-24 w-full object-contain rounded bg-muted"
                  />
                ) : (
                  <div className="h-24 w-full rounded bg-muted animate-pulse" />
                )}
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{sig.signer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sig.created_at).toLocaleDateString("en-GB")} • {sig.signer_role}
                    </p>
                  </div>
                  {(userRole === "admin" || sig.signer_id === user?.id) && (
                    <button onClick={() => handleDelete(sig)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Capture pad */}
      {drawing ? (
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-background overflow-hidden">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
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
              <RotateCcw className="mr-1 h-4 w-4" /> Clear
            </Button>
            <Button variant="outline" size="sm" onClick={() => { clearCanvas(); setDrawing(false); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasStrokes || saving}>
              <Check className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save Signature"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setDrawing(true)}>
          <PenLine className="mr-1.5 h-4 w-4" /> Add Signature
        </Button>
      )}
    </div>
  );
}
