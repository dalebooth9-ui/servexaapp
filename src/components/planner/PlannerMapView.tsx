import { useEffect, useRef, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveEngineerLocations } from "@/hooks/useLiveEngineerLocations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Route, Loader2, MapPin, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScheduleEntry {
  id: string;
  job_id: string;
  engineer_id: string;
  schedule_date: string;
}

interface Job {
  id: string;
  name: string;
  reference_number: string;
  priority: string;
  customer: string | null;
  address: string | null;
}

interface Engineer { user_id: string; full_name: string }

const PRIORITY_PIN: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};

export default function PlannerMapView({
  schedule,
  jobs,
  engineers,
}: {
  schedule: ScheduleEntry[];
  jobs: Job[];
  engineers: Engineer[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const engineerMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const engineerLocations = useLiveEngineerLocations();
  const { toast } = useToast();
  const [optimising, setOptimising] = useState(false);
  const [routeResult, setRouteResult] = useState<{ total_distance_km?: number; total_duration_mins?: number } | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEngineer = (id: string) => engineers.find((e) => e.user_id === id);

  const scheduledJobs = useMemo(() => {
    const seen = new Set<string>();
    const result: { job: Job; engineerName: string; date: string }[] = [];
    for (const entry of schedule) {
      const job = getJob(entry.job_id);
      if (job?.address && !seen.has(job.id)) {
        seen.add(job.id);
        result.push({
          job,
          engineerName: getEngineer(entry.engineer_id)?.full_name || "Unassigned",
          date: entry.schedule_date,
        });
      }
    }
    return result;
  }, [schedule, jobs, engineers]);

  // Optimise route for all scheduled jobs
  const handleOptimise = async () => {
    if (scheduledJobs.length < 2) return;
    setOptimising(true);
    try {
      const waypoints = scheduledJobs.map((s) => ({ address: s.job.address, job_id: s.job.id }));
      const { data, error } = await supabase.functions.invoke("optimise-route", {
        body: { waypoints, origin: null },
      });
      if (error) throw error;
      setRouteResult(data);
      toast({ title: "Route optimised", description: `${data.total_distance_km} km — ${data.total_duration_mins} mins` });
    } catch {
      toast({ title: "Route optimisation failed", variant: "destructive" });
    }
    setOptimising(false);
  };

  useEffect(() => {
    let cancelled = false;
    setMapLoading(true);
    setMapError(null);

    const init = async () => {
      try {
        const { data } = await supabase.functions.invoke("get-maps-key");
        if (cancelled || !data?.apiKey || !mapRef.current) {
          if (!cancelled && !data?.apiKey) {
            setMapError("Google Maps API key is not configured.");
            setMapLoading(false);
          }
          return;
        }

        if (!(window as any).google?.maps) {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=marker`;
          script.async = true;
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        if (cancelled || !mapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 52.5, lng: -1.5 },
          zoom: 6,
          mapId: "planner-map",
        });
        mapInstanceRef.current = map;

        const geocoder = new google.maps.Geocoder();
        const bounds = new google.maps.LatLngBounds();
        let hasMarkers = false;

        for (const { job, engineerName } of scheduledJobs) {
          try {
            const result = await geocoder.geocode({ address: job.address! });
            if (result.results[0]) {
              const pos = result.results[0].geometry.location;
              bounds.extend(pos);
              hasMarkers = true;

              const pinColor = PRIORITY_PIN[job.priority] || "#6b7280";
              const pin = new google.maps.marker.PinElement({
                background: pinColor,
                borderColor: pinColor,
                glyphColor: "white",
              });

              const marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: pos,
                title: `${job.reference_number} - ${job.name}`,
                content: pin.element,
              });

              const infoWindow = new google.maps.InfoWindow({
                content: `<div style="font-family:system-ui;font-size:13px;max-width:250px">
                  <strong>${job.reference_number}</strong> — ${job.name}<br/>
                  <span style="color:#666">${job.customer || ""}</span><br/>
                  <span style="color:#666">${engineerName}</span>
                </div>`,
              });

              marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
              markersRef.current.push(marker);
            }
          } catch {
            // Skip failed geocodes
          }
        }

        if (hasMarkers) map.fitBounds(bounds);
        setMapLoading(false);
      } catch (err) {
        console.error("Planner map init error:", err);
        setMapError("Failed to load the map. Please try again.");
        setMapLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [scheduledJobs]);

  // Update engineer live pins
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !engineerLocations.length) return;

    // Clear old engineer markers
    engineerMarkersRef.current.forEach((m) => (m.map = null));
    engineerMarkersRef.current = [];

    for (const loc of engineerLocations) {
      const eng = getEngineer(loc.user_id);
      if (!eng) continue;

      // Create a blue pin for engineers
      const el = document.createElement("div");
      el.style.cssText = "width:32px;height:32px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;";
      el.textContent = eng.full_name.charAt(0).toUpperCase();

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: loc.latitude, lng: loc.longitude },
        title: `${eng.full_name} (Live)`,
        content: el,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:system-ui;font-size:13px">
          <strong>🔵 ${eng.full_name}</strong><br/>
          <span style="color:#666">Live location — ${new Date(loc.updated_at).toLocaleTimeString()}</span>
          ${loc.speed ? `<br/><span style="color:#666">Speed: ${Math.round(loc.speed * 3.6)} km/h</span>` : ""}
        </div>`,
      });
      marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
      engineerMarkersRef.current.push(marker);
    }
  }, [engineerLocations, engineers]);

  if (scheduledJobs.length === 0 && engineerLocations.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
        No scheduled jobs with addresses to show on the map.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {engineerLocations.length > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              {engineerLocations.length} engineer{engineerLocations.length !== 1 ? "s" : ""} live
            </Badge>
          )}
          {routeResult && (
            <Badge variant="outline" className="text-xs">
              {routeResult.total_distance_km} km · {routeResult.total_duration_mins} mins
            </Badge>
          )}
        </div>
        {scheduledJobs.length >= 2 && (
          <Button variant="outline" size="sm" onClick={handleOptimise} disabled={optimising}>
            {optimising ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Route className="mr-1.5 h-3.5 w-3.5" />}
            Optimise Route
          </Button>
        )}
      </div>
      <div className="relative">
        {mapLoading && !mapError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg border bg-muted/50 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading map...</p>
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg border bg-muted/30">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-medium text-destructive">{mapError}</p>
            <p className="mt-1 text-xs text-muted-foreground">Check that the Google Maps API key is configured.</p>
          </div>
        )}
        <div ref={mapRef} className={`h-[calc(100vh-320px)] min-h-[400px] rounded-lg border ${mapError ? "invisible" : ""}`} />
      </div>
    </div>
  );
}
