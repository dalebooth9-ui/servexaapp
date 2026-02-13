/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LocationPoint = {
  id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  content?: string | null;
};

let googleMapsLoaded = false;
let googleMapsPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (googleMapsLoaded) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      googleMapsLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export default function LocationMap({ locations }: { locations: LocationPoint[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;

    let cancelled = false;

    const init = async () => {
      try {
        // Fetch API key
        const { data, error: fnError } = await supabase.functions.invoke("get-maps-key");
        if (fnError || !data?.apiKey) {
          setError("Maps API key unavailable");
          setLoading(false);
          return;
        }

        await loadGoogleMaps(data.apiKey);
        if (cancelled || !mapRef.current) return;

        const center = {
          lat: locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length,
          lng: locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length,
        };

        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: 14,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapInstanceRef.current = map;

        const bounds = new google.maps.LatLngBounds();

        locations.forEach((loc) => {
          const position = { lat: loc.latitude, lng: loc.longitude };
          bounds.extend(position);

          const marker = new google.maps.Marker({
            position,
            map,
            title: loc.content || undefined,
          });

          const infoContent = `
            <div style="font-size:12px;max-width:200px">
              <p style="font-weight:600;margin:0">${new Date(loc.created_at).toLocaleString()}</p>
              ${loc.content ? `<p style="margin:4px 0 0">${loc.content}</p>` : ""}
              <p style="margin:4px 0 0;color:#666">${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}</p>
            </div>
          `;

          const infoWindow = new google.maps.InfoWindow({ content: infoContent });
          marker.addListener("click", () => infoWindow.open(map, marker));
        });

        if (locations.length > 1) {
          map.fitBounds(bounds, 50);
        }

        setLoading(false);
      } catch (err) {
        console.error("Google Maps init error:", err);
        setError("Failed to load maps");
        setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      mapInstanceRef.current = null;
    };
  }, [locations]);

  if (locations.length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-lg border">
      {loading && !error && (
        <div className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
          Loading map...
        </div>
      )}
      {error && (
        <div className="flex h-[350px] items-center justify-center text-sm text-destructive">
          {error}
        </div>
      )}
      <div ref={mapRef} className={`h-[350px] w-full ${loading || error ? "hidden" : ""}`} />
    </div>
  );
}
