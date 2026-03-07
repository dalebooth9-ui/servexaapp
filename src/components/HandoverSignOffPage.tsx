import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertTriangle, Pen, RotateCcw } from "lucide-react";

export default function HandoverSignOffPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      // Validate token via edge function (no auth required)
      const { data, error: fnErr } = await supabase.functions.invoke("handover-sign-off-validate", {
        body: { token },
      });
      if (fnErr || data?.error) {
        setError(data?.error || "Invalid or expired link");
        setLoading(false);
        return;
      }
      setRecord(data.record);
      setProject(data.project);
      setIssues(data.issues || []);
      setChecklist(data.checklist || []);
      if (data.record?.status === "signed") setSigned(true);
      setLoading(false);
    })();
  }, [token]);

  // Canvas drawing helpers
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true); setHasSig(true);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
  };
  const endDraw = () => setIsDrawing(false);
  const clearSig = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const handleSign = async () => {
    if (!hasSig || !record) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const sigData = canvas.toDataURL("image/png");
    setSigning(true);
    const { error: fnErr } = await supabase.functions.invoke("handover-sign-off-submit", {
      body: { token, signature_data: sigData },
    });
    if (fnErr) { setSigning(false); return; }
    setSigned(true); setSigning(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md text-center space-y-3">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">Link unavailable</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    </div>
  );

  if (signed) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md text-center space-y-4">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold">Handover Signed</h2>
        <p className="text-muted-foreground">Thank you. The handover pack has been signed and the team has been notified.</p>
      </div>
    </div>
  );

  const open = issues.filter((i: any) => i.status !== "resolved").length;
  const resolved = issues.filter((i: any) => i.status === "resolved").length;
  const clChecked = checklist.filter((c: any) => c.checked).length;
  const pct = issues.length > 0 ? Math.round((resolved / issues.length) * 100) : 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-destructive text-destructive-foreground px-6 py-6">
        <p className="text-sm font-medium opacity-80 mb-1">Installation Handover</p>
        <h1 className="text-2xl font-bold">{project?.title}</h1>
        {project?.reference && <p className="text-sm opacity-80 mt-1">Ref: {project.reference}</p>}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Summary */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Handover Summary</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted/50 py-3">
              <p className="text-2xl font-bold">{issues.length}</p>
              <p className="text-xs text-muted-foreground">Total Snags</p>
            </div>
            <div className="rounded-lg bg-green-50 py-3">
              <p className="text-2xl font-bold text-green-700">{resolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
            <div className="rounded-lg bg-amber-50 py-3">
              <p className="text-2xl font-bold text-amber-700">{open}</p>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
          </div>
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Snag completion</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-destructive"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {checklist.length > 0 && (
            <p className="text-xs text-muted-foreground">Pre-completion checklist: {clChecked}/{checklist.length} items signed off</p>
          )}
        </div>

        {/* Snag list summary */}
        {issues.length > 0 && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="font-semibold text-sm">Snag List</h2>
            </div>
            <div className="divide-y">
              {issues.map((issue: any, idx: number) => (
                <div key={issue.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground w-6 shrink-0">#{idx + 1}</span>
                  <span className={`flex-1 text-sm ${issue.status === "resolved" ? "line-through text-muted-foreground" : ""}`}>{issue.title}</span>
                  {issue.area && <span className="text-xs text-muted-foreground">{issue.area}</span>}
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${issue.status === "resolved" ? "text-green-700 bg-green-50" : "text-amber-700 bg-amber-50"}`}>
                    {issue.status === "resolved" ? "Done" : "Open"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature block */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Pen className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Client Signature</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            By signing below, you confirm receipt and acceptance of this handover pack for <strong>{project?.title}</strong>.
          </p>
          <div className="relative rounded-lg border-2 border-dashed bg-muted/30 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={600} height={160}
              className="w-full touch-none cursor-crosshair"
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
            />
            {!hasSig && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-muted-foreground">Draw your signature here</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={clearSig} disabled={!hasSig} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button size="sm" onClick={handleSign} disabled={!hasSig || signing} className="flex-1 gap-1.5">
              {signing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</> : <><CheckCircle2 className="h-3.5 w-3.5" /> Sign & Accept Handover</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
