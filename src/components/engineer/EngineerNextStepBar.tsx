import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play, ShieldCheck, ClipboardList, Camera, PenLine, Truck, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useJobRamsStatus } from "@/hooks/useJobRamsStatus";
import { useJobPhotoCount } from "@/hooks/useJobPhotoCount";
import VehicleCheckSheet from "@/components/VehicleCheckSheet";

type Props = {
  jobId: string;
  jobStatus: string;
  isAssignedEngineer: boolean;
  onNavigateTab?: (tab: string) => void;
  onStatusChanged?: (status: string) => void;
};

type Step =
  | { key: "vehicle"; label: string; icon: JSX.Element }
  | { key: "start"; label: string; icon: JSX.Element }
  | { key: "rams"; label: string; icon: JSX.Element }
  | { key: "remedial"; label: string; icon: JSX.Element }
  | { key: "sheet"; label: string; icon: JSX.Element }
  | { key: "photos"; label: string; icon: JSX.Element }
  | { key: "complete"; label: string; icon: JSX.Element }
  | { key: "done"; label: string; icon: JSX.Element };

/**
 * Sticky "one obvious next step" bar shown to engineers on the job page.
 * Derives the primary action from job state:
 *   vehicle check → start → RAMS → remedial → job sheet → photos → complete
 * Admin/office users don't see this bar.
 */
export default function EngineerNextStepBar({
  jobId,
  jobStatus,
  isAssignedEngineer,
  onNavigateTab,
  onStatusChanged,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const ramsStatus = useJobRamsStatus(jobId);
  const photoCount = useJobPhotoCount(jobId);

  const [vehicleOk, setVehicleOk] = useState<boolean | null>(null);
  const [remedialOutstanding, setRemedialOutstanding] = useState(0);
  const [ramsSignedByMe, setRamsSignedByMe] = useState<boolean>(true);
  const [sheetSubmitted, setSheetSubmitted] = useState<boolean>(false);
  const [vcOpen, setVcOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const refreshSignals = async () => {
    if (!user) return;

    const { data: vc } = await supabase
      .from("vehicle_checks")
      .select("status")
      .eq("engineer_id", user.id)
      .eq("check_date", todayStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setVehicleOk(vc?.status === "accepted");

    const { count: remedCount } = await supabase
      .from("job_remedial_items" as any)
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("status", "pending");
    setRemedialOutstanding(remedCount || 0);

    if (ramsStatus.required && ramsStatus.documents.length > 0) {
      const { data: mine } = await supabase
        .from("rams_signoffs" as any)
        .select("id")
        .eq("job_id", jobId)
        .eq("engineer_id", user.id);
      setRamsSignedByMe((mine as any[])?.length >= ramsStatus.documents.length);
    } else {
      setRamsSignedByMe(true);
    }

    const { count: subCount } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    setSheetSubmitted((subCount || 0) > 0);
  };

  useEffect(() => {
    refreshSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, jobId, ramsStatus.documents.length, ramsStatus.required]);

  const step: Step = useMemo(() => {
    if (jobStatus === "completed" || jobStatus === "archived" || jobStatus === "cancelled") {
      return { key: "done", label: "Job complete", icon: <CheckCircle2 className="h-5 w-5" /> };
    }
    if (vehicleOk === false) {
      return { key: "vehicle", label: "Do vehicle check first", icon: <Truck className="h-5 w-5" /> };
    }
    if (jobStatus !== "active" && jobStatus !== "in_progress") {
      return { key: "start", label: "Start job", icon: <Play className="h-5 w-5" /> };
    }
    if (ramsStatus.required && !ramsSignedByMe) {
      return { key: "rams", label: "Read & sign RAMS", icon: <ShieldCheck className="h-5 w-5" /> };
    }
    if (remedialOutstanding > 0) {
      return {
        key: "remedial",
        label: `Remedial items (${remedialOutstanding})`,
        icon: <ClipboardList className="h-5 w-5" />,
      };
    }
    if (!sheetSubmitted) {
      return { key: "sheet", label: "Fill job sheet", icon: <ClipboardList className="h-5 w-5" /> };
    }
    if (photoCount === 0) {
      return { key: "photos", label: "Add photos", icon: <Camera className="h-5 w-5" /> };
    }
    return { key: "complete", label: "Complete & sign", icon: <PenLine className="h-5 w-5" /> };
  }, [jobStatus, vehicleOk, ramsStatus.required, ramsSignedByMe, remedialOutstanding, sheetSubmitted, photoCount]);

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleClick = async () => {
    switch (step.key) {
      case "vehicle":
        setVcOpen(true);
        return;
      case "start": {
        setActing(true);
        const { error } = await supabase.from("jobs").update({ status: "active" }).eq("id", jobId);
        setActing(false);
        if (error) {
          toast({ title: "Could not start job", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Job started" });
          onStatusChanged?.("active");
        }
        return;
      }
      case "rams":
        navigate(`/rams/start?job=${jobId}`);
        return;
      case "remedial":
        onNavigateTab?.("overview");
        setTimeout(() => scrollToId("engineer-remedial-hero"), 100);
        return;
      case "sheet":
        onNavigateTab?.("overview");
        setTimeout(() => scrollToId("engineer-job-hero"), 100);
        return;
      case "photos":
        onNavigateTab?.("photos");
        return;
      case "complete":
        onNavigateTab?.("signoff");
        setTimeout(() => scrollToId("sign-off-signatures-section"), 100);
        return;
      case "done":
        return;
    }
  };

  if (!isAssignedEngineer) return null;

  const disabled = step.key === "done" || acting;

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 z-40 -mx-4 md:mx-0 mt-4 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]">
        <Button
          onClick={handleClick}
          disabled={disabled}
          size="lg"
          className="w-full min-h-14 text-base font-semibold gap-2"
        >
          {acting ? <Loader2 className="h-5 w-5 animate-spin" /> : step.icon}
          {step.label}
        </Button>
      </div>

      <Dialog open={vcOpen} onOpenChange={setVcOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Daily vehicle check</DialogTitle></DialogHeader>
          <VehicleCheckSheet onAccepted={() => { setVcOpen(false); refreshSignals(); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
