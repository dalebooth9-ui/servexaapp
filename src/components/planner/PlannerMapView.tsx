import { useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

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

  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const getEngineer = (id: string) => engineers.find((e) => e.user_id === id);

  // Get unique jobs with addresses from schedule
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

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { data } = await supabase.functions.invoke("get-maps-key");
        if (cancelled || !data?.key || !mapRef.current) return;

        // Load Google Maps script
        if (!(window as any).google?.maps) {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${data.key}&libraries=marker`;
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

        // Geocode and place markers
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
      } catch {
        // Maps key not available
      }
    };

    init();
    return () => { cancelled = true; };
  }, [scheduledJobs]);

  if (scheduledJobs.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
        No scheduled jobs with addresses to show on the map.
      </div>
    );
  }

  return (
    <div ref={mapRef} className="h-[calc(100vh-280px)] min-h-[400px] rounded-lg border" />
  );
}
