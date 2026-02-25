import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateRamsPdf } from "@/lib/ramsPdf";

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
  trigger?: React.ReactNode;
}

export default function RamsPdfExport({ formData, jobInfo, trigger }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const { base64, fileName } = await generateRamsPdf(formData, jobInfo);
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "RAMS PDF downloaded", description: fileName });
    } catch (err: any) {
      toast({ title: "Error generating RAMS PDF", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (trigger) {
    return (
      <span onClick={generate} className="cursor-pointer">
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : trigger}
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
      {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
      {generating ? "Generating..." : "Export RAMS PDF"}
    </Button>
  );
}
