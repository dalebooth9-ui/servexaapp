/**
 * JobGeocodeSettings — admin tool that fills in missing job site coordinates
 * from job addresses, so GPS quick-capture can match photos to jobs.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { geocodeAddress } from "@/lib/gpsProximity";

const BATCH_SIZE = 25;

export default function JobGeocodeSettings() {
  const { userRole } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  if (userRole !== "admin") return null;

  const run = async () => {
    setRunning(true);
    setProgress("Looking for jobs without a location…");
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, address, site_latitude, site_longitude, sites(postcode)")
        .is("site_latitude", null)
        .not("status", "in", "(completed,cancelled)")
        .limit(BATCH_SIZE);
      if (error) throw error;

      const rows = (data || []).filter((j: any) => j.address || j.sites?.postcode);
      if (!rows.length) {
        setProgress("All active jobs already have a location.");
        return;
      }

      let done = 0;
      let failed = 0;
      for (const job of rows as any[]) {
        setProgress(`Locating job ${done + failed + 1} of ${rows.length}…`);
        const query = [job.address, job.sites?.postcode].filter(Boolean).join(", ");
        const coords = await geocodeAddress(query);
        if (!coords) {
          failed += 1;
          continue;
        }
        const { error: updateError } = await supabase
          .from("jobs")
          .update({ site_latitude: coords.lat, site_longitude: coords.lng })
          .eq("id", job.id);
        if (updateError) failed += 1;
        else done += 1;
        await new Promise((r) => setTimeout(r, 1100)); // be kind to the free lookup service
      }

      setProgress(`${done} job${done === 1 ? "" : "s"} located${failed ? `, ${failed} could not be matched` : ""}.`);
      toast.success(`Located ${done} job${done === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update job locations.");
      setProgress(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-4 w-4" /> Job locations
        </CardTitle>
        <CardDescription>
          Work out map coordinates for job addresses so engineers' quick photos file themselves to the
          nearest job. Runs up to {BATCH_SIZE} jobs at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {running ? "Locating jobs…" : "Locate jobs without coordinates"}
        </Button>
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      </CardContent>
    </Card>
  );
}
