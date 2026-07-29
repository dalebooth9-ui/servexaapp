import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWhat3Words } from "@/hooks/useWhat3Words";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";

interface AddNoteInputProps {
  jobId: string;
  userId?: string;
  onAdded: () => void;
}

export default function AddNoteInput({ jobId, userId, onAdded }: AddNoteInputProps) {
  const { convert } = useWhat3Words();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const getW3W = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const w3w = await convert(pos.coords.latitude, pos.coords.longitude);
          resolve(w3w);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    });
  };

  const handleAdd = async () => {
    if (!note.trim() || !userId) return;
    setSaving(true);
    const w3w = await getW3W();
    const content = w3w ? `${note.trim()}\n📍 ${w3w}` : note.trim();
    const { error } = await supabase.from("submissions").insert({
      job_id: jobId,
      engineer_id: userId,
      type: "note",
      content,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to add note.", variant: "destructive" });
    } else {
      toast({ title: "Note added", description: w3w ? `Location: ${w3w}` : undefined });
      setNote("");
      onAdded();
    }
    setSaving(false);
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);

    const w3w = await getW3W();
    const filePath = `${jobId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("submissions").upload(await buildOrgPathAsync(filePath), file);

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
    const { error: insertError } = await supabase.from("submissions").insert({
      job_id: jobId,
      engineer_id: userId,
      type: "photo",
      file_url: urlData.publicUrl,
      file_name: file.name,
      content: w3w ? `📍 ${w3w}` : null,
    });

    if (insertError) {
      toast({ title: "Error", description: "Failed to save photo.", variant: "destructive" });
    } else {
      toast({ title: "Photo added", description: w3w ? `Location: ${w3w}` : undefined });
      onAdded();
    }
    setUploading(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="mb-4 flex gap-2">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCameraCapture}
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
        placeholder="Add a note..."
        dictation
        className="flex-1 h-9 text-sm"
      />
      <Button size="sm" onClick={handleAdd} disabled={saving || !note.trim()}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => cameraInputRef.current?.click()}
        disabled={uploading}
      >
        <Camera className="h-3.5 w-3.5 mr-1" />
        {uploading ? "Uploading..." : "Photo"}
      </Button>
    </div>
  );
}
