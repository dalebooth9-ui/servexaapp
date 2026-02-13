import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type LocationPoint = {
  id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  content?: string | null;
};

export default function LocationMap({ locations }: { locations: LocationPoint[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const center: [number, number] = [
      locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length,
      locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length,
    ];

    const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView(center, 13);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    locations.forEach((loc) => {
      const marker = L.marker([loc.latitude, loc.longitude], { icon: defaultIcon }).addTo(map);
      const popupContent = `
        <div style="font-size:12px">
          <p style="font-weight:500">${new Date(loc.created_at).toLocaleString()}</p>
          ${loc.content ? `<p style="margin-top:4px">${loc.content}</p>` : ""}
          <p style="margin-top:4px;color:#888">${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}</p>
        </div>
      `;
      marker.bindPopup(popupContent);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [locations]);

  if (locations.length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-lg border">
      <div ref={mapRef} className="h-[350px] w-full" />
    </div>
  );
}
