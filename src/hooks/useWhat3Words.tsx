import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache to avoid redundant API calls for the same coordinates (rounded to ~10m)
const w3wCache = new Map<string, string>();

function roundCoord(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function useWhat3Words() {
  const inFlight = useRef<Map<string, Promise<string | null>>>(new Map());

  const convert = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    const key = `${roundCoord(lat)},${roundCoord(lng)}`;

    if (w3wCache.has(key)) return w3wCache.get(key)!;

    if (inFlight.current.has(key)) return inFlight.current.get(key)!;

    const promise = supabase.functions
      .invoke("w3w-convert", { body: { lat, lng } })
      .then(({ data, error }) => {
        if (error || !data?.words) return null;
        w3wCache.set(key, data.words);
        return data.words as string;
      })
      .catch(() => null)
      .finally(() => {
        inFlight.current.delete(key);
      });

    inFlight.current.set(key, promise);
    return promise;
  }, []);

  return { convert };
}
