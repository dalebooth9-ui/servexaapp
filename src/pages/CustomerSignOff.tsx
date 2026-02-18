import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, RotateCcw, PenLine, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function CustomerSignOff() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const [jobInfo, setJobInfo] = useState<any>(null);
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const baseUrl = `https://${projectId}.supabase.co/functions/v1/customer-sign-off`;

  useEffect(() => {
    if (!token) { setError("No sign-off token provided."); setLoading(false); return; }
    fetch(`${baseUrl}?token=${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) { setAlreadySigned(true); }
          else { setError(data.error || "Invalid link"); }
        } else {
          setJobInfo(data.job);
          setCustomerName(data.customer_name || "");
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load sign-off details."); setLoading(false); });
  }, [token]);

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
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
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

  const handleSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      const formData = new FormData();
      formData.append("signature", blob, "signature.png");
      formData.append("signer_name", customerName || "Customer");

      const res = await fetch(`${baseUrl}?token=${token}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="text-xl font-bold">Thank You!</h2>
            <p className="text-gray-600">Your signature has been recorded. You can close this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadySigned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="mx-auto h-16 w-16 text-blue-500" />
            <h2 className="text-xl font-bold">Already Signed</h2>
            <p className="text-gray-600">This job has already been signed off. No further action is needed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <AlertCircle className="mx-auto h-16 w-16 text-red-500" />
            <h2 className="text-xl font-bold">Error</h2>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Customer Sign-Off</CardTitle>
          {jobInfo && (
            <div className="text-sm text-gray-500 space-y-0.5 mt-2">
              <p className="font-medium text-gray-700">{jobInfo.name}</p>
              <p>Ref: {jobInfo.reference_number}</p>
              {jobInfo.address && <p>{jobInfo.address}</p>}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="signer-name">Your Name</Label>
            <Input
              id="signer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>

          <div>
            <Label>Signature</Label>
            <div className="mt-1 rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden">
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
            <p className="text-xs text-gray-400 text-center mt-1">Draw your signature above</p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasStrokes}>
              <RotateCcw className="mr-1 h-4 w-4" /> Clear
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!hasStrokes || saving || !customerName.trim()}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              {saving ? "Submitting..." : "Confirm Sign-Off"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
