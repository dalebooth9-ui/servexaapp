import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateRamsPdf } from "@/lib/ramsPdf";
import { generateSprinklerRamsPdf, generateExtinguisherRamsPdf, generateHydrantRamsPdf, generateInstallationRamsPdf } from "@/lib/ramsPdfVariants";
import { supabase } from "@/integrations/supabase/client";
import PdfPreviewDialog from "@/components/PdfPreviewDialog";

export type RamsType = "dry_riser" | "dry_riser_remedial" | "sprinkler" | "sprinkler_remedial" | "fire_extinguisher" | "fire_hydrant" | "installation" | "wet_riser" | "fire_alarm" | "emergency_lighting" | "aov_smoke_control" | "passive_fire" | "gas_suppression" | "kitchen_suppression" | "water_mist" | "hose_reel" | "fire_risk_assessment" | "general_remedial";

interface Props {
  formData: Record<string, any>;
  jobInfo: {
    reference_number?: string;
    name?: string | null;
    customer?: string | null;
    customers?: { name: string } | null;
    address?: string | null;
    site?: { name: string; address: string | null } | null;
  } | null;
  jobId?: string;
  trigger?: React.ReactNode;
  mode?: "preview" | "download";
  ramsType?: RamsType;
}

export default function RamsPdfExport({ formData, jobInfo, jobId, trigger, mode = "preview", ramsType = "dry_riser" }: Props) {
  const [generating, setGenerating] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();

  const generate = async (forceMode?: "preview" | "download") => {
    setGenerating(true);
    const effectiveMode = forceMode ?? mode;
    // Immediate user feedback BEFORE the heavy synchronous jsPDF work begins,
    // and yield a frame so the spinner / disabled button actually paint first.
    toast({ title: "Preparing RAMS PDF…", description: "This may take a few seconds." });
    await new Promise((r) => setTimeout(r, 50));
    try {
      let assignedEngineers: { name: string; sig: string; date: string }[] = [];
      let attendanceDate = formData["rams_attendance_date"] || "";

      if (jobId) {
        const [{ data: assigns }, { data: schedules }] = await Promise.all([
          supabase.from("job_assignments").select("engineer_id, assigned_at").eq("job_id", jobId),
          supabase.from("job_schedule").select("schedule_date").eq("job_id", jobId).order("schedule_date", { ascending: true }).limit(1),
        ]);

        if (!attendanceDate && schedules && schedules.length > 0) {
          const d = new Date(schedules[0].schedule_date);
          attendanceDate = d.toLocaleDateString("en-GB");
        }

        if (assigns && assigns.length > 0) {
          const engineerIds = assigns.map((a) => a.engineer_id);
          const [{ data: profs }, { data: sigs }] = await Promise.all([
            supabase.from("profiles").select("user_id, full_name, signature_data").in("user_id", engineerIds),
            supabase.from("job_signatures").select("signer_id, file_path").eq("job_id", jobId).in("signer_id", engineerIds),
          ]);
          const profMap = new Map((profs || []).map((p) => [p.user_id, p as any]));
          const sigMap = new Map((sigs || []).map((s) => [s.signer_id, s.file_path]));
          for (const assign of assigns) {
            const prof = profMap.get(assign.engineer_id);
            const name = prof?.full_name || "";
            let sigData = "";
            const sigPath = sigMap.get(assign.engineer_id);
            if (sigPath) {
              const { data: blob } = await supabase.storage.from("signatures").download(sigPath);
              if (blob) {
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = "";
                bytes.forEach((b) => (binary += String.fromCharCode(b)));
                sigData = `data:image/png;base64,${btoa(binary)}`;
              }
            } else if (prof?.signature_data) {
              sigData = prof.signature_data;
            }
            assignedEngineers.push({ name, sig: sigData, date: new Date().toLocaleDateString("en-GB") });
          }
        }
      }

      // Resolve dynamic assessor (current user) and engineers list for personnel
      let assessorName = "";
      let engineersList = "";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .maybeSingle();
          assessorName = (prof as any)?.full_name || "";
        }
        const { data: engRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "engineer");
        const engIds = (engRoles || []).map((r: any) => r.user_id);
        if (engIds.length > 0) {
          const { data: engProfs } = await supabase
            .from("profiles")
            .select("full_name")
            .in("user_id", engIds);
          engineersList = (engProfs || [])
            .map((p: any) => (p.full_name || "").trim())
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b))
            .join(", ");
        }
      } catch {}

      const mergedFormData = {
        ...formData,
        rams_attendance_date: attendanceDate,
        _assessor: (formData as any)._assessor || assessorName,
        _keyResponsiblePersonnel: (formData as any)._keyResponsiblePersonnel || assessorName,
        _engineersList: engineersList,
      };

      // Dispatch to the correct generator
      let result: { base64: string; fileName: string };
      if (ramsType === "sprinkler") {
        result = await generateSprinklerRamsPdf(mergedFormData, jobInfo, assignedEngineers);
      } else if (ramsType === "fire_extinguisher") {
        result = await generateExtinguisherRamsPdf(mergedFormData, jobInfo, assignedEngineers);
      } else if (ramsType === "fire_hydrant") {
        result = await generateHydrantRamsPdf(mergedFormData, jobInfo, assignedEngineers);
      } else if (ramsType === "installation") {
        result = await generateInstallationRamsPdf(mergedFormData, jobInfo, assignedEngineers);
      } else {
        result = await generateRamsPdf(mergedFormData, jobInfo, assignedEngineers, ramsType);
      }

      const { base64, fileName } = result;
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });

      if (effectiveMode === "download") {
        // Direct <a download> click — never blocked by popup blockers.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "RAMS PDF downloaded", description: fileName });
      } else {
        // In-app modal preview — no popups, no popup-blocker interference.
        setPreviewBlob(blob);
        setPreviewName(fileName);
        setPreviewOpen(true);
      }
    } catch (err: any) {
      toast({ title: "Error generating RAMS PDF", description: err?.message ?? "Unable to generate PDF.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const previewDialog = (
    <PdfPreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      blob={previewBlob}
      fileName={previewName}
      title={previewName}
    />
  );

  if (trigger) {
    return (
      <>
        <span onClick={() => generate()} className="cursor-pointer">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : trigger}
        </span>
        {previewDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => generate("preview")} disabled={generating} title="Preview RAMS PDF">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => generate("download")} disabled={generating} title="Download RAMS PDF">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {previewDialog}
    </>
  );
}
