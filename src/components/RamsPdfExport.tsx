import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateRamsPdf } from "@/lib/ramsPdf";
import { supabase } from "@/integrations/supabase/client";

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
}

export default function RamsPdfExport({ formData, jobInfo, jobId, trigger, mode = "preview" }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async (forceMode?: "preview" | "download") => {
    setGenerating(true);
    try {
      let assignedEngineers: { name: string; sig: string; date: string }[] = [];
      if (jobId) {
        const { data: assigns } = await supabase.from("job_assignments").select("engineer_id, assigned_at").eq("job_id", jobId);
        if (assigns && assigns.length > 0) {
          const engineerIds = assigns.map((a) => a.engineer_id);
          const [{ data: profs }, { data: sigs }] = await Promise.all([
            supabase.from("profiles").select("user_id, full_name").in("user_id", engineerIds),
            supabase.from("job_signatures").select("signer_id, file_path").eq("job_id", jobId).in("signer_id", engineerIds),
          ]);
          const profMap = new Map((profs || []).map((p) => [p.user_id, p.full_name]));
          const sigMap = new Map((sigs || []).map((s) => [s.signer_id, s.file_path]));
          for (const assign of assigns) {
            const name = profMap.get(assign.engineer_id) || "";
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
            }
            assignedEngineers.push({ name, sig: sigData, date: new Date().toLocaleDateString("en-GB") });
          }
        }
      }

      const effectiveMode = forceMode ?? mode;

      const { base64, fileName } = await generateRamsPdf(formData, jobInfo, assignedEngineers);
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      if (effectiveMode === "download") {
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "RAMS PDF downloaded", description: fileName });
      } else {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast({ title: "RAMS PDF opened", description: fileName });
      }
    } catch (err: any) {
      toast({ title: "Error generating RAMS PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (trigger) {
    return (
      <span onClick={() => generate()} className="cursor-pointer">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : trigger}
      </span>
    );
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" onClick={() => generate("preview")} disabled={generating} title="Preview RAMS PDF">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      </Button>
      <Button variant="outline" size="sm" onClick={() => generate("download")} disabled={generating} title="Download RAMS PDF">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
