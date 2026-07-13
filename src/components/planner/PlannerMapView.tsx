import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useLiveEngineerLocations, EngineerLocation } from "@/hooks/useLiveEngineerLocations";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Route, Loader2, MapPin, AlertTriangle, RefreshCw, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { geocodeWithGoogle } from "@/lib/geocodeCache";

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
  critical: "#7f1d1d",
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};

// Neutral fallback for jobs without a known priority (instead of grey "?" icon)
const UNKNOWN_PRIORITY_COLOR = "#3b82f6";

// Distinct highlight colour when filtering by engineer
const ENGINEER_HIGHLIGHT = "#8b5cf6";

// Build a coloured SVG pin as a data URI — works with google.maps.Marker without needing a mapId
function svgPin(color: string, opts: { size?: number; stroke?: string } = {}): google.maps.Icon {
  const size = opts.size ?? 36;
  const stroke = opts.stroke ?? "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 11.5 7.3 11.78a1 1 0 0 0 1.4 0C13 21.5 20 15.25 20 10c0-4.42-3.58-8-8-8z" fill="${color}" stroke="${stroke}" stroke-width="1.5"/><circle cx="12" cy="10" r="3" fill="${stroke}"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size),
  };
}

function svgDot(color: string, label?: string, opts: { size?: number; stroke?: string; textColor?: string } = {}): google.maps.Icon {
  const size = opts.size ?? 32;
  const stroke = opts.stroke ?? "#ffffff";
  const textColor = opts.textColor ?? "#ffffff";
  const text = label
    ? `<text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="${textColor}">${label}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="${stroke}" stroke-width="2"/>${text}</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

interface AdhocEntryLike {
  id: string;
  engineer_id: string;
  schedule_date: string | null;
  company_name: string;
  description?: string | null;
}

export default function PlannerMapView({
  schedule,
  jobs,
  engineers,
  unallocatedJobs = [],
  adhocEntries = [],
  onRouteOptimised,
  onScheduleJob,
}: {
  schedule: ScheduleEntry[];
  jobs: Job[];
  engineers: Engineer[];
  unallocatedJobs?: Job[];
  adhocEntries?: AdhocEntryLike[];
  onRouteOptimised?: (orderedJobIds: string[]) => void;
  onScheduleJob?: (jobId: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ marker: google.maps.Marker; engineerId: string; priority: string; jobId: string }[]>([]);
  const engineerMarkersRef = useRef<google.maps.Marker[]>([]);
  const unallocatedMarkersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const lastOptimisedWaypointsRef = useRef<{ address: string; job_id: string }[] | null>(null);
  const liveRoutePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const routeNumberOverlaysRef = useRef<google.maps.Marker[]>([]);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const mapsApiKeyRef = useRef<string | null>(null);
  const openInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  const onScheduleJobRef = useRef(onScheduleJob);
  useEffect(() => { onScheduleJobRef.current = onScheduleJob; }, [onScheduleJob]);
  const engineerLocations = useLiveEngineerLocations();
  const { user } = useAuth();
  const { toast } = useToast();
  const [optimising, setOptimising] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    total_distance_km?: number;
    total_duration_mins?: number;
    total_duration_in_traffic_mins?: number;
    legs?: Array<{
      distance: string;
      duration: string;
      duration_in_traffic: string | null;
      duration_in_traffic_seconds: number | null;
      start_address: string;
      end_address: string;
    }>;
    optimised?: Array<{ address: string; job_id: string }>;
  } | null>(null);
  const [routeVisible, setRouteVisible] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showUnallocated, setShowUnallocated] = useState(true);
  const showUnallocatedRef = useRef(showUnallocated);
  useEffect(() => { showUnallocatedRef.current = showUnallocated; }, [showUnallocated]);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>("all");
  const [showLiveRoutes, setShowLiveRoutes] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showTrafficSuggestion, setShowTrafficSuggestion] = useState(false);
  const optimisationRunRef = useRef(0);
  const [savingPin, setSavingPin] = useState<string | null>(null);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(0); // 0 = off
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const handleOptimiseRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>();
  const [showCompare, setShowCompare] = useState(false);
  const [markerMode, setMarkerMode] = useState<"priority" | "route">("priority");
  const [adhocNotices, setAdhocNotices] = useState<string[]>([]);

  // ---- Unit helpers (UK: display miles) ----
  const kmToMi = (km: number | null | undefined) =>
    km == null ? 0 : Math.round((km / 1.609344) * 10) / 10;
  const fmtMi = (km: number | null | undefined) => `${kmToMi(km).toFixed(1)} mi`;

  // ---- Staleness helper ----
  type LocationStatus = { status: "live" | "stale" | "offline"; label: string; tooltip: string };
  const getLocationStatus = useCallback((loc: EngineerLocation | null): LocationStatus => {
    if (!loc || !loc.updated_at) {
      return { status: "offline", label: "Location off", tooltip: "Location sharing is off — this engineer's device isn't reporting a live position" };
    }
    const ageMs = Date.now() - new Date(loc.updated_at).getTime();
    const ageMin = Math.floor(ageMs / 60000);
    if (ageMin < 5) {
      return {
        status: "live",
        label: "Location live",
        tooltip: `Sharing live location · last update ${ageMin < 1 ? "just now" : `${ageMin} min${ageMin !== 1 ? "s" : ""} ago`}`,
      };
    }
    if (ageMin <= 30) {
      return { status: "stale", label: "Location stale", tooltip: `Last location update ${ageMin} min${ageMin !== 1 ? "s" : ""} ago — may be outdated` };
    }
    const ageHr = Math.floor(ageMin / 60);
    const remMin = ageMin % 60;
    const timeAgo = ageHr > 0 ? `${ageHr}h ${remMin > 0 ? `${remMin}m` : ""}` : `${ageMin}m`;
    return { status: "offline", label: "Location off", tooltip: `Location sharing off — last update ${timeAgo} ago` };
  }, []);

  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEngineer = (id: string) => engineers.find((e) => e.user_id === id);

  // ---- Date filter (only show markers for the selected planner day) ----
  const availableDates = useMemo(() => {
    const set = new Set(schedule.map((s) => s.schedule_date));
    return Array.from(set).sort();
  }, [schedule]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [dateFilter, setDateFilter] = useState<string>("today");

  // Auto-fallback: if today isn't in the schedule, pick the earliest available date
  // so the user sees something rather than an empty map.
  useEffect(() => {
    if (availableDates.length === 0) return;
    if (dateFilter === "all") return;
    const desired = dateFilter === "today" ? todayStr : dateFilter;
    if (!availableDates.includes(desired)) {
      setDateFilter(availableDates[0]);
    }
  }, [availableDates, dateFilter, todayStr]);

  const effectiveDate = useMemo(() => {
    if (dateFilter === "all") return null;
    if (dateFilter === "today") return todayStr;
    return dateFilter;
  }, [dateFilter, todayStr]);

  // Engineers with jobs on the currently visible day (drives the engineer dropdown)
  const activeEngineers = useMemo(() => {
    const ids = new Set(
      schedule
        .filter((s) => !effectiveDate || s.schedule_date === effectiveDate)
        .map((s) => s.engineer_id),
    );
    return engineers.filter((e) => ids.has(e.user_id));
  }, [schedule, engineers, effectiveDate]);

  // Reset engineer filter if the selected engineer has no jobs on the new day
  useEffect(() => {
    setSelectedEngineerId((prev) => {
      if (prev === "all") return prev;
      return activeEngineers.some((e) => e.user_id === prev) ? prev : "all";
    });
  }, [activeEngineers]);

  const scheduledJobs = useMemo(() => {
    const seen = new Set<string>();
    const result: { job: Job; engineerName: string; engineerId: string; date: string }[] = [];
    for (const entry of schedule) {
      if (effectiveDate && entry.schedule_date !== effectiveDate) continue;
      if (selectedEngineerId !== "all" && entry.engineer_id !== selectedEngineerId) continue;
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
  }, [schedule, jobs, engineers, effectiveDate, selectedEngineerId]);

  // Clear any existing route line from the map
  const clearRouteOverlay = useCallback(() => {
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
    // Remove numbered step labels
    routeNumberOverlaysRef.current.forEach((m) => { m.setMap(null); });
    routeNumberOverlaysRef.current = [];
    lastOptimisedWaypointsRef.current = null;
    setRouteVisible(false);
    setMarkerMode("priority");
  }, []);

  const invokeRouteOptimiser = useCallback(async (params: {
    waypoints: { address: string; job_id: string }[];
    origin?: { lat: number; lng: number } | { address: string } | null;
    optimize?: boolean;
  }) => {
    const { data: fnData, error: fnError } = await supabase.functions.invoke("optimize-route", {
      body: params,
    });
    if (fnError) {
      let detail = fnError.message || "Unknown error";
      try {
        const ctx: any = (fnError as any).context;
        if (ctx?.text) {
          const raw = await ctx.text();
          const parsed = JSON.parse(raw);
          detail = parsed?.message || parsed?.error || raw || detail;
        }
      } catch { /* ignore */ }
      throw new Error(detail);
    }
    if (!fnData || !fnData.optimised) {
      throw new Error("Route optimiser returned no data");
    }
    return fnData as {
      optimised: { address: string; job_id: string }[];
      legs: any[];
      total_distance_km: number;
      total_duration_mins: number;
      total_duration_in_traffic_mins: number | null;
      encoded_polyline?: string | null;
    };
  }, []);

  // Render the optimised route as a polyline on the map, using the encoded
  // polyline returned by the Routes API edge function.
  const renderRouteOnMap = useCallback(async (
    optimisedWaypoints: { address: string; job_id: string }[],
    encodedPolyline: string | null,
  ) => {
    const map = mapInstanceRef.current;
    if (!map || optimisedWaypoints.length < 2 || !encodedPolyline) return;

    clearRouteOverlay();

    try {
      // Ensure the geometry library is loaded (script URL includes libraries=geometry
      // but importLibrary makes it awaitable on modern loaders).
      const geometry: any = (google.maps as any).geometry
        ?? (await (google.maps as any).importLibrary?.("geometry"));
      const decode = geometry?.encoding?.decodePath ?? (google.maps as any).geometry?.encoding?.decodePath;
      if (!decode) {
        console.warn("Google Maps geometry library not available; cannot draw route polyline.");
        return;
      }
      const path = decode(encodedPolyline);
      const polyline = new google.maps.Polyline({
        map,
        path,
        strokeColor: "#2563eb",
        strokeWeight: 5,
        strokeOpacity: 0.85,
      });
      routePolylineRef.current = polyline;
      lastOptimisedWaypointsRef.current = optimisedWaypoints;
      setRouteVisible(true);
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
  const handleOptimise = async (opts?: { silent?: boolean }) => {
    if (scheduledJobs.length < 2) {
      if (!opts?.silent) {
        toast({
          title: "Need at least 2 stops to optimise",
          description: effectiveDate
            ? `No routeable jobs on ${effectiveDate}${selectedEngineerId !== "all" ? " for this engineer" : ""}. Change the date filter or add more stops.`
            : "Add at least two scheduled jobs with addresses to optimise a route.",
          variant: "destructive",
        });
      }
      return;
    }
    setOptimising(true);
    clearRouteOverlay();
    setAdhocNotices([]);
    try {
      const allWaypoints = scheduledJobs.map((s) => ({ address: s.job.address!, job_id: s.job.id }));

      // Adhoc time-block awareness (table has no start_time/end_time — fallback warning only)
      const datesInRoute = new Set(scheduledJobs.map((s) => s.date));
      const engineerIdsInRoute = new Set(
        selectedEngineerId && selectedEngineerId !== "all"
          ? [selectedEngineerId]
          : scheduledJobs.map((s) => s.engineerId),
      );
      const relevantAdhoc = adhocEntries.filter(
        (a) => a.schedule_date && datesInRoute.has(a.schedule_date) && engineerIdsInRoute.has(a.engineer_id),
      );
      const notices = relevantAdhoc.map((a) => {
        const engName = engineers.find((e) => e.user_id === a.engineer_id)?.full_name || "Engineer";
        const title = a.company_name || a.description || "non-job entry";
        return `Note: ${engName} has a non-job entry on ${a.schedule_date} (${title}). Check the schedule before confirming this route.`;
      });
      if (notices.length) {
        setAdhocNotices(notices);
        if (!opts?.silent) {
          toast({ title: "Schedule conflict possible", description: notices[0] });
        }
      }

      // Guard: Google Directions allows at most 10 intermediate waypoints (~12 total stops)
      const MAX_STOPS = 12;
      let waypoints = allWaypoints;
      let overflowJobIds: string[] = [];
      if (allWaypoints.length > MAX_STOPS) {
        waypoints = allWaypoints.slice(0, MAX_STOPS);
        overflowJobIds = allWaypoints.slice(MAX_STOPS).map((w) => w.job_id);
        toast({
          title: "Too many stops",
          description: "Route optimisation works best with up to 12 stops. Showing optimised order for the first 12 — drag to reorder the rest.",
        });
      }

      // Determine origin: live GPS > engineer home/depot address > null
      let origin: { lat: number; lng: number } | { address: string } | null = null;
      if (selectedEngineerId && selectedEngineerId !== "all") {
        const liveLoc = engineerLocations.find((l) => l.user_id === selectedEngineerId);
        if (liveLoc) {
          origin = { lat: liveLoc.latitude, lng: liveLoc.longitude };
        } else {
          const eng = engineers.find((e) => e.user_id === selectedEngineerId) as any;
          const homeAddr = eng?.home_address || eng?.depot_address || eng?.address;
          if (homeAddr) origin = { address: homeAddr };
        }
      }

      // Server-side optimisation via the Routes API edge function.
      // Uses GOOGLE_MAPS_SERVER_KEY (non-referer-restricted) so it works even
      // on newly-created Google Cloud projects that can't use the legacy
      // legacy Maps JS client-side routing.
      let data: {
        optimised: { address: string; job_id: string }[];
        legs: any[];
        total_distance_km: number;
        total_duration_mins: number;
        total_duration_in_traffic_mins: number | null;
        encoded_polyline?: string | null;
      };
      try {
        data = await invokeRouteOptimiser({ waypoints, origin, optimize: true });
      } catch (err: any) {
        console.error("Route optimisation failed:", err);
        toast({
          title: "Route optimisation failed",
          description: `Routes API error: ${err?.message || "UNKNOWN"}`,
          variant: "destructive",
        });
        setOptimising(false);
        return;
      }

      setRouteResult(data);
      const trafficMins = data.total_duration_in_traffic_mins ?? data.total_duration_mins;
      const baseMins = data.total_duration_mins;
      const trafficSuffix = trafficMins != null && baseMins != null && trafficMins !== baseMins
        ? ` (${trafficMins} mins with live traffic)`
        : "";
      toast({ title: "Route optimised", description: `${fmtMi(data.total_distance_km)} — ${baseMins} mins${trafficSuffix}` });

      // Notify parent of optimised job order (append any overflow stops at the end)
      if (data.optimised?.length >= 2) {
        const optimisedIds = data.optimised.map((wp: any) => wp.job_id);
        onRouteOptimised?.([...optimisedIds, ...overflowJobIds]);
      }

      // Draw optimised route on map (uses the encoded polyline from Routes API)
      if (data.optimised?.length >= 2) {
        await renderRouteOnMap(data.optimised, data.encoded_polyline ?? null);
        setMarkerMode("route");

        // Show one-time traffic suggestion (skip on auto-refresh)
        if (!opts?.silent) {
          optimisationRunRef.current += 1;
          setShowTrafficSuggestion(true);
        }

        // Add numbered step labels to markers
        const map = mapInstanceRef.current;
        if (map) {
          for (let i = 0; i < data.optimised.length; i++) {
            const wp = data.optimised[i];
            try {
              const pos = await geocodeWithGoogle(wp.address);
              if (!pos) continue;

              const overlay = new google.maps.Marker({
                map,
                position: pos,
                icon: svgDot("#2563eb", String(i + 1), { size: 28, stroke: "#ffffff" }),
                zIndex: 1000 + i,
                clickable: false,
                optimized: false,
              });
              routeNumberOverlaysRef.current.push(overlay);
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      console.error("Route optimisation error:", err);
      toast({
        title: "Route optimisation failed",
        description: err instanceof Error ? err.message : "Something went wrong contacting the routing service.",
        variant: "destructive",
      });
    }
    setOptimising(false);
    setLastRefreshAt(new Date());
  };

  // Keep latest handleOptimise in a ref so the interval effect doesn't re-subscribe on every render
  useEffect(() => {
    handleOptimiseRef.current = handleOptimise;
  });

  // Refresh the traffic layer (force Google to re-render current congestion tiles)
  const refreshTrafficLayer = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !trafficLayerRef.current) return;
    trafficLayerRef.current.setMap(null);
    trafficLayerRef.current.setMap(map);
  }, []);

  // Manual refresh: re-pull live traffic and re-optimise the route
  const handleRefreshNow = useCallback(async () => {
    refreshTrafficLayer();
    if (scheduledJobs.length >= 2 && !optimising) {
      await handleOptimiseRef.current?.({ silent: true });
    } else {
      setLastRefreshAt(new Date());
    }
  }, [refreshTrafficLayer, scheduledJobs.length, optimising]);

  // Auto-refresh on the user's chosen interval
  useEffect(() => {
    if (refreshIntervalSec <= 0) return;
    const id = window.setInterval(() => {
      refreshTrafficLayer();
      if (scheduledJobs.length >= 2) {
        handleOptimiseRef.current?.({ silent: true });
      } else {
        setLastRefreshAt(new Date());
      }
    }, refreshIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [refreshIntervalSec, refreshTrafficLayer, scheduledJobs.length]);

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
            script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=geometry&region=GB&language=en-GB`;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Google Maps script"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !mapRef.current) return;

        const { Map: GMap } = await (window as any).google.maps.importLibrary("maps");
        // Ensure geometry library (for polyline decoding) is available
        try { await (window as any).google.maps.importLibrary("geometry"); } catch { /* already loaded via script tag */ }
        // Default view: whole UK. fitBounds below will re-frame once markers geocode.
        const UK_CENTER = { lat: 54.5, lng: -2.5 };
        const map = new GMap(mapRef.current, {
          center: UK_CENTER,
          zoom: 6,
          mapTypeId: "roadmap",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          restriction: {
            latLngBounds: { north: 61, south: 49, west: -11, east: 3 },
            strictBounds: false,
          },
        });
        mapInstanceRef.current = map;

        const bounds = new google.maps.LatLngBounds();
        let hasMarkers = false;

        // Scheduled jobs — coloured by priority
        for (const { job, engineerName, engineerId } of scheduledJobs) {
          try {
            const pos = await geocodeWithGoogle(job.address!);
            if (pos) {
              bounds.extend(pos);
              hasMarkers = true;

              const pinColor = PRIORITY_PIN[(job.priority || "").toLowerCase()] || UNKNOWN_PRIORITY_COLOR;
              const marker = new google.maps.Marker({
                position: pos,
                title: `${job.reference_number} — ${job.name}`,
                icon: svgPin(pinColor),
              });

              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address!)}`;
              const posLat = pos.lat;
              const posLng = pos.lng;
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

              marker.addListener("click", () => {
                openInfoWindowRef.current?.close();
                infoWindow.open({ anchor: marker, map });
                openInfoWindowRef.current = infoWindow;
              });
              markersRef.current.push({ marker, engineerId, priority: job.priority, jobId: job.id });
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
            const pos = await geocodeWithGoogle(job.address);
            if (pos) {
              bounds.extend(pos);
              hasMarkers = true;

              // Fall back to priority colour, then to neutral blue (no "?" icon)
              const unallocPriority = (job.priority || "").toLowerCase();
              const unallocColor = PRIORITY_PIN[unallocPriority] || UNKNOWN_PRIORITY_COLOR;
              const marker = new google.maps.Marker({
                position: pos,
                title: `[Unallocated] ${job.reference_number} — ${job.name}`,
                icon: svgPin(unallocColor, { stroke: "#e5e7eb" }),
                opacity: 0.85,
              });


              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`;
              const siteName = (job as any).sites?.name || (job as any).site?.name || "";
              const customerName = (job as any).customers?.name || job.customer || "";
              const priority = (job.priority || "").toLowerCase();
              const priorityColors: Record<string, { bg: string; fg: string }> = {
                critical: { bg: "#7f1d1d", fg: "#fff" },
                high:     { bg: "#fee2e2", fg: "#991b1b" },
                medium:   { bg: "#fef3c7", fg: "#92400e" },
                low:      { bg: "#dcfce7", fg: "#166534" },
              };
              const pc = priorityColors[priority] || { bg: "#f3f4f6", fg: "#374151" };
              const priorityBadge = job.priority
                ? `<span style="display:inline-block;padding:1px 6px;background:${pc.bg};color:${pc.fg};border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em">${job.priority}</span>`
                : "";
              const safeAddr = (job.address || "").replace(/</g, "&lt;");
              const infoWindow = new google.maps.InfoWindow({
                content: `<div style="font-family:system-ui;font-size:13px;max-width:280px">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <span style="display:inline-block;padding:1px 6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:10px;color:#6b7280;font-weight:600">UNALLOCATED</span>
                    ${priorityBadge}
                  </div>
                  <a href="/jobs/${job.id}" style="font-weight:600;color:#2563eb;text-decoration:none">${job.reference_number}</a> — ${job.name}<br/>
                  ${siteName ? `<div style="color:#374151;margin-top:2px"><strong>${siteName}</strong></div>` : ""}
                  <div style="color:#6b7280;font-size:12px">${safeAddr}</div>
                  ${customerName ? `<div style="color:#6b7280;font-size:12px;margin-top:2px">${customerName}</div>` : ""}
                  <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
                    <button data-schedule-job-id="${job.id}" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#2563eb;color:white;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:600">📅 Schedule this job</button>
                    <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:5px 8px;background:#6b7280;color:white;border-radius:4px;text-decoration:none;font-size:12px;font-weight:500">📍 Directions</a>
                  </div>
                </div>`,
              });

              marker.addListener("click", () => {
                openInfoWindowRef.current?.close();
                infoWindow.open({ anchor: marker, map });
                openInfoWindowRef.current = infoWindow;
                google.maps.event.addListenerOnce(infoWindow, "domready", () => {
                  const btn = document.querySelector(`[data-schedule-job-id="${job.id}"]`) as HTMLButtonElement | null;
                  if (btn) {
                    btn.addEventListener("click", () => {
                      infoWindow.close();
                      openInfoWindowRef.current = null;
                      onScheduleJobRef.current?.(job.id);
                    }, { once: true });
                  }
                });
              });
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

        // Cluster scheduled markers always; unallocated only when the filter allows it.
        // Reading from the ref ensures re-runs of this init (e.g. after a background
        // refetch) don't ignore a "hidden" toggle that was set before the refetch.
        const visibleUnallocated = showUnallocatedRef.current ? unallocatedMarkersRef.current : [];
        // Hard-detach the ones we're not showing so they aren't rendered outside the clusterer
        if (!showUnallocatedRef.current) {
          unallocatedMarkersRef.current.forEach((m) => m.setMap(null));
        }
        const allJobMarkers = [
          ...markersRef.current.map((m) => m.marker),
          ...visibleUnallocated,
        ];
        if (allJobMarkers.length > 0) {
          clustererRef.current = new MarkerClusterer({ map, markers: allJobMarkers });
        }

        setMapLoading(false);
      } catch (err) {
        console.error("Planner map init error:", err);
        setMapError("Failed to load the map. Please try again.");
        setMapLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
      // Tear down everything created by this init to avoid leaks / locked refresh loops
      clustererRef.current?.clearMarkers();
      clustererRef.current = null;
      markersRef.current.forEach((m) => m.marker.setMap(null));
      markersRef.current = [];
      unallocatedMarkersRef.current.forEach((m) => m.setMap(null));
      unallocatedMarkersRef.current = [];
      routeNumberOverlaysRef.current.forEach((m) => m.setMap(null));
      routeNumberOverlaysRef.current = [];
      engineerMarkersRef.current.forEach((m) => m.setMap(null));
      engineerMarkersRef.current = [];
      liveRoutePolylinesRef.current.forEach((r) => r.setMap(null));
      liveRoutePolylinesRef.current = [];
      trafficLayerRef.current?.setMap(null);
      trafficLayerRef.current = null;
      openInfoWindowRef.current?.close();
      openInfoWindowRef.current = null;
    };
  }, [scheduledJobs, unallocatedJobs]);

  // Toggle unallocated marker visibility — keep clusterer in sync so a background
  // refetch that rebuilds the clusterer inherits the correct visible set.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = unallocatedMarkersRef.current;
    if (markers.length === 0) return;
    if (showUnallocated) {
      markers.forEach((m) => m.setMap(map));
      clustererRef.current?.addMarkers(markers, /* noDraw */ false);
    } else {
      clustererRef.current?.removeMarkers(markers, /* noDraw */ false);
      markers.forEach((m) => m.setMap(null));
    }
  }, [showUnallocated, scheduledJobs, unallocatedJobs]);

  // Apply marker mode (priority colours vs route-order numbered pins) + engineer filter
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const optimisedOrder = routeResult?.optimised?.map((w) => w.job_id) ?? [];

    for (const entry of markersRef.current) {
      const { marker, engineerId, priority, jobId } = entry;

      if (markerMode === "route") {
        const idx = optimisedOrder.indexOf(jobId);
        marker.setIcon(svgDot("#64748b", idx >= 0 ? String(idx + 1) : "•", { size: 30 }));
      } else {
        const pinColor = PRIORITY_PIN[(priority || "").toLowerCase()] || UNKNOWN_PRIORITY_COLOR;
        marker.setIcon(svgPin(pinColor));
      }

      // Engineer-filter dim / highlight via marker opacity + zIndex
      if (selectedEngineerId === "all") {
        marker.setOpacity(1);
        marker.setZIndex(undefined as any);
      } else if (engineerId === selectedEngineerId) {
        marker.setOpacity(1);
        marker.setZIndex(999);
      } else {
        marker.setOpacity(0.25);
        marker.setZIndex(undefined as any);
      }
    }

    routeNumberOverlaysRef.current.forEach((m) => {
      m.setMap(markerMode === "route" ? null : mapInstanceRef.current);
    });
  }, [markerMode, selectedEngineerId, routeResult, scheduledJobs]);

  // Reset to priority mode whenever the visible schedule changes
  useEffect(() => {
    setMarkerMode("priority");
    setRouteResult(null);
  }, [scheduledJobs]);

  // Update engineer live pins
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !engineerLocations.length) return;

    engineerMarkersRef.current.forEach((m) => m.setMap(null));
    engineerMarkersRef.current = [];

    for (const loc of engineerLocations) {
      const eng = getEngineer(loc.user_id);
      if (!eng) continue;

      const { status, tooltip } = getLocationStatus(loc);
      const baseColor = status === "live" ? "#3b82f6" : status === "stale" ? "#8b9dc3" : "#9ca3af";
      const initial = eng.full_name.charAt(0).toUpperCase();

      const marker = new google.maps.Marker({
        map,
        position: { lat: loc.latitude, lng: loc.longitude },
        title: tooltip,
        icon: svgDot(baseColor, initial, { size: 36, stroke: "#ffffff" }),
        opacity: status === "offline" ? 0.7 : status === "stale" ? 0.85 : 1,
        zIndex: 500,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:system-ui;font-size:13px;max-width:220px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:white;background:${status === "live" ? "#3b82f6" : status === "stale" ? "#f59e0b" : "#6b7280"}">${status}</span>
            <strong>${eng.full_name}</strong>
          </div>
          <div style="color:#666;font-size:12px">${tooltip}</div>
          ${loc.speed ? `<div style="color:#666;font-size:12px">Speed: ${Math.round(loc.speed * 3.6)} km/h</div>` : ""}
        </div>`,
      });
      marker.addListener("click", () => {
        openInfoWindowRef.current?.close();
        infoWindow.open({ anchor: marker, map });
        openInfoWindowRef.current = infoWindow;
      });
      engineerMarkersRef.current.push(marker);
    }
  }, [engineerLocations, engineers, getLocationStatus]);

  // Draw live routes per engineer via the Routes API edge function, never the
  // deprecated Maps JS routing. Honours the engineer filter.
  useEffect(() => {
    const map = mapInstanceRef.current;

    // Always clear previous live routes first
    liveRoutePolylinesRef.current.forEach((r) => r.setMap(null));
    liveRoutePolylinesRef.current = [];

    if (!map || !showLiveRoutes || !engineerLocations.length) return;

    const palette = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#65a30d"];

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

    let cancelled = false;
    const drawLiveRoutes = async () => {
      let colourIndex = 0;
      for (const loc of engineerLocations) {
        if (cancelled) return;
        if (selectedEngineerId !== "all" && loc.user_id !== selectedEngineerId) continue;
        const stops = byEngineer.get(loc.user_id);
        if (!stops || stops.length === 0) continue;

        const waypoints = stops.map((s) => ({ address: s.job.address!, job_id: s.job.id }));
        if (waypoints.length < 1) continue;

        const colour = palette[colourIndex % palette.length];
        colourIndex++;

        try {
          const result = await invokeRouteOptimiser({
            waypoints,
            origin: { lat: loc.latitude, lng: loc.longitude },
            optimize: false,
          });
          if (cancelled || !result.encoded_polyline) continue;

          const geometry: any = (google.maps as any).geometry
            ?? (await (google.maps as any).importLibrary?.("geometry"));
          const decode = geometry?.encoding?.decodePath ?? (google.maps as any).geometry?.encoding?.decodePath;
          if (!decode) throw new Error("Google Maps geometry library unavailable");

          const polyline = new google.maps.Polyline({
            map,
            path: decode(result.encoded_polyline),
            strokeColor: colour,
            strokeWeight: 4,
            strokeOpacity: 0.8,
          });
          liveRoutePolylinesRef.current.push(polyline);
        } catch (err: any) {
          console.error("Live route drawing failed:", err);
          toast({
            title: "Live route failed",
            description: `Routes API error: ${err?.message || "UNKNOWN"}`,
            variant: "destructive",
          });
        }
      }
    };

    void drawLiveRoutes();
    return () => {
      cancelled = true;
      liveRoutePolylinesRef.current.forEach((r) => r.setMap(null));
      liveRoutePolylinesRef.current = [];
    };
  }, [showLiveRoutes, engineerLocations, schedule, jobs, engineers, selectedEngineerId, invokeRouteOptimiser, toast]);

  const allJobsWithAddress = scheduledJobs.length + unallocatedJobs.filter((j) => j.address).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {engineerLocations.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {engineerLocations.map((loc) => {
                const eng = getEngineer(loc.user_id);
                if (!eng) return null;
                const { status, label, tooltip } = getLocationStatus(loc);
                const dotColor = status === "live" ? "bg-blue-500" : status === "stale" ? "bg-amber-500" : "bg-gray-500";
                const pulse = status === "live" ? "animate-pulse" : "";
                return (
                  <Badge key={loc.user_id} variant="secondary" title={tooltip} className="text-[11px] gap-1 px-1.5 py-0.5 cursor-help">
                    <span className={`inline-block h-2 w-2 rounded-full ${dotColor} ${pulse}`} />
                    <span className="truncate max-w-[120px]">{eng.full_name}</span>
                    <span className={`text-[10px] font-medium ${status === "live" ? "text-blue-600 dark:text-blue-400" : status === "stale" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>· {label}</span>
                  </Badge>
                );
              })}
            </div>
          )}
          {routeResult && (
            <Badge variant="outline" className="text-xs">
              {fmtMi(routeResult.total_distance_km)} · {routeResult.total_duration_mins} mins
              {routeResult.total_duration_in_traffic_mins != null
                && routeResult.total_duration_in_traffic_mins !== routeResult.total_duration_mins && (
                  <span className="ml-1 text-amber-600 font-medium">
                    · {routeResult.total_duration_in_traffic_mins} mins live
                  </span>
                )}
            </Badge>
          )}
          {/* Marker mode toggle */}
          <div className="inline-flex items-center rounded border text-xs overflow-hidden">
            <span className="px-2 py-1 text-muted-foreground bg-muted/30">Markers:</span>
            <button
              type="button"
              onClick={() => setMarkerMode("priority")}
              className={`px-2 py-1 transition-colors ${markerMode === "priority" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              Priority colours
            </button>
            <button
              type="button"
              onClick={() => setMarkerMode("route")}
              disabled={!routeResult}
              className={`px-2 py-1 transition-colors ${markerMode === "route" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"}`}
              title={!routeResult ? "Optimise a route first" : "Show numbered route order"}
            >
              Route order
            </button>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded px-2 py-1">
            {markerMode === "priority" ? (
              <>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#ef4444"}} /> High</span>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#f59e0b"}} /> Medium</span>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#10b981"}} /> Low</span>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background:"#9ca3af"}} /> Unallocated</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{background:"#64748b"}}>1</span> Numbers = optimised stop order</span>
              </>
            )}
            {selectedEngineerId !== "all" && (
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{background: ENGINEER_HIGHLIGHT}} /> Filtered</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Traffic suggestion banner */}
          {showTrafficSuggestion && (
            <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm animate-in fade-in slide-in-from-top-1">
              <span className="font-medium">Route optimised ✓</span>
              <span className="text-muted-foreground">— turn on traffic layer to check conditions?</span>
              <Button
                variant="default"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => {
                  setShowTraffic(true);
                  setShowTrafficSuggestion(false);
                }}
              >
                Show Traffic
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground px-2"
                onClick={() => setShowTrafficSuggestion(false)}
              >
                No thanks
              </Button>
            </div>
          )}
          {/* Date filter — only show markers/route for the selected planner day */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-9 w-[170px] text-xs">
              <Calendar className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today ({todayStr})</SelectItem>
              <SelectItem value="all">All dates in view</SelectItem>
              {availableDates.map((d) => (
                <SelectItem key={d} value={d}>
                  {format(new Date(d + "T00:00:00"), "EEE d MMM yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Engineer filter */}
          {activeEngineers.length > 0 && (
            <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="All engineers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All engineers</SelectItem>
                {activeEngineers.map((eng) => {
                  const loc = engineerLocations.find((l) => l.user_id === eng.user_id);
                  const { status, label } = getLocationStatus(loc ?? null);
                  const dotColor = status === "live" ? "bg-blue-500" : status === "stale" ? "bg-amber-500" : "bg-gray-500";
                  return (
                    <SelectItem key={eng.user_id} value={eng.user_id}>
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
                        {eng.full_name}
                        <span className={`text-[10px] font-semibold ml-auto ${status === "live" ? "text-blue-500" : status === "stale" ? "text-amber-500" : "text-gray-500"}`}>{label}</span>
                      </span>
                    </SelectItem>
                  );
                })}
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
          <Button
            variant={showCompare ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowCompare((v) => !v)}
            disabled={!routeResult}
            title={!routeResult ? "Optimise a route first to compare" : "Show a side-by-side stats panel comparing live traffic vs no-traffic ETAs"}
          >
            <Route className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
            {showCompare ? "Hide Comparison" : "Compare Traffic"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshNow}
            disabled={optimising}
            title={lastRefreshAt ? `Last refreshed ${lastRefreshAt.toLocaleTimeString()}` : "Re-pull live traffic and re-optimise the route"}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${optimising ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Select
            value={String(refreshIntervalSec)}
            onValueChange={(v) => setRefreshIntervalSec(Number(v))}
          >
            <SelectTrigger className="h-9 w-[130px] text-xs" title="Auto-refresh interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Auto-refresh: Off</SelectItem>
              <SelectItem value="30">Every 30s</SelectItem>
              <SelectItem value="60">Every 1 min</SelectItem>
              <SelectItem value="120">Every 2 min</SelectItem>
              <SelectItem value="300">Every 5 min</SelectItem>
              <SelectItem value="600">Every 10 min</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOptimise()}
            disabled={optimising || scheduledJobs.length < 2}
            title={scheduledJobs.length < 2 ? "Need at least 2 scheduled stops on this day to optimise" : "Optimise the route for this day's stops"}
          >
            {optimising ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Route className="mr-1.5 h-3.5 w-3.5" />}
            Optimise Route
          </Button>
          {routeVisible && routeResult && (
            <Button variant="ghost" size="sm" onClick={() => { clearRouteOverlay(); setRouteResult(null); }}>
              Clear Route
            </Button>
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
        {showCompare && routeResult && (() => {
          const parseMins = (s: string) => {
            const h = /(\d+)\s*hour/.exec(s);
            const m = /(\d+)\s*min/.exec(s);
            return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
          };
          const fmt = (mins: number) => {
            if (mins < 60) return `${mins}m`;
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return m ? `${h}h ${m}m` : `${h}h`;
          };
          const legs = routeResult.legs ?? [];
          const hasTraffic = legs.some((l) => l.duration_in_traffic_seconds != null);
          const totalLive = routeResult.total_duration_in_traffic_mins ?? routeResult.total_duration_mins ?? 0;
          const totalBase = routeResult.total_duration_mins ?? 0;
          const extra = totalLive - totalBase;
          // Find worst leg by delta
          const legDeltas = legs.map((l) => {
            const base = parseMins(l.duration);
            const live = l.duration_in_traffic_seconds != null ? Math.round(l.duration_in_traffic_seconds / 60) : parseMins(l.duration_in_traffic ?? l.duration);
            return { base, live, delta: live - base };
          });
          const worstIdx = legDeltas.length
            ? legDeltas.reduce((maxI, cur, i, arr) => (cur.delta > arr[maxI].delta ? i : maxI), 0)
            : -1;
          const worstDelta = worstIdx >= 0 ? legDeltas[worstIdx].delta : 0;
          return (
            <div className="absolute bottom-3 left-3 z-20 w-[min(420px,calc(100%-1.5rem))] rounded-lg border bg-card/95 backdrop-blur shadow-lg animate-in fade-in slide-in-from-left-2">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-semibold">Traffic comparison</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCompare(false)}
                >
                  ✕
                </button>
              </div>
              {!hasTraffic ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  Traffic comparison not available — run optimisation again during peak hours.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 divide-x text-xs">
                    <div className="px-3 py-2">
                      <div className="font-medium text-muted-foreground mb-1">With Traffic</div>
                      <div className="font-semibold">Total: {fmt(totalLive)}</div>
                      <div className="text-muted-foreground">Distance: {fmtMi(routeResult.total_distance_km)}</div>
                      {extra > 0 && (
                        <div className="text-amber-600 font-medium mt-1">Extra in traffic: +{fmt(extra)}</div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <div className="font-medium text-muted-foreground mb-1">Without Traffic</div>
                      <div className="font-semibold">Total: {fmt(totalBase)}</div>
                      <div className="text-muted-foreground">Distance: {fmtMi(routeResult.total_distance_km)}</div>
                    </div>
                  </div>
                  <ol className="divide-y max-h-48 overflow-auto text-xs border-t">
                    {legDeltas.map((d, i) => {
                      const isWorst = i === worstIdx && worstDelta > 0;
                      return (
                        <li
                          key={i}
                          className={`px-3 py-1.5 flex items-center justify-between ${isWorst ? "bg-amber-500/15" : ""}`}
                        >
                          <span className="text-muted-foreground">
                            Leg {i + 1}→{i + 2}
                            {isWorst && (
                              <span className="ml-1.5 text-amber-600 font-semibold">⚠ worst delay</span>
                            )}
                          </span>
                          <span className="whitespace-nowrap">
                            {fmt(d.live)}
                            {d.delta !== 0 && (
                              <span className={`ml-1 ${d.delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                ({d.delta > 0 ? `+${d.delta}` : d.delta}m in traffic)
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </div>
          );
        })()}
      </div>
      {adhocNotices.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          {adhocNotices.map((n, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>⚠️ {n}</span>
            </div>
          ))}
        </div>
      )}
      {routeResult?.legs && routeResult.legs.length > 0 && (
        <div className="rounded-lg border bg-card">
          {(() => {
            const fmtMins = (mins: number) => {
              if (!mins) return "0m";
              if (mins < 60) return `${mins}m`;
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return m ? `${h}h ${m}m` : `${h}h`;
            };
            const legCount = routeResult.legs.length;
            const stopCount = routeResult.optimised?.length ?? legCount + 1;
            const totalBase = routeResult.total_duration_mins ?? 0;
            const totalLive = routeResult.total_duration_in_traffic_mins ?? totalBase;
            const avg = legCount ? Math.round(totalBase / legCount) : 0;
            const extra = totalLive - totalBase;
            return (
              <div className="px-3 py-3 border-b bg-muted/30 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total distance</div>
                  <div className="text-sm font-semibold">{routeResult.total_distance_km} km</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total time</div>
                  <div className="text-sm font-semibold">
                    {fmtMins(totalBase)}
                    {extra > 0 && (
                      <span className="ml-1 text-amber-600 font-medium">· {fmtMins(totalLive)} live</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stops · legs</div>
                  <div className="text-sm font-semibold">{stopCount} · {legCount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg per leg</div>
                  <div className="text-sm font-semibold">{fmtMins(avg)}</div>
                </div>
              </div>
            );
          })()}
          <div className="px-3 py-2 border-b flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Route legs · baseline vs live traffic</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60" /> Baseline</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Live</span>
            </span>
          </div>
          <ol className="divide-y max-h-56 overflow-auto text-sm">
            {routeResult.legs.map((leg, i) => {
              const baselineSec = (() => {
                // duration is text like "12 mins"; we have no seconds — derive from total when possible
                return null;
              })();
              const liveText = leg.duration_in_traffic ?? leg.duration;
              const baseText = leg.duration;
              const liveSec = leg.duration_in_traffic_seconds;
              // Parse baseline mins from "X mins" / "X hours Y mins"
              const parseMins = (s: string) => {
                const h = /(\d+)\s*hour/.exec(s);
                const m = /(\d+)\s*min/.exec(s);
                return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
              };
              const baseMins = parseMins(baseText);
              const liveMins = liveSec != null ? Math.round(liveSec / 60) : parseMins(liveText);
              const delta = liveMins - baseMins;
              const fromJob = routeResult.optimised?.[i];
              const toJob = routeResult.optimised?.[i + 1];
              const label = (addr: string, job?: { job_id: string }) => {
                const j = job ? jobs.find((x) => x.id === job.job_id) : undefined;
                return j?.reference_number || j?.name || addr.split(",").slice(0, 2).join(",");
              };
              return (
                <li key={i} className="px-3 py-2 grid grid-cols-[24px_minmax(0,1fr)_auto] gap-2 items-center">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs">
                      <span className="font-medium">{label(leg.start_address, fromJob)}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="font-medium">{label(leg.end_address, toJob)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{leg.distance}</div>
                  </div>
                  <div className="text-right text-xs whitespace-nowrap">
                    <span className="text-muted-foreground">{baseText}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="font-semibold text-amber-600">{liveText}</span>
                    {!!delta && (
                      <span className={`ml-1 text-[11px] font-medium ${delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        ({delta > 0 ? `+${delta}` : delta}m)
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
