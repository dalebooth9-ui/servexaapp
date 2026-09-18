/**
 * Voice note uploads.
 *
 * Audio recordings are stored alongside a job's photos/videos as submissions so
 * they appear in the job media grid and can be transcribed.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildOrgPathAsync } from "@/lib/orgStoragePath";
import { buildDurableRef } from "@/lib/durableStorageRef";
import { isAudioFile } from "@/lib/mediaKinds";

const MAX_VOICE_NOTE_MB = 100;

export type VoiceNoteUpload = { storagePath: string; fileName: string };

export function isAcceptableVoiceNote(file: File): boolean {
  return (
    (file.type.startsWith("audio/") || isAudioFile(file.name)) &&
    file.size <= MAX_VOICE_NOTE_MB * 1024 * 1024
  );
}

/** Uploads an audio file to the job's submissions and returns its storage path. */
export async function uploadJobVoiceNote(
  file: File,
  jobId: string,
  userId: string,
  bucket = "submissions",
): Promise<VoiceNoteUpload> {
  const safeName = file.name.replace(/[^\w.\-]/g, "_") || `voice-note-${Date.now()}.m4a`;
  const storagePath = await buildOrgPathAsync(`${jobId}/${Date.now()}-${safeName}`);

  const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, file);
  if (upErr) throw new Error(upErr.message);

  const { error: insErr } = await supabase.from("submissions").insert({
    job_id: jobId,
    engineer_id: userId,
    type: "document",
    file_url: buildDurableRef(bucket, storagePath),
    file_name: safeName,
  });
  if (insErr) throw new Error(insErr.message);

  return { storagePath, fileName: safeName };
}
