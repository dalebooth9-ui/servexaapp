// Shared helper: look up an engineer's stored signature image for the
// Customer Report PDF. Uses the engineer_signatures library table keyed by
// the technician name string (case-insensitive, whitespace-normalised).
import { supabase } from "@/integrations/supabase/client";

export type EngineerSignatureRow = {
  id: string;
  name: string;
  file_path: string;
  user_id: string | null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Load the whole library (small — one row per engineer name). */
export async function loadEngineerSignatureLibrary(): Promise<EngineerSignatureRow[]> {
  const { data } = await supabase
    .from("engineer_signatures" as any)
    .select("id, name, file_path, user_id");
  return ((data as any) || []) as EngineerSignatureRow[];
}

/** Find a stored signature for a technician name string. */
export function findEngineerSignatureByName(
  library: EngineerSignatureRow[],
  name?: string | null,
): EngineerSignatureRow | null {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  // Exact normalised match first
  const exact = library.find((r) => norm(r.name) === target);
  if (exact) return exact;
  // Fall back to first-word / surname contains match (handles "C. Whittaker"
  // vs "Chris Whittaker" style dropdown variants)
  const tokens = target.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  return (
    library.find((r) => {
      const n = norm(r.name);
      return tokens.every((t) => n.includes(t));
    }) || null
  );
}

/** Convenience: resolve a signed URL for a stored signature file. */
export async function signedUrlForEngineerSignature(
  file_path: string,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from("signatures")
    .createSignedUrl(file_path, 3600);
  return data?.signedUrl || null;
}
