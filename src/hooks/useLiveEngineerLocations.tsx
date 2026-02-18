import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EngineerLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

export function useLiveEngineerLocations() {
  const [locations, setLocations] = useState<EngineerLocation[]>([]);

  useEffect(() => {
    // Initial fetch
    const fetch = async () => {
      const { data } = await supabase.from("engineer_locations" as any).select("*");
      if (data) setLocations(data as unknown as EngineerLocation[]);
    };
    fetch();

    // Realtime subscription
    const channel = supabase
      .channel("engineer-locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "engineer_locations" },
        (payload) => {
          const loc = payload.new as unknown as EngineerLocation;
          if (loc) {
            setLocations((prev) => {
              const idx = prev.findIndex((l) => l.user_id === loc.user_id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = loc;
                return next;
              }
              return [...prev, loc];
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return locations;
}
