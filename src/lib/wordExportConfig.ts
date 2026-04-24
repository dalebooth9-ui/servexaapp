import { supabase } from "@/integrations/supabase/client";

export type LogoAlignment = "left" | "center" | "right";

export interface WordExportConfig {
  logoAlignment: LogoAlignment;
  /** Space (in twips, 1/20pt) below the logo paragraph. 200 ≈ 10pt. */
  logoSpacingAfter: number;
  /** Space (in twips) above the logo paragraph — controls top spacing. */
  logoSpacingBefore: number;
  /** Max logo width in pixels in the Word doc (bounding box width). */
  logoMaxWidth: number;
  /** Max logo height in pixels in the Word doc (bounding box height). */
  logoMaxHeight: number;
}

export const DEFAULT_WORD_EXPORT_CONFIG: WordExportConfig = {
  logoAlignment: "center",
  logoSpacingAfter: 200,
  logoSpacingBefore: 0,
  logoMaxWidth: 200,
  logoMaxHeight: 80,
};

const SETTINGS_KEY = "word_export_config";

let cached: WordExportConfig | null = null;
let inflight: Promise<WordExportConfig> | null = null;

export async function getWordExportConfig(): Promise<WordExportConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (!error && data && (data as any).value) {
        cached = { ...DEFAULT_WORD_EXPORT_CONFIG, ...((data as any).value as Partial<WordExportConfig>) };
      } else {
        cached = { ...DEFAULT_WORD_EXPORT_CONFIG };
      }
    } catch {
      cached = { ...DEFAULT_WORD_EXPORT_CONFIG };
    } finally {
      inflight = null;
    }
    return cached!;
  })();
  return inflight;
}

export async function saveWordExportConfig(cfg: WordExportConfig): Promise<void> {
  const { error } = await supabase
    .from("app_settings" as any)
    .upsert({
      key: SETTINGS_KEY,
      value: cfg as any,
      updated_at: new Date().toISOString(),
    } as any);
  if (error) throw error;
  cached = cfg;
}

export function clearWordExportConfigCache() {
  cached = null;
  inflight = null;
}
