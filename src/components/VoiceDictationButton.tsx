import { useCallback, useEffect } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  /** append (default) adds to existing text; replace overwrites */
  mode?: "append" | "replace";
  size?: "sm" | "icon";
  className?: string;
}

export default function VoiceDictationButton({
  onTranscript,
  mode = "append",
  size = "icon",
  className,
}: VoiceDictationButtonProps) {
  const { toast } = useToast();

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: "vad",
    onCommittedTranscript: (data) => {
      if (data.text?.trim()) {
        onTranscript(data.text.trim());
      }
    },
    onError: (err) => {
      console.error("Scribe error:", err);
      toast({ title: "Voice error", description: String(err), variant: "destructive" });
    },
  });

  // Auto-stop on unmount
  useEffect(() => {
    return () => {
      if (scribe.isConnected) scribe.disconnect();
    };
  }, []);

  const toggle = useCallback(async () => {
    if (scribe.isConnected) {
      scribe.disconnect();
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({ title: "Microphone access required", description: "Please allow microphone access to use voice dictation.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");
      if (error || !data?.token) throw new Error(error?.message || "No token received");

      await scribe.connect({
        token: data.token,
        microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err: any) {
      toast({ title: "Could not start voice input", description: err.message, variant: "destructive" });
    }
  }, [scribe, toast]);

  const isLoading = !scribe.isConnected && false; // future: add connecting state

  return (
    <Button
      type="button"
      size={size === "sm" ? "sm" : "icon"}
      variant={scribe.isConnected ? "destructive" : "outline"}
      onClick={toggle}
      title={scribe.isConnected ? "Stop recording" : "Start voice dictation"}
      className={cn("shrink-0 relative", className)}
    >
      {scribe.isConnected ? (
        <>
          <MicOff className="h-4 w-4" />
          {/* pulsing ring when active */}
          <span className="absolute inset-0 rounded-md animate-ping opacity-30 bg-destructive" />
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
