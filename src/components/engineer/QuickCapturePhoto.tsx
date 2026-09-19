/**
 * QuickCapturePhoto — floating camera button for engineers.
 *
 * Takes a photo outside any job screen, works out where the engineer is, and
 * files the photo against the nearest active job site (within
 * GPS_AUTO_ASSIGN_RADIUS). When location is unavailable or nothing is close
 * enough, a searchable job picker appears instead.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, MapPin, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GPS_AUTO_ASSIGN_RADIUS,
  findNearestJob,
  formatDistance,
  geocodeAddress,
  getCurrentCoords,
  haversineDistance,
} from "@/lib/gpsProximity";

type ActiveJob = {
  id: string;
  name: string;
  reference_number: string | null;
  address: string | null;
  site_latitude: number | null;
  site_longitude: number | null;
  site_name: string | null;
  site_postcode: string | null;
};

const MAX_GEOCODES_PER_CAPTURE = 6;

function siteLabel(job: ActiveJob): string {
  return job.site_name || job.address || job.site_postcode || "No site recorded";
}

export default function QuickCapturePhoto() {
  const { user, userRole } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFilesAsSubmissions } = useFileUpload();

  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<Array<ActiveJob & { distance?: number }>>([]);
  const [search, setSearch] = useState("");

  if (userRole !== "engineer" || !user) return null;

  const loadActiveJobs = async (): Promise<ActiveJob[]> => {
    const { data: assignments } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("engineer_id", user.id);
    const jobIds = Array.from(new Set((assignments || []).map((a: any) => a.job_id).filter(Boolean)));
    if (!jobIds.length) return [];

    const { data } = await supabase
      .from("jobs")
      .select("id, name, reference_number, address, site_latitude, site_longitude, sites(name, postcode)")
      .in("id", jobIds)
      .not("status", "in", "(completed,cancelled)");

    return (data || []).map((j: any) => ({
      id: j.id,
      name: j.name,
      reference_number: j.reference_number ?? null,
      address: j.address ?? null,
      site_latitude: j.site_latitude ?? null,
      site_longitude: j.site_longitude ?? null,
      site_name: j.sites?.name ?? null,
      site_postcode: j.sites?.postcode ?? null,
    }));
  };

  /** Fill in missing site coordinates from the job address (best effort). */
  const fillMissingCoords = async (list: ActiveJob[]): Promise<ActiveJob[]> => {
    let budget = MAX_GEOCODES_PER_CAPTURE;
    const out: ActiveJob[] = [];
    for (const job of list) {
      if (job.site_latitude != null && job.site_longitude != null) {
        out.push(job);
        continue;
      }
      const query = [job.address, job.site_postcode].filter(Boolean).join(", ");
      if (!query || budget <= 0) {
        out.push(job);
        continue;
      }
      budget -= 1;
      const coords = await geocodeAddress(query);
      if (!coords) {
        out.push(job);
        continue;
      }
      // Best effort — engineers may not have permission to update the job.
      supabase
        .from("jobs")
        .update({ site_latitude: coords.lat, site_longitude: coords.lng })
        .eq("id", job.id)
        .then(() => undefined);
      out.push({ ...job, site_latitude: coords.lat, site_longitude: coords.lng });
    }
    return out;
  };

  const uploadTo = async (job: ActiveJob, file: File) => {
    const count = await uploadFilesAsSubmissions([file], job.id, user.id);
    if (count > 0) {
      toast.success(`Photo added to ${job.reference_number || job.name} — ${siteLabel(job)}`);
    }
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const active = await loadActiveJobs();
      if (!active.length) {
        toast.error("No active jobs assigned to you — nowhere to file this photo.");
        return;
      }

      const coords = await getCurrentCoords();
      if (coords) {
        const withCoords = await fillMissingCoords(active);
        const nearest = findNearestJob(coords.lat, coords.lng, withCoords);
        if (nearest && nearest.distance <= GPS_AUTO_ASSIGN_RADIUS) {
          await uploadTo(nearest.job, file);
          return;
        }
        setJobs(
          withCoords
            .map((j) => ({
              ...j,
              distance:
                j.site_latitude != null && j.site_longitude != null
                  ? haversineDistance(coords.lat, coords.lng, j.site_latitude, j.site_longitude)
                  : undefined,
            }))
            .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)),
        );
        toast.info("No job site within 500 m — pick the job for this photo.");
      } else {
        setJobs(active);
        toast.info("Location unavailable — pick the job for this photo.");
      }
      setPendingFile(file);
      setSearch("");
      setPickerOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not file that photo.");
    } finally {
      setBusy(false);
    }
  };

  const confirmPick = async (job: ActiveJob) => {
    if (!pendingFile) return;
    setBusy(true);
    try {
      await uploadTo(job, pendingFile);
      setPickerOpen(false);
      setPendingFile(null);
    } finally {
      setBusy(false);
    }
  };

  const term = search.trim().toLowerCase();
  const visible = term
    ? jobs.filter((j) =>
        [j.name, j.reference_number, j.site_name, j.address, j.site_postcode]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : jobs;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file) handleFile(file);
        }}
      />

      <Button
        type="button"
        size="icon"
        aria-label="Quick capture photo"
        title="Quick capture — files the photo to the nearest job"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg md:bottom-6"
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
      </Button>

      <Dialog open={pickerOpen} onOpenChange={(open) => { if (!busy) { setPickerOpen(open); if (!open) setPendingFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Which job is this photo for?</DialogTitle>
            <DialogDescription>
              We couldn't match your location to a job site, so choose the job yourself.
            </DialogDescription>
          </DialogHeader>

          <Input
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No matching jobs.</p>
            )}
            {visible.map((job) => (
              <div key={job.id} className="flex items-center gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {job.reference_number ? `${job.reference_number} — ` : ""}{job.name}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {siteLabel(job)}
                    {job.distance != null && <span className="ml-1">· {formatDistance(job.distance)}</span>}
                  </p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => confirmPick(job)} className="gap-1 shrink-0">
                  <Upload className="h-4 w-4" /> Upload
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
