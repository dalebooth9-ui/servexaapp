import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mic, MicOff, Camera, FileText, Sparkles, Check, Upload, AlertTriangle, Clock } from "lucide-react";

interface WorkOrderDraft {
  name: string;
  description: string;
  category: string;
  priority: "high" | "medium" | "low";
  job_type: "one_off" | "recurring";
  estimated_duration_hours: number;
  required_parts: { name: string; quantity: number; unit: string }[];
  safety_requirements: string[];
  customer_name: string | null;
  site_address: string | null;
  due_date: string | null;
  confidence: number;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (draft: WorkOrderDraft) => void;
}

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-yellow-500 text-white",
  low: "bg-muted text-muted-foreground",
};

export default function VoicePhotoWorkOrderDialog({ open, onOpenChange, onApply }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"idle" | "voice" | "photo" | "text">("idle");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>("image/jpeg");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode("idle"); setTranscript(""); setIsRecording(false);
    setPhotoBase64(null); setPhotoPreview(null); setDraft(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Use the Web Speech API transcript if available, or set placeholder
        if (!transcript) setTranscript("Voice note recorded — click Generate to create work order.");
      };
      mr.start();
      mediaRef.current = mr;
      setIsRecording(true);
      setMode("voice");
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setIsRecording(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPhotoPreview(result);
      // Strip data URL prefix for base64
      const base64 = result.split(",")[1];
      setPhotoBase64(base64);
      setMode("photo");
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!transcript && !photoBase64) {
      toast({ title: "Add a voice note or photo first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-photo-workorder", {
        body: {
          voice_transcript: transcript || undefined,
          photo_base64: photoBase64 || undefined,
          photo_mime_type: photoMime,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDraft(data.workorder);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-xl w-full flex flex-col p-0 gap-0"
        style={{ height: "85vh" }}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Work Order Generator
          </DialogTitle>
          <DialogDescription>
            Speak a voice note or upload a site photo — AI generates a structured work order
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 0 }}>
          {!draft && (
            <>
              {/* Input methods */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${isRecording ? "border-destructive bg-destructive/10 text-destructive" : mode === "voice" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  {isRecording ? "Stop" : "Voice Note"}
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${mode === "photo" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <Camera className="h-5 w-5" />
                  Upload Photo
                </button>
                <button
                  onClick={() => setMode("text")}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${mode === "text" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <FileText className="h-5 w-5" />
                  Type Notes
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

              {isRecording && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <span className="inline-block h-2 w-2 rounded-full bg-destructive animate-pulse" />
                  Recording… tap Stop when finished
                </div>
              )}

              {photoPreview && (
                <div className="rounded-lg overflow-hidden border">
                  <img src={photoPreview} alt="Site photo" className="w-full max-h-40 object-cover" />
                </div>
              )}

              {(mode === "voice" || mode === "text") && (
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={mode === "voice" ? "Edit voice transcript here if needed…" : "Describe the job, fault, or work required…"}
                  className="min-h-28 resize-none text-sm"
                />
              )}
            </>
          )}

          {draft && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`capitalize ${PRIORITY_BADGE[draft.priority]}`}>{draft.priority}</Badge>
                <Badge variant="outline" className="text-[10px]">{draft.category}</Badge>
                <Badge variant="outline" className="text-[10px]">{draft.job_type.replace("_", " ")}</Badge>
                <div className="flex items-center gap-1 ml-auto">
                  <div className="h-1.5 w-16 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${draft.confidence}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{draft.confidence}% confidence</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Job Title</p>
                <p className="text-sm font-medium">{draft.name}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Scope of Work</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{draft.description}</p>
              </div>

              {draft.required_parts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Required Parts</p>
                  <div className="space-y-1">
                    {draft.required_parts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm rounded border px-2 py-1">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground text-xs">{p.quantity} {p.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {draft.safety_requirements?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Safety Requirements</p>
                  <ul className="space-y-0.5 text-sm text-muted-foreground">
                    {draft.safety_requirements.map((s, i) => <li key={i} className="flex items-start gap-1"><span className="mt-0.5 shrink-0">⚠️</span>{s}</li>)}
                  </ul>
                </div>
              )}

              {(draft.estimated_duration_hours || draft.due_date) && (
                <div className="flex gap-4 text-sm">
                  {draft.estimated_duration_hours > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Est. {draft.estimated_duration_hours}h
                    </div>
                  )}
                  {draft.due_date && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Due: {draft.due_date}
                    </div>
                  )}
                </div>
              )}

              {draft.notes && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span><strong>Review needed:</strong> {draft.notes}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3 bg-card">
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          {!draft ? (
            <Button size="sm" onClick={generate} disabled={loading || (!transcript && !photoBase64)} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Generating…" : "Generate Work Order"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>Start over</Button>
              <Button size="sm" onClick={() => { onApply(draft); reset(); onOpenChange(false); }} className="gap-2">
                <Check className="h-4 w-4" />
                Use this Work Order
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
