import { useEffect, useRef, useMemo, useState, useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useLiveEngineerLocations } from "@/hooks/useLiveEngineerLocations";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Route, Loader2, MapPin, AlertTriangle, RefreshCw } from "lucide-react";
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

// Distinct highlight colour when filtering by engineer
const ENGINEER_HIGHLIGHT = "#8b5cf6";

export default function PlannerMapView({
  schedule,
  jobs,
  engineers,
  unallocatedJobs = [],
  onRouteOptimised,
}: {
  schedule: ScheduleEntry[];
  jobs: Job[];
  engineers: Engineer[];
  unallocatedJobs?: Job[];
  onRouteOptimised?: (orderedJobIds: string[]) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ marker: google.maps.marker.AdvancedMarkerElement; engineerId: string }[]>([]);
  const engineerMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const unallocatedMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const liveRouteRenderersRef = useRef<google.maps.DirectionsRenderer[]>([]);
  const routeNumberOverlaysRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const mapsApiKeyRef = useRef<string | null>(null);
  const engineerLocations = useLiveEngineerLocations();
  const { user } = useAuth();
  const { toast } = useToast();
  const [optimising, setOptimising] = useState(false);
  const [routeResult, setRouteResult] = useState<{ total_distance_km?: number; total_duration_mins?: number; total_duration_in_traffic_mins?: number } | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showUnallocated, setShowUnallocated] = useState(true);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>("all");
  const [showLiveRoutes, setShowLiveRoutes] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [savingPin, setSavingPin] = useState<string | null>(null);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(0); // 0 = off
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const handleOptimiseRef = useRef<() => Promise<void>>();

  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEngineer = (id: string) => engineers.find((e) => e.user_id === id);

  // Collect engineers that actually have scheduled jobs in the current view
  const activeEngineers = useMemo(() => {
    const ids = new Set(schedule.map((s) => s.engineer_id));
    return engineers.filter((e) => ids.has(e.user_id));
  }, [schedule, engineers]);

  const scheduledJobs = useMemo(() => {
    const seen = new Set<string>();
    const result: { job: Job; engineerName: string; engineerId: string; date: string }[] = [];
    for (const entry of schedule) {
      const job = getJob(entry.job_id);
      if (job?.address && !seen.has(job.id)) {
        seen.add(job.id);
        result.push({
          job,
          engineerName: getEngineer(entry.engineer_id)?.full_name || "Unassigned",
          engineerId: entry.engineer_id,
          date: entry.schedule_date,
        });
      }
    }
    return result;
  }, [schedule, jobs, engineers]);

  // Clear any existing route line from the map
  const clearRouteOverlay = useCallback(() => {
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }
    // Remove numbered step labels
    routeNumberOverlaysRef.current.forEach((m) => { m.map = null; });
    routeNumberOverlaysRef.current = [];
  }, []);

  // Render the optimised route as a polyline on the map
  const renderRouteOnMap = useCallback(async (optimisedWaypoints: { address: string; job_id: string }[]) => {
    const map = mapInstanceRef.current;
    if (!map || optimisedWaypoints.length < 2) return;

    clearRouteOverlay();

    const directionsService = new google.maps.DirectionsService();
    const origin = optimisedWaypoints[0].address;
    const destination = optimisedWaypoints[optimisedWaypoints.length - 1].address;
    const intermediates = optimisedWaypoints.slice(1, -1).map((wp) => ({
      location: wp.address,
      stopover: true,
    }));

    try {
      const result = await directionsService.route({
        origin,
        destination,
        waypoints: intermediates,
        travelMode: google.maps.TravelMode.DRIVING,
        // Live-traffic aware ETAs (Google uses current conditions when departureTime = now)
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
      });

      const renderer = new google.maps.DirectionsRenderer({
        map,
        directions: result,
        suppressMarkers: true, // Keep our custom markers
        polylineOptions: {
          strokeColor: "#2563eb",
          strokeWeight: 5,
          strokeOpacity: 0.85,
        },
      });
      directionsRendererRef.current = renderer;

      // Auto-enable the live traffic layer so the optimised path is visualised against current congestion
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
      setShowTraffic(true);
    } catch (err) {
      console.error("Failed to render route on map:", err);
    }
  }, [clearRouteOverlay]);

  // Toggle Google's live traffic layer on/off
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || typeof google === "undefined" || !google.maps?.TrafficLayer) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
  }, [showTraffic, mapLoading]);

  // Optimise route for all scheduled jobs
  const handleOptimise = async () => {
    if (scheduledJobs.length < 2) return;
    setOptimising(true);
    clearRouteOverlay();
    try {
      const waypoints = scheduledJobs.map((s) => ({ address: s.job.address!, job_id: s.job.id }));
      const { data, error } = await supabase.functions.invoke("optimise-route", {
        body: { waypoints, origin: null },
      });
      if (error) throw error;
      setRouteResult(data);
      const trafficMins = data.total_duration_in_traffic_mins ?? data.total_duration_mins;
      const baseMins = data.total_duration_mins;
      const trafficSuffix = trafficMins != null && baseMins != null && trafficMins !== baseMins
        ? ` (${trafficMins} mins with live traffic)`
        : "";
      toast({ title: "Route optimised", description: `${data.total_distance_km} km — ${baseMins} mins${trafficSuffix}` });

      // Notify parent of optimised job order
      if (data.optimised?.length >= 2) {
        onRouteOptimised?.(data.optimised.map((wp: any) => wp.job_id));
      }

      // Draw optimised route on map
      if (data.optimised?.length >= 2) {
        await renderRouteOnMap(data.optimised);

        // Add numbered step labels to markers
        const map = mapInstanceRef.current;
        if (map) {
          const geocoder = new google.maps.Geocoder();
          for (let i = 0; i < data.optimised.length; i++) {
            const wp = data.optimised[i];
            try {
              const geoResult = await geocoder.geocode({ address: wp.address });
              const pos = geoResult.results?.[0]?.geometry?.location;
              if (!pos) continue;

              const labelDiv = document.createElement("div");
              labelDiv.textContent = String(i + 1);
              labelDiv.style.cssText = "background:#2563eb;color:#fff;font-weight:700;font-size:13px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);pointer-events:none;";

              const overlay = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: pos,
                content: labelDiv,
                zIndex: 1000 + i,
              });
              routeNumberOverlaysRef.current.push(overlay);
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      toast({ title: "Route optimisation failed", variant: "destructive" });
    }
    setOptimising(false);
  };

  // Save a static map pin image to a job's folder
  const saveMapPinToJob = useCallback(async (jobId: string, address: string, lat: number, lng: number, refNumber: string, customerName: string) => {
    if (!user?.id) return;
    setSavingPin(jobId);
    try {
      // Fetch static map via server-side proxy so the API key is never in the browser
      const staticmapQs = `center=${lat},${lng}&zoom=15&size=600x400&scale=2&markers=color:red%7C${lat},${lng}`;
      const { data: imgData, error: imgErr } = await supabase.functions.invoke("get-maps-key", {
        body: { staticmap: staticmapQs },
      });
      if (imgErr || !imgData) throw new Error("Failed to fetch map image");
      const imgBlob = imgData instanceof Blob ? imgData : new Blob([imgData], { type: "image/png" });

      // Draw text overlay on canvas
      const img = new Image();
      img.crossOrigin = "anonymous";
      const bitmapUrl = URL.createObjectURL(imgBlob);
      const finalBlob: Blob = await new Promise((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);

          // Semi-transparent banner at top
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(0, 0, canvas.width, 64);

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 28px system-ui, sans-serif";
          ctx.textBaseline = "middle";
          const label = [refNumber, customerName].filter(Boolean).join(" — ");
          ctx.fillText(label, 16, 32, canvas.width - 32);

          URL.revokeObjectURL(bitmapUrl);
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png");
        };
        img.onerror = () => { URL.revokeObjectURL(bitmapUrl); reject(new Error("Image load failed")); };
        img.src = bitmapUrl;
      });

      const fileName = `map-pin-${Date.now()}.png`;
      const filePath = `${jobId}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("submissions").upload(filePath, finalBlob, { contentType: "image/png" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
      await supabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: user.id,
        type: "photo",
        file_url: urlData.publicUrl,
        file_name: fileName,
        content: `Map pin — ${address}`,
      });

      toast({ title: "Map pin saved", description: "Location image added to job folder." });
    } catch (err) {
      console.error("Save map pin error:", err);
      toast({ title: "Failed to save map pin", variant: "destructive" });
    }
    setSavingPin(null);
  }, [user, toast]);

  // Handle clicks on "Save Pin" buttons inside info windows (delegated)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("[data-save-pin]") as HTMLElement | null;
      if (!target) return;
      const { jobId, address, lat, lng, refNumber, customerName } = target.dataset as any;
      if (jobId && address && lat && lng) {
        saveMapPinToJob(jobId, address, parseFloat(lat), parseFloat(lng), refNumber || "", customerName || "");
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [saveMapPinToJob]);

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
        mapsApiKeyRef.current = data.apiKey;

        if (!(window as any).google?.maps) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=marker&region=GB&language=en-GB`;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Google Maps script"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !mapRef.current) return;

        const { Map: GMap } = await (window as any).google.maps.importLibrary("maps");
        const map = new GMap(mapRef.current, {
          center: { lat: 54.0, lng: -5 },
          zoom: 5,
          mapTypeId: "roadmap",
          mapId: "DEMO_MAP_ID",
        });
        mapInstanceRef.current = map;

        const geocoder = new google.maps.Geocoder();
        const bounds = new google.maps.LatLngBounds();
        let hasMarkers = false;

        // Scheduled jobs — coloured by priority
        for (const { job, engineerName, engineerId } of scheduledJobs) {
          try {
            const result = await geocoder.geocode({ address: job.address!, region: "GB", componentRestrictions: { country: "GB" } });
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

              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address!)}`;
              const posLat = pos.lat();
              const posLng = pos.lng();
              const infoWindow = new google.maps.InfoWindow({
                content: `<div style="font-family:system-ui;font-size:13px;max-width:260px">
                  <a href="/jobs/${job.id}" style="font-weight:600;color:#2563eb;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${job.reference_number}</a> — ${job.name}<br/>
                  <span style="color:#666">${(job as any).customers?.name || job.customer || ""}</span><br/>
                  <span style="color:#666">${engineerName}</span><br/>
                  <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                    <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#2563eb;color:white;border-radius:4px;text-decoration:none;font-size:12px;font-weight:500" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">📍 Directions</a>
                    <button data-save-pin data-job-id="${job.id}" data-address="${job.address?.replace(/"/g, '&quot;')}" data-lat="${posLat}" data-lng="${posLng}" data-ref-number="${job.reference_number?.replace(/"/g, '&quot;') || ""}" data-customer-name="${((job as any).customers?.name || job.customer || "").replace(/"/g, '&quot;')}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#16a34a;color:white;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:500" onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">📷 Save Pin</button>
                  </div>
                </div>`,
              });

              marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
              markersRef.current.push({ marker, engineerId });
            }
          } catch {
            // Skip failed geocodes
          }
        }

        // Unallocated jobs — grey pins
        const scheduledIds = new Set(scheduledJobs.map((s) => s.job.id));
        for (const job of unallocatedJobs) {
          if (!job.address || scheduledIds.has(job.id)) continue;
          try {
            const result = await geocoder.geocode({ address: job.address, region: "GB", componentRestrictions: { country: "GB" } });
            if (result.results[0]) {
              const pos = result.results[0].geometry.location;
              bounds.extend(pos);
              hasMarkers = true;

              const pin = new google.maps.marker.PinElement({
                background: "#9ca3af",
                borderColor: "#6b7280",
                glyphColor: "white",
                glyph: "?",
              });

              const marker = new google.maps.marker.AdvancedMarkerElement({
                map,
                position: pos,
                title: `[Unallocated] ${job.reference_number} - ${job.name}`,
                content: pin.element,
              });

              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`;
              const infoWindow = new google.maps.InfoWindow({
                content: `<div style="font-family:system-ui;font-size:13px;max-width:250px">
                  <span style="display:inline-block;padding:1px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:11px;color:#6b7280;margin-bottom:4px">Unallocated</span><br/>
                  <a href="/jobs/${job.id}" style="font-weight:600;color:#2563eb;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${job.reference_number}</a> — ${job.name}<br/>
                  <span style="color:#666">${(job as any).customers?.name || job.customer || ""}</span><br/>
                  <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 8px;background:#6b7280;color:white;border-radius:4px;text-decoration:none;font-size:12px;font-weight:500" onmouseover="this.style.background='#4b5563'" onmouseout="this.style.background='#6b7280'">📍 Get Directions</a>
                </div>`,
              });

              marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
              unallocatedMarkersRef.current.push(marker);
            }
          } catch {
            // Skip failed geocodes
          }
        }

        if (hasMarkers) {
          map.fitBounds(bounds);
          // Prevent over-zooming when there's only one or nearby markers
          google.maps.event.addListenerOnce(map, "bounds_changed", () => {
            if ((map.getZoom() ?? 0) > 10) {
              map.setZoom(10);
            }
          });
        }
        setMapLoading(false);
      } catch (err) {
        console.error("Planner map init error:", err);
        setMapError("Failed to load the map. Please try again.");
        setMapLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [scheduledJobs, unallocatedJobs]);

  // Toggle unallocated marker visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    unallocatedMarkersRef.current.forEach((m) => {
      m.map = showUnallocated ? map : null;
    });
  }, [showUnallocated]);

  // Apply engineer filter — highlight selected, dim others
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    for (const { marker, engineerId } of markersRef.current) {
      const el = marker.content as HTMLElement | null;
      if (!el) continue;

      if (selectedEngineerId === "all") {
        // Reset: restore original priority colours by removing any override
        el.style.filter = "";
        el.style.opacity = "1";
        el.style.transform = "scale(1)";
      } else if (engineerId === selectedEngineerId) {
        // Highlighted: purple tint + larger scale
        el.style.filter = `drop-shadow(0 0 6px ${ENGINEER_HIGHLIGHT})`;
        el.style.opacity = "1";
        el.style.transform = "scale(1.25)";
      } else {
        // Dimmed
        el.style.filter = "";
        el.style.opacity = "0.3";
        el.style.transform = "scale(0.9)";
      }
    }
  }, [selectedEngineerId]);

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

  // Draw live routes per engineer: from each engineer's live GPS through their remaining
  // scheduled jobs (in date order). Honours the engineer filter.
  useEffect(() => {
    const map = mapInstanceRef.current;

    // Always clear previous live routes first
    liveRouteRenderersRef.current.forEach((r) => r.setMap(null));
    liveRouteRenderersRef.current = [];

    if (!map || !showLiveRoutes || !engineerLocations.length) return;

    const palette = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#65a30d"];
    const directionsService = new google.maps.DirectionsService();

    // Group scheduled entries by engineer, sorted by date
    const byEngineer = new Map<string, typeof scheduledJobs>();
    const sortedSchedule = [...schedule].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
    for (const entry of sortedSchedule) {
      const job = getJob(entry.job_id);
      if (!job?.address) continue;
      const list = byEngineer.get(entry.engineer_id) || [];
      if (!list.find((s) => s.job.id === job.id)) {
        list.push({
          job,
          engineerName: getEngineer(entry.engineer_id)?.full_name || "",
          engineerId: entry.engineer_id,
          date: entry.schedule_date,
        });
      }
      byEngineer.set(entry.engineer_id, list);
    }

    let colourIndex = 0;
    for (const loc of engineerLocations) {
      if (selectedEngineerId !== "all" && loc.user_id !== selectedEngineerId) continue;
      const stops = byEngineer.get(loc.user_id);
      if (!stops || stops.length === 0) continue;

      const colour = palette[colourIndex % palette.length];
      colourIndex++;

      const origin = { lat: loc.latitude, lng: loc.longitude };
      const destination = stops[stops.length - 1].job.address!;
      const waypoints = stops.slice(0, -1).map((s) => ({ location: s.job.address!, stopover: true }));

      directionsService.route(
        { origin, destination, waypoints, travelMode: google.maps.TravelMode.DRIVING },
        (result, status) => {
          if (status !== google.maps.DirectionsStatus.OK || !result) return;
          const renderer = new google.maps.DirectionsRenderer({
            map,
            directions: result,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: colour, strokeWeight: 4, strokeOpacity: 0.8 },
          });
          liveRouteRenderersRef.current.push(renderer);
        }
      );
    }
  }, [showLiveRoutes, engineerLocations, schedule, jobs, engineers, selectedEngineerId]);

  const allJobsWithAddress = scheduledJobs.length + unallocatedJobs.filter((j) => j.address).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {engineerLocations.length > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              {engineerLocations.length} engineer{engineerLocations.length !== 1 ? "s" : ""} live
            </Badge>
          )}
          {routeResult && (
            <Badge variant="outline" className="text-xs">
              {routeResult.total_distance_km} km · {routeResult.total_duration_mins} mins
              {routeResult.total_duration_in_traffic_mins != null
                && routeResult.total_duration_in_traffic_mins !== routeResult.total_duration_mins && (
                  <span className="ml-1 text-amber-600 font-medium">
                    · {routeResult.total_duration_in_traffic_mins} mins live
                  </span>
                )}
            </Badge>
          )}
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded px-2 py-1">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#ef4444"}} /> High</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#f59e0b"}} /> Medium</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#10b981"}} /> Low</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#9ca3af"}} /> Unallocated</span>
            {selectedEngineerId !== "all" && (
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background: ENGINEER_HIGHLIGHT}} /> Filtered</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Engineer filter */}
          {activeEngineers.length > 0 && (
            <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="All engineers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All engineers</SelectItem>
                {activeEngineers.map((eng) => (
                  <SelectItem key={eng.user_id} value={eng.user_id}>
                    {eng.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant={showUnallocated ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowUnallocated((v) => !v)}
          >
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
            {showUnallocated ? "Hide Unallocated" : "Show Unallocated"}
          </Button>
          <Button
            variant={showLiveRoutes ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowLiveRoutes((v) => !v)}
            disabled={engineerLocations.length === 0}
            title={engineerLocations.length === 0 ? "No live engineer locations available" : "Draw routes from each engineer's live location through their scheduled jobs"}
          >
            <Route className="mr-1.5 h-3.5 w-3.5" />
            {showLiveRoutes ? "Hide Live Routes" : "Show Live Routes"}
          </Button>
          <Button
            variant={showTraffic ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowTraffic((v) => !v)}
            title="Overlay Google's live traffic conditions on the map"
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            {showTraffic ? "Hide Traffic" : "Live Traffic"}
          </Button>
          {scheduledJobs.length >= 2 && (
            <>
              <Button variant="outline" size="sm" onClick={handleOptimise} disabled={optimising}>
                {optimising ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Route className="mr-1.5 h-3.5 w-3.5" />}
                Optimise Route
              </Button>
              {directionsRendererRef.current && routeResult && (
                <Button variant="ghost" size="sm" onClick={() => { clearRouteOverlay(); setRouteResult(null); }}>
                  Clear Route
                </Button>
              )}
            </>
          )}
        </div>
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
