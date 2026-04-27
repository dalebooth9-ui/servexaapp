import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/** How the Viva Flame watermark (and accreditation logos) should render across PDF exports. */
export type WatermarkMode = "tinted" | "untinted" | "none";

export interface WatermarkSettings {
  mode: WatermarkMode;
  /** 0–0.30. Opacity of the Viva flame watermark. */
  opacity: number;
  /** 0–1. Opacity of the accreditation logo row in the footer. Independent of the watermark. */
  accreditationOpacity: number;
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  mode: "tinted",
  opacity: 0.12,
  accreditationOpacity: 0.85,
};

const SETTINGS_KEY = "pdf_watermark";

/** Module-level cache so the value is only fetched once per session and shared
 *  across the many PDF exports that read it. */
let cachedPromise: Promise<WatermarkSettings> | null = null;
const subscribers = new Set<(s: WatermarkSettings) => void>();
let cachedValue: WatermarkSettings = DEFAULT_WATERMARK_SETTINGS;

function clampOpacity(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_WATERMARK_SETTINGS.opacity;
  return Math.max(0, Math.min(0.3, n));
}

function clampAccredOpacity(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_WATERMARK_SETTINGS.accreditationOpacity;
  return Math.max(0, Math.min(1, n));
}

function normalise(raw: any): WatermarkSettings {
  const mode: WatermarkMode =
    raw?.mode === "untinted" || raw?.mode === "none" ? raw.mode : "tinted";
  const opacity = clampOpacity(Number(raw?.opacity ?? DEFAULT_WATERMARK_SETTINGS.opacity));
  // Fallback: legacy records had no separate accreditation opacity — preserve
  // the old behaviour by reusing the watermark opacity when missing.
  const accreditationOpacity = clampAccredOpacity(
    Number(raw?.accreditationOpacity ?? raw?.opacity ?? DEFAULT_WATERMARK_SETTINGS.accreditationOpacity),
  );
  return { mode, opacity, accreditationOpacity };
}

/** Fetch and cache the watermark settings — used by PDF exporters that don't
 *  need to subscribe to live changes. Always resolves (falls back to defaults). */
export async function loadWatermarkSettings(): Promise<WatermarkSettings> {
  if (!cachedPromise) {
    cachedPromise = (async () => {
      try {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", SETTINGS_KEY)
          .maybeSingle();
        const value = normalise(data?.value);
        cachedValue = value;
        return value;
      } catch {
        return DEFAULT_WATERMARK_SETTINGS;
      }
    })();
  }
  return cachedPromise;
}

/** React hook with live updates after a save. */
export function useWatermarkSettings(): {
  settings: WatermarkSettings;
  loaded: boolean;
  save: (next: WatermarkSettings) => Promise<{ error: string | null }>;
} {
  const [settings, setSettings] = useState<WatermarkSettings>(cachedValue);
  const [loaded, setLoaded] = useState<boolean>(cachedPromise !== null);

  useEffect(() => {
    let alive = true;
    loadWatermarkSettings().then((v) => {
      if (!alive) return;
      setSettings(v);
      setLoaded(true);
    });
    const sub = (v: WatermarkSettings) => setSettings(v);
    subscribers.add(sub);
    return () => {
      alive = false;
      subscribers.delete(sub);
    };
  }, []);

  const save = useCallback(async (next: WatermarkSettings) => {
    const value = normalise(next);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value: value as any }, { onConflict: "key" });
    if (error) return { error: error.message };
    cachedValue = value;
    cachedPromise = Promise.resolve(value);
    subscribers.forEach((fn) => fn(value));
    return { error: null };
  }, []);

  return { settings, loaded, save };
}
