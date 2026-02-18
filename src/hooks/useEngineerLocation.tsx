import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const UPDATE_INTERVAL = 30_000; // 30 seconds

export function useEngineerLocation() {
  const { user, userRole } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user || userRole !== "engineer" || !navigator.geolocation) return;

    const sendLocation = async (lat: number, lng: number, accuracy?: number, heading?: number, speed?: number) => {
      const { error } = await supabase.from("engineer_locations" as any).upsert({
        user_id: user.id,
        latitude: lat,
        longitude: lng,
        accuracy: accuracy ?? null,
        heading: heading ?? null,
        speed: speed ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (!error) lastPos.current = { lat, lng };
    };

    const onPosition = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      sendLocation(latitude, longitude, accuracy, heading ?? undefined, speed ?? undefined);
    };

    // Initial position
    navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
      enableHighAccuracy: true,
      timeout: 10000,
    });

    // Watch for significant movement
    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: UPDATE_INTERVAL,
    });

    // Fallback periodic update
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
        enableHighAccuracy: false,
        timeout: 5000,
      });
    }, UPDATE_INTERVAL);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, userRole]);
}
