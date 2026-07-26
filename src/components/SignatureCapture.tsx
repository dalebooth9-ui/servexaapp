import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenLine, Trash2, RotateCcw, Check, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import {
  loadEngineerSignatureLibrary,
  findEngineerSignatureByName,
  signedUrlForEngineerSignature,
  type EngineerSignatureRow,
} from "@/lib/engineerSignatureLibrary";

interface Signature {
  id: string;
  signer_name: string;
  signer_role: string;
  signer_position?: string | null;
  file_path: string;
  created_at: string;
  signer_id: string;
}

interface Props {
  jobId: string;
  /** Which role this pad captures. Defaults to engineer (uses current user's name). */
  signerRole?: "engineer" | "customer";
  /** Prefilled name for the signer (used as default for customer mode). */
  defaultSignerName?: string;
  /** Only show signatures matching this role in the list. */
  filterByRole?: boolean;
  /** Heading shown above the pad. */
  heading?: string;
}

export default function SignatureCapture({
  jobId,
  signerRole = "engineer",
  defaultSignerName = "",
  filterByRole = false,
  heading,
}: Props) {
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
  const [customerName, setCustomerName] = useState(defaultSignerName);
  const [customerPosition, setCustomerPosition] = useState("");
  const [engineerName, setEngineerName] = useState("");
  const [savedSig, setSavedSig] = useState<EngineerSignatureRow | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (signerRole !== "customer" && user) {
      supabase.from("profiles").select("full_name").eq("user_id", user.id).single()
        .then(({ data }) => setEngineerName(data?.full_name || ""));
    }
  }, [user, signerRole]);

  // Location permission preflight — ask early so the actual sign-off
  // capture is instant and doesn't stall on a mid-signature browser prompt.
  // Best-effort only; a denied/blocked permission simply means the report
  // will be sent with no ///words caption (per the never-block rule).
  useEffect(() => {
    if (signerRole !== "engineer" || typeof navigator === "undefined") return;
    if (!navigator.geolocation) return;
    try {
      // @ts-ignore — permissions API is optional
      navigator.permissions?.query({ name: "geolocation" as PermissionName })
        .then((status: PermissionStatus) => {
          if (status.state === "prompt") {
            navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 8000, maximumAge: 300000 });
          }
        })
        .catch(() => {});
    } catch { /* noop */ }
  }, [signerRole]);


  // Look up a stored signature for this signer (engineer sign-off only).
  useEffect(() => {
    if (signerRole === "customer" || !user) { setSavedSig(null); return; }
    (async () => {
      try {
        const lib = await loadEngineerSignatureLibrary();
        // Prefer exact user_id match, else fall back to name match.
        const byId = lib.find((r) => r.user_id && r.user_id === user.id);
        setSavedSig(byId || findEngineerSignatureByName(lib, engineerName));
      } catch { setSavedSig(null); }
    })();
  }, [user, signerRole, engineerName]);

  const fetchSignatures = async () => {
    let query = supabase
      .from("job_signatures" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (filterByRole) query = query.eq("signer_role", signerRole);
    const { data } = await query;
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

    // Best-effort w3w backfill: any of MY signatures with coordinates but no
    // words (previous save was offline / api down) — retry conversion now.
    const needBackfill = sigs.filter(
      (s: any) => s.signer_id === user?.id && s.lat != null && s.lng != null && !s.w3w_words,
    );
    if (needBackfill.length > 0) {
      Promise.all(
        needBackfill.map(async (s: any) => {
          try {
            const { data: r } = await supabase.functions.invoke("w3w-convert", {
              body: { lat: s.lat, lng: s.lng },
            });
            if (r?.words) {
              await supabase
                .from("job_signatures" as any)
                .update({ w3w_words: String(r.words) } as any)
                .eq("id", s.id);
            }
          } catch { /* try again next open */ }
        }),
      ).catch(() => {});
    }
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

  /**
   * Best-effort GPS + what3words capture for engineer sign-off.
   * Returns quickly (max ~4s) and never throws — location is optional per
   * the standing rule that nothing blocks report submission.
   */
  const captureLocation = async (): Promise<{ lat: number | null; lng: number | null; w3w: string | null }> => {
    if (signerRole !== "engineer") return { lat: null, lng: null, w3w: null };
    if (typeof navigator === "undefined" || !navigator.geolocation) return { lat: null, lng: null, w3w: null };
    const coords = await new Promise<GeolocationPosition | null>((resolve) => {
      let done = false;
      const finish = (v: GeolocationPosition | null) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 4000);
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(timer); finish(pos); },
          () => { clearTimeout(timer); finish(null); },
          { enableHighAccuracy: true, timeout: 3500, maximumAge: 60000 },
        );
      } catch { clearTimeout(timer); finish(null); }
    });
    if (!coords) return { lat: null, lng: null, w3w: null };
    const lat = coords.coords.latitude;
    const lng = coords.coords.longitude;
    let w3w: string | null = null;
    try {
      const { data } = await supabase.functions.invoke("w3w-convert", { body: { lat, lng } });
      if (data?.words) w3w = String(data.words); // "///word.word.word"
    } catch { /* swallow — will be backfilled */ }
    return { lat, lng, w3w };
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !user || !hasStrokes) return;
    if (signerRole === "customer" && !customerName.trim()) {
      toast({ title: "Print name is required", description: "Please enter the name of the person signing.", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      let resolvedName = customerName.trim();
      let resolvedPosition: string | null = customerPosition.trim() || null;
      if (signerRole !== "customer") {
        resolvedName = engineerName || "Unknown";
        resolvedPosition = null;
      }

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      // Capture location in parallel with the upload — never block the save.
      const locPromise = captureLocation();

      // IMPORTANT: the DB row's file_path MUST equal the actual storage
      // object path (org-prefixed) or signed-URL lookups will silently 404 —
      // that's why previous exports had signature rows but no image drawn.
      const relPath = `${user.id}/${jobId}-${signerRole}-${Date.now()}.png`;
      const storagePath = await buildOrgPathAsync(relPath);
      const { error: uploadErr } = await supabase.storage
        .from("signatures")
        .upload(storagePath, blob, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;

      const loc = await locPromise;
      const { error: insertErr } = await supabase.from("job_signatures" as any).insert({
        job_id: jobId,
        signer_id: user.id,
        signer_name: resolvedName,
        signer_role: signerRole === "customer" ? "customer" : (userRole || "engineer"),
        signer_position: resolvedPosition,
        file_path: storagePath,
        lat: loc.lat,
        lng: loc.lng,
        w3w_words: loc.w3w,
      } as any);
      if (insertErr) {
        // Clean up the orphan storage object so we don't accumulate dead files.
        await supabase.storage.from("signatures").remove([storagePath]).catch(() => {});
        throw insertErr;
      }

      toast({ title: "Signature saved" });
      clearCanvas();
      setDrawing(false);
      if (signerRole === "customer") { setCustomerName(defaultSignerName); setCustomerPosition(""); }
      fetchSignatures();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  const handleDelete = async (sig: Signature) => {
    if (!window.confirm(`Delete signature by ${sig.signer_name || "Unknown"}? This cannot be undone.`)) return;
    await supabase.storage.from("signatures").remove([sig.file_path]);
    const { error } = await supabase.from("job_signatures" as any).delete().eq("id", sig.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Log to job activity so admins can audit signature removals.
      await supabase.from("job_activity_log" as any).insert({
        job_id: jobId,
        user_id: user?.id ?? null,
        action: "signature_removed",
        details: `Signature removed for ${sig.signer_name || "Unknown"} (${sig.signer_role})`,
      } as any).then(() => {}, () => {});
      setSignatures((prev) => prev.filter((s) => s.id !== sig.id));
      toast({ title: "Signature removed" });
    }
  };


  /**
   * Copy the signer's stored library signature into this job as a fresh
   * signature record. We copy (not reference) so per-job deletion doesn't
   * delete the library file.
   */
  const handleUseSaved = async () => {
    if (!user || !savedSig) return;
    setSaving(true);
    try {
      const signed = await signedUrlForEngineerSignature(savedSig.file_path);
      if (!signed) throw new Error("Could not access saved signature");
      const resp = await fetch(signed);
      if (!resp.ok) throw new Error("Could not download saved signature");
      const blob = await resp.blob();

      const locPromise = captureLocation();
      const relPath = `${user.id}/${jobId}-${signerRole}-${Date.now()}.png`;
      const storagePath = await buildOrgPathAsync(relPath);
      const { error: uploadErr } = await supabase.storage
        .from("signatures")
        .upload(storagePath, blob, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;

      const loc = await locPromise;
      const { error: insertErr } = await supabase.from("job_signatures" as any).insert({
        job_id: jobId,
        signer_id: user.id,
        signer_name: engineerName || savedSig.name || "Unknown",
        signer_role: userRole || "engineer",
        signer_position: null,
        file_path: storagePath,
        lat: loc.lat,
        lng: loc.lng,
        w3w_words: loc.w3w,
      } as any);
      if (insertErr) {
        await supabase.storage.from("signatures").remove([storagePath]).catch(() => {});
        throw insertErr;
      }

      toast({ title: "Saved signature applied" });
      setDrawing(false);
      clearCanvas();
      fetchSignatures();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading signatures...</p>;

  return (
    <div className="space-y-4">
      {heading && <p className="text-sm font-medium">{heading}</p>}
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
                    <p className="text-sm font-medium">{sig.signer_name || <span className="italic text-muted-foreground">Not recorded</span>}</p>
                    {sig.signer_position && (
                      <p className="text-xs text-muted-foreground">{sig.signer_position}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {sig.signer_role} • {new Date(sig.created_at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {(userRole === "admin" || sig.signer_id === user?.id) && (
                    <button onClick={() => handleDelete(sig)} className="text-muted-foreground hover:text-destructive" title="Delete signature">
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
          {signerRole === "customer" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customer-sig-name" className="text-xs">Print name <span className="text-destructive">*</span></Label>
                <Input
                  id="customer-sig-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Full name of person signing"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-sig-position" className="text-xs">Position / role <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="customer-sig-position"
                  value={customerPosition}
                  onChange={(e) => setCustomerPosition(e.target.value)}
                  placeholder="e.g. Site Manager, Caretaker"
                />
              </div>
            </div>
          ) : (
            engineerName && (
              <p className="text-xs text-muted-foreground">Signing as <span className="font-medium text-foreground">{engineerName}</span></p>
            )
          )}
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
            <Button size="sm" onClick={handleSave} disabled={!hasStrokes || saving || (signerRole === "customer" && !customerName.trim())}>
              <Check className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save Signature"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrawing(true)}>
            <PenLine className="mr-1.5 h-4 w-4" /> {signerRole === "customer" ? "Add Customer Signature" : "Draw Signature"}
          </Button>
          {signerRole !== "customer" && savedSig && (
            <Button variant="secondary" size="sm" onClick={handleUseSaved} disabled={saving}>
              <ImageIcon className="mr-1.5 h-4 w-4" />
              {saving ? "Applying..." : "Use saved signature"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
