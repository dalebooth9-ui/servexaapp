import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue in bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

type LocationPoint = {
  id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  content?: string | null;
};

export default function LocationMap({ locations }: { locations: LocationPoint[] }) {
  if (locations.length === 0) return null;

  const center: [number, number] = [
    locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length,
    locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length,
  ];

  return (
    <div className="mb-6 overflow-hidden rounded-lg border">
      <MapContainer center={center} zoom={13} className="h-[350px] w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((loc) => (
          <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
            <Popup>
              <div className="text-xs">
                <p className="font-medium">{new Date(loc.created_at).toLocaleString()}</p>
                {loc.content && <p className="mt-1">{loc.content}</p>}
                <p className="mt-1 text-muted-foreground">
                  {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
