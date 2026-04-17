import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Loader2, AlertTriangle, RotateCcw, ShieldCheck, MapPin, Camera } from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

type Token = {
  id: string; token: string; status: string; expires_at: string; signed_at: string | null;
  signature_data: string | null; signer_name: string | null; signer_email: string | null;
  notes: string | null; job_id: string; customer_id: string | null; org_id: string | null;
};
type Job = {
  id: string; name: string; reference_number: string; description: string | null;
  customer_name: string | null; site_address: string | null; status: string;
};
type OrgInfo = { name: string; logo_url: string | null };

const signSchema = z.object({
  signer_name: z.string().trim().min(2, "Please enter your full name").max(120),
  signer_email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export default function JobHandover() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenRow, setTokenRow] = useState<Token | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [org, setOrg] = useState<OrgInfo>({ name: "Servexa", logo_url: null });
  const [photos, setPhotos] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<{ label: string; done: boolean }[]>([]);

  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);

  // ── Load token + job ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setError("Missing link token."); setLoading(false); return; }
    (async () => {
      const { data: tk, error: tkErr } = await supabase
        .from("handover_tokens")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (tkErr || !tk) { setError("This link is invalid."); setLoading(false); return; }
      const row = tk as Token;
      if (new Date(row.expires_at) < new Date()) { setError("This link has expired."); setLoading(false); return; }
      if (row.status === "signed") { setDone(true); setTokenRow(row); setLoading(false); return; }
      setTokenRow(row);

      // Job + customer + org
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("id, name, reference_number, description, status, address, customers(name), sites(address)")
        .eq("id", row.job_id)
        .maybeSingle();
      if (jobRow) {
        const j: any = jobRow;
        setJob({
          id: j.id, name: j.name, reference_number: j.reference_number,
          description: j.description, status: j.status,
          customer_name: j.customers?.name || null,
          site_address: j.sites?.address || j.address || null,
        });
      }

      if (row.org_id) {
        const { data: o } = await supabase.from("organisations_safe").select("name, logo_url").eq("id", row.org_id).maybeSingle();
        if (o) setOrg({ name: (o as any).name || "Servexa", logo_url: (o as any).logo_url || null });
      }

      // Photos from submissions
      const { data: subs } = await supabase
        .from("submissions")
        .select("file_url, type")
        .eq("job_id", row.job_id)
        .in("type", ["photo"])
        .order("created_at", { ascending: false })
        .limit(12);
      setPhotos(((subs || []) as any[]).map(s => s.file_url));

      // Checklist (pre-completion checklist)
      const { data: cl } = await supabase
        .from("pre_completion_checklist" as any)
        .select("label, checked")
        .eq("job_id", row.job_id)
        .order("sort_order");
      if (cl && Array.isArray(cl)) {
        setChecklist((cl as any[]).map(c => ({ label: c.label, done: !!c.checked })));
      }

      setLoading(false);
    })();
  }, [token]);

  // ── Signature canvas ─────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    if ("touches" in e) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    return { x: ((e as React.MouseEvent).clientX - r.left) * sx, y: ((e as React.MouseEvent).clientY - r.top) * sy };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const p = getPos(e, c);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    setDrawing(true); setHasSig(true);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const p = getPos(e, c);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
  };
  const endDraw = () => setDrawing(false);
  const clearSig = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasSig(false);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError(null);
    if (!tokenRow || !canvasRef.current) return;

    const parsed = signSchema.safeParse({ signer_name: signerName, signer_email: signerEmail, notes });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || "Please check the form");
      return;
    }
    if (!hasSig) { setFormError("Please draw your signature."); return; }
    if (!confirmed) { setFormError("Please tick the confirmation box."); return; }

    setSubmitting(true);
    const sigData = canvasRef.current.toDataURL("image/png");
    const { error: upErr } = await supabase
      .from("handover_tokens")
      .update({
        status: "signed",
        signature_data: sigData,
        signer_name: parsed.data.signer_name,
        signer_email: parsed.data.signer_email || null,
        notes: parsed.data.notes || null,
        signed_at: new Date().toISOString(),
      })
      .eq("token", tokenRow.token);
    setSubmitting(false);
    if (upErr) { setFormError(upErr.message); return; }
    setDone(true);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-3">
        <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto" />
        <h2 className="text-xl font-semibold text-slate-900">Link unavailable</h2>
        <p className="text-slate-600">{error}</p>
        <p className="text-xs text-slate-400">Please contact us if you believe this is a mistake.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-4">
        <div className="h-16 w-16 rounded-full bg-emerald-100 mx-auto grid place-items-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Thank you</h2>
        <p className="text-slate-600">Your sign-off has been recorded. A copy will be emailed to you shortly.</p>
        {tokenRow?.signed_at && (
          <p className="text-xs text-slate-400">Signed {format(new Date(tokenRow.signed_at), "dd MMM yyyy 'at' HH:mm")}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          {org.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="h-10 w-auto" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-orange-500 grid place-items-center text-white font-bold">S</div>
          )}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Job Handover</p>
            <p className="font-semibold text-slate-900">{org.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Job summary */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">{job?.reference_number}</p>
              <h1 className="text-xl font-bold text-slate-900 mt-1">{job?.name}</h1>
              {job?.customer_name && <p className="text-sm text-slate-600 mt-0.5">{job.customer_name}</p>}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-3 w-3" /> Ready for sign-off
            </span>
          </div>
          {job?.site_address && (
            <p className="text-sm text-slate-600 flex items-start gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" /> {job.site_address}
            </p>
          )}
          {job?.description && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-1">Work completed</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.description}</p>
            </div>
          )}
        </section>

        {/* Photos */}
        {photos.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-sm text-slate-900 mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4 text-slate-500" /> Job photos ({photos.length})
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-slate-100 hover:opacity-90 transition">
                  <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Checklist */}
        {checklist.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-sm text-slate-900 mb-3">Completion checklist</h2>
            <ul className="space-y-2">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${c.done ? "text-emerald-500" : "text-slate-300"}`} />
                  <span className={c.done ? "text-slate-700" : "text-slate-400 line-through"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Sign-off form */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-base text-slate-900">Customer sign-off</h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="signer_name" className="text-slate-700">Your full name *</Label>
              <Input id="signer_name" value={signerName} onChange={e => setSignerName(e.target.value)}
                placeholder="Jane Smith" className="bg-white border-slate-300" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signer_email" className="text-slate-700">Email (optional)</Label>
              <Input id="signer_email" type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)}
                placeholder="you@company.com" className="bg-white border-slate-300" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-slate-700">Comments (optional)</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any feedback or comments..." rows={3} className="bg-white border-slate-300" />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700">Signature *</Label>
            <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={600} height={180}
                className="w-full touch-none cursor-crosshair bg-white"
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
              {!hasSig && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-sm text-slate-400">Draw your signature here</p>
                </div>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={clearSig} disabled={!hasSig}
              className="border-slate-300 text-slate-700 hover:bg-slate-100">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear
            </Button>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(!!v)} className="mt-0.5" />
            <span>I confirm the work has been completed to my satisfaction.</span>
          </label>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{formError}</p>
          )}

          <Button onClick={handleSubmit} disabled={submitting}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-6 text-base">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Sign &amp; Confirm</>}
          </Button>

          <p className="text-[11px] text-slate-400 text-center">
            By signing, you agree that this digital signature has the same legal effect as a handwritten signature.
          </p>
        </section>

        <footer className="text-center text-xs text-slate-400 pt-2 pb-6">
          Powered by <span className="font-medium text-slate-500">Servexa</span>
        </footer>
      </main>
    </div>
  );
}
