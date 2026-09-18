/**
 * Audio (voice note) helpers.
 *
 * `src/lib/fileUtils.ts` owns image/video detection and is deliberately left
 * untouched — this module adds the audio side used by voice notes and the
 * transcription flow.
 */

export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".oga", ".aac", ".weba"];

export function isAudioFile(name: string): boolean {
  const clean = (name || "").split("?")[0].toLowerCase();
  const ext = clean.slice(clean.lastIndexOf("."));
  return AUDIO_EXTENSIONS.includes(ext);
}

/** True for anything Deepgram/Scribe can transcribe (video or audio). */
export function isTranscribableFile(name: string, isVideo: boolean): boolean {
  return isVideo || isAudioFile(name);
}
