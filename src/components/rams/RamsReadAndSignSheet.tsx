import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Check, ShieldCheck } from "lucide-react";
import InlineSignaturePad from "@/components/InlineSignaturePad";
import {
  findEngineerSignatureByName,
  loadEngineerSignatureLibrary,
  signedUrlForEngineerSignature,
} from "@/lib/engineerSignatureLibrary";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
  ramsKind: "rams" | "generic_rams" | "rams_documents";
  ramsId: string;
  ramsName: string;
  ramsVersion?: number;
  onSigned?: () => void;
}

/**
 * Mobile-friendly "Read & sign" flow for engineers. Records a signed sign-off
 * against `rams_signoffs` including the RAMS version and signature image.
 * Honours saved signatures from `engineer_signatures` — the engineer can
 * reuse their library signature or draw a fresh one.
 */
export default function RamsReadAndSignSheet({
  open,
  onOpenChange,
  jobId,
  ramsKind,
  ramsId,
  ramsName,
  ramsVersion = 1,
  onSigned,
}: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [read, setRead] = useState(false);
  const [savedSigUrl, setSavedSigUrl] = useState<string | null>(null);
  const [savedSigPath, setSavedSigPath] = useState<string | null>(null);
  const [drawnSig, setDrawnSig] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const engineerName = (profile as any)?.full_name || user?.email || "Engineer";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const lib = await loadEngineerSignatureLibrary();
      const match = findEngineerSignatureByName(lib, engineerName);
      if (!match) return;
      const url = await signedUrlForEngineerSignature(match.file_path);
      if (!cancelled) {
        setSavedSigUrl(url);
        setSavedSigPath(match.file_path);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, engineerName]);

  const reset = () => {
    setRead(false);
    setDrawnSig(null);
    setDrawing(false);
  };

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      // Find engineer's org
      const { data: prof } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
      const orgId = (prof as any)?.org_id;
      if (!orgId) throw new Error("Missing organisation");

      let signaturePath: string | null = savedSigPath;

      // If a fresh signature was drawn, upload it
      if (drawnSig) {
        const blob = await (await fetch(drawnSig)).blob();
        const path = `${orgId}/rams/${jobId}/${user.id}-${Date.now()}.png`;
        const { error: upErr } = await supabase.storage.from("signatures").upload(path, blob, {
          contentType: "image/png",
          upsert: true,
        });
        if (upErr) throw upErr;
        signaturePath = path;
      }

      const { error } = await supabase.from("rams_signoffs" as any).insert({
        org_id: orgId,
        job_id: jobId,
        rams_kind: ramsKind,
        rams_id: ramsId,
        engineer_id: user.id,
        engineer_name: engineerName,
        signature_path: signaturePath,
        rams_version: ramsVersion,
        user_agent: navigator.userAgent,
      } as any);
      if (error) throw error;

      toast({ title: "RAMS signed", description: "Your sign-off has been recorded." });
      onSigned?.();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not record sign-off", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = read && (savedSigPath || drawnSig);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg p-0 flex flex-col" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Read &amp; sign RAMS
          </DialogTitle>
          <DialogDescription className="truncate">{ramsName}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5 py-4 space-y-4">
          <div className="rounded-md bg-muted/40 border p-3 text-sm text-muted-foreground">
            You are about to sign a Risk Assessment &amp; Method Statement briefing record. This confirms
            you have read the RAMS, understand the hazards and control measures, and will follow the
            method of work on site.
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <Checkbox checked={read} onCheckedChange={(v) => setRead(!!v)} />
            <span className="text-sm">
              I confirm I have <strong>read and understood</strong> this RAMS and will comply with its
              hazards, controls and method statement.
            </span>
          </label>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signature</p>
            {savedSigUrl && !drawnSig && !drawing && (
              <div className="rounded-md border bg-white p-2 flex items-center gap-3">
                <img src={savedSigUrl} alt="Saved signature" className="h-16 object-contain" />
                <div className="flex-1">
                  <p className="text-sm">Use my saved signature</p>
                  <p className="text-xs text-muted-foreground">{engineerName}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setSavedSigPath(null); setDrawing(true); }}>
                  Draw new
                </Button>
              </div>
            )}
            {drawnSig && (
              <div className="rounded-md border bg-white p-2 flex items-center gap-3">
                <img src={drawnSig} alt="Drawn signature" className="h-16 object-contain" />
                <Button size="sm" variant="ghost" onClick={() => { setDrawnSig(null); setDrawing(true); }}>Redo</Button>
              </div>
            )}
            {drawing && !drawnSig && (
              <InlineSignaturePad
                onCapture={(url) => { setDrawnSig(url); setDrawing(false); }}
                onCancel={() => setDrawing(false)}
              />
            )}
            {!savedSigUrl && !drawnSig && !drawing && (
              <Button size="sm" variant="outline" onClick={() => setDrawing(true)}>
                Draw signature
              </Button>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-5 py-3 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Sign RAMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
