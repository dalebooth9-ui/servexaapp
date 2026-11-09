import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Circle, ScanLine, Hand, AlertTriangle } from "lucide-react";
import {
  OUTLET_REASONS, STATUS_LABEL, countChecked, judgeScan, parseStickerTag,
  type OutletChecks, type ScanVerdict,
} from "@/lib/outletChecks";

type TagInfo = { total: number; tags: Record<string, number> };
const cacheKey = (id: string) => `outlet_tags_v2_${id}`;

/** Load this riser's outlet count + sticker numbers; cached so it works offline. */
async function loadTagInfo(assetId: string): Promise<TagInfo> {
  try {
    const {data,error}=await supabase.rpc('asset_outlet_codes',{_asset_id:assetId});
    if(error)throw error;
    const codes=data as {total?:number;tags?:Record<string,number>} | null;
    const info: TagInfo = {
      total: Math.max(0, Number(codes?.total) || 0),
      tags: codes?.tags || {},
    };
    localStorage.setItem(cacheKey(assetId), JSON.stringify(info));
    return info;
  } catch {
    const c = localStorage.getItem(cacheKey(assetId));
    if (c) return JSON.parse(c);
    throw new Error("offline");
  }
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OutletChecksPanel({ assetId, checks, onChange, onTotal, onNumbers, locked, userId, userName }: {
  assetId: string; checks: OutletChecks; onChange: (c: OutletChecks) => void; onTotal?: (n: number) => void;
  onNumbers?: (numbers:number[]) => void; locked?: boolean; userId?: string | null; userName?: string | null;
}) {
  const [info, setInfo] = useState<TagInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [manualFor, setManualFor] = useState<number | null>(null);
  const checksRef = useRef(checks); checksRef.current = checks;

  useEffect(() => {
    setInfo(null); setFailed(false);
    loadTagInfo(assetId).then((i) => { setInfo(i); onTotal?.(i.total); onNumbers?.(Object.values(i.tags)); }).catch(() => setFailed(true));
  }, [assetId]);

  const handleCode = async (text: string) => {
    if (!info) return;
    let verdict: ScanVerdict = judgeScan(text, info.tags, checksRef.current);
    const tag = parseStickerTag(text);
    if (verdict.kind === "other_riser" && tag && navigator.onLine) {
      // Re-check online: new stickers may have been printed since this page loaded.
      const fresh = await loadTagInfo(assetId).catch(() => info);
      setInfo(fresh);
      verdict = judgeScan(text, fresh.tags, checksRef.current);
      if (verdict.kind === "other_riser") {
        const { data } = await supabase.from("riser_outlet_tags").select("id").eq("outlet_tag", tag).limit(1);
        if (!data?.length) verdict = { kind: "not_outlet" };
      }
    }
    if (verdict.kind === "ok") {
      onChange({ ...checksRef.current, [String(verdict.outlet)]: { status: "scanned", at: new Date().toISOString(), by: userId, by_name: userName, tag } });
      setMsg({ tone: "ok", text: `${tag} scanned` });
      if (tag && navigator.onLine) supabase.rpc("record_outlet_scan", { _tag: tag }).then(() => {}, () => {});
    } else if (verdict.kind === "already") {
      setMsg({ tone: "warn", text: `Already scanned – outlet ${verdict.outlet} is counted once` });
    } else if (verdict.kind === "other_riser") {
      setMsg({ tone: "bad", text: "This outlet belongs to a different riser. Not recorded." });
    } else {
      setMsg({ tone: "bad", text: "That isn't a Servexa outlet code. Not recorded." });
    }
    setScanOpen(false);
  };

  const confirmManual = (n: number, reason: string) => {
    onChange({ ...checks, [String(n)]: { status: "manual", at: new Date().toISOString(), by: userId, by_name: userName, tag: Object.keys(info?.tags || {}).find(t=>info?.tags[t]===n), reason } });
    setManualFor(null);
    setMsg({ tone: "ok", text: `Outlet ${n} manually confirmed` });
  };

  if (failed) return <Section><p className="text-xs text-muted-foreground">Couldn't load this riser's outlets. Reconnect and reopen the report.</p></Section>;
  if (!info) return <Section><p className="text-xs text-muted-foreground">Loading outlets…</p></Section>;
  if (info.total === 0) return <Section><p className="text-xs text-muted-foreground">This riser has no outlets recorded. Ask the office to set the number of outlets on the riser.</p></Section>;

  const numbers = Object.values(info.tags).sort((a,b)=>a-b);
  const done = countChecked(numbers, checks);
  return (
    <Section>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{done} of {info.total} outlets checked</p>
        <Progress value={(done / info.total) * 100} />
      </div>
      {!locked && (
        <Button type="button" size="lg" className="w-full h-14 text-base" onClick={() => { setMsg(null); setScanOpen(true); }}>
          <ScanLine className="h-6 w-6 mr-2" />Scan outlet
        </Button>
      )}
      {msg && (
        <div role="status" className={`rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 ${msg.tone === "ok" ? "bg-primary/10 text-primary" : msg.tone === "warn" ? "bg-muted text-foreground" : "bg-destructive/10 text-destructive"}`}>
          {msg.tone === "ok" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{msg.text}
        </div>
      )}
      <ul className="divide-y rounded-md border">
        {numbers.map((n) => {
          const c = checks[String(n)];
          const ok = c && c.status !== "missing";
          return (
            <li key={n} className="flex items-center gap-3 px-3 py-2 min-h-12">
              {ok ? <CheckCircle2 className="h-6 w-6 text-primary shrink-0" /> : <Circle className="h-6 w-6 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{Object.keys(info.tags).find(t=>info.tags[t]===n) || `Outlet ${n}`}</p>
                <p className={`text-xs ${ok ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                  {c ? `${STATUS_LABEL[c.status]} · ${fmtTime(c.at)}${c.reason ? ` · ${c.reason}` : ""}` : "Not scanned"}
                </p>
              </div>
              {!locked && !ok && (
                <Button type="button" variant="outline" className="h-11" onClick={() => setManualFor(n)}>
                  <Hand className="h-4 w-4 mr-1" />By hand
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {scanOpen && <ScannerDialog onCode={handleCode} onClose={() => setScanOpen(false)} />}
      <Dialog open={manualFor !== null} onOpenChange={(o) => !o && setManualFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm outlet {manualFor} by hand</DialogTitle>
            <DialogDescription>It will be saved as "Manually confirmed", not "Scanned". Why couldn't you scan it?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {OUTLET_REASONS.filter((r) => r !== "Outlet doesn't exist").map((r) => (
              <Button key={r} type="button" variant="outline" className="h-12 justify-start" onClick={() => manualFor && confirmManual(manualFor, r)}>{r}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider">Outlet checks</p>
      {children}
    </div>
  );
}

/** Full-screen camera reader (rear camera), decoding QR frames with jsQR. */
function ScannerDialog({ onCode, onClose }: { onCode: (t: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = videoRef.current; if (!v || stopped) return;
        v.srcObject = stream; await v.play();
        const tick = () => {
          if (stopped) return;
          if (v.readyState >= 2 && ctx) {
            const w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
            canvas.width = w; canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
            if (code?.data) { stopped = true; onCode(code.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setErr("Camera couldn't start. Allow camera access, or confirm the outlet by hand."); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan outlet sticker</DialogTitle>
          <DialogDescription>Point the camera at the QR sticker on the landing valve.</DialogDescription>
        </DialogHeader>
        {err ? <p className="text-sm text-destructive">{err}</p> : <video ref={videoRef} playsInline muted className="w-full rounded-md bg-muted aspect-square object-cover" />}
        <Button type="button" variant="outline" size="lg" className="h-14 w-full" onClick={onClose}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}
