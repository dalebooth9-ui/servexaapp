import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

interface Props {
  jobId: string;
  job: any;
}

export default function JobPdfReport({ jobId, job }: Props) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      // Fetch all related data
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      ]);

      const submissions = subsRes.data || [];
      const reports = reportsRes.data || [];
      const visits = visitsRes.data || [];
      const parts = (partsRes.data as any[]) || [];
      const signatures = (sigRes.data as any[]) || [];

      // Fetch engineer names
      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p) => p.full_name || "Unknown");
      }

      const doc = new jsPDF();
      let y = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;

      const addPage = () => { doc.addPage(); y = 20; };
      const checkPage = (needed: number) => { if (y + needed > 270) addPage(); };

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Job Report", margin, y);
      y += 10;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Reference: ${job.reference_number}`, margin, y); y += 5;
      doc.text(`Name: ${job.name}`, margin, y); y += 5;
      if (job.customer) { doc.text(`Customer: ${job.customer}`, margin, y); y += 5; }
      if (job.address) { doc.text(`Address: ${job.address}`, margin, y); y += 5; }
      doc.text(`Status: ${job.status}`, margin, y); y += 5;
      doc.text(`Priority: ${job.priority || "medium"}`, margin, y); y += 5;
      if (engineerNames.length > 0) { doc.text(`Engineers: ${engineerNames.join(", ")}`, margin, y); y += 5; }
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, margin, y); y += 10;

      // Visits
      if (visits.length > 0) {
        checkPage(20);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Visits", margin, y); y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        visits.forEach((v: any) => {
          checkPage(8);
          doc.text(`${v.scheduled_date} — ${v.status}${v.notes ? ` — ${v.notes}` : ""}`, margin, y);
          y += 5;
        });
        y += 5;
      }

      // Parts
      if (parts.length > 0) {
        checkPage(20);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Parts & Materials", margin, y); y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        parts.forEach((p: any) => {
          checkPage(8);
          doc.text(`${p.name} — Qty: ${p.quantity} — £${Number(p.unit_cost).toFixed(2)} ea — Total: £${Number(p.total_cost).toFixed(2)}`, margin, y);
          y += 5;
        });
        const totalParts = parts.reduce((s: number, p: any) => s + Number(p.total_cost || 0), 0);
        doc.setFont("helvetica", "bold");
        doc.text(`Parts Total: £${totalParts.toFixed(2)}`, margin, y); y += 8;
        doc.setFont("helvetica", "normal");
      }

      // Field Reports
      if (reports.length > 0) {
        checkPage(20);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Field Reports", margin, y); y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        reports.forEach((r: any) => {
          checkPage(15);
          doc.setFont("helvetica", "bold");
          doc.text(r.title || "Untitled Report", margin, y); y += 5;
          doc.setFont("helvetica", "normal");
          if (r.summary) {
            const lines = doc.splitTextToSize(r.summary, maxWidth);
            lines.forEach((line: string) => { checkPage(5); doc.text(line, margin, y); y += 4; });
          }
          y += 3;
        });
        y += 5;
      }

      // Notes / Submissions
      const notes = submissions.filter((s: any) => s.type === "note" && s.content);
      if (notes.length > 0) {
        checkPage(20);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Engineer Notes", margin, y); y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        notes.forEach((n: any) => {
          checkPage(10);
          const lines = doc.splitTextToSize(`${new Date(n.created_at).toLocaleDateString("en-GB")}: ${n.content}`, maxWidth);
          lines.forEach((line: string) => { checkPage(5); doc.text(line, margin, y); y += 4; });
          y += 3;
        });
      }

      // Photos list
      const photos = submissions.filter((s: any) => s.type === "photo" && s.file_name);
      if (photos.length > 0) {
        checkPage(20);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`Photos (${photos.length})`, margin, y); y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        photos.forEach((p: any) => {
          checkPage(6);
          doc.text(`• ${p.file_name} — ${new Date(p.created_at).toLocaleDateString("en-GB")}`, margin, y);
          y += 5;
        });
      }

      // Signatures
      if (signatures.length > 0) {
        checkPage(30);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Sign-Off Signatures", margin, y); y += 7;
        
        for (const sig of signatures) {
          checkPage(50);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.text(`${sig.signer_name} (${sig.signer_role}) — ${new Date(sig.created_at).toLocaleDateString("en-GB")}`, margin, y);
          y += 5;
          
          // Try to embed signature image
          try {
            const { data: urlData } = await supabase.storage
              .from("signatures")
              .createSignedUrl(sig.file_path, 60);
            if (urlData?.signedUrl) {
              const response = await fetch(urlData.signedUrl);
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              doc.addImage(dataUrl, "PNG", margin, y, 60, 20);
              y += 25;
            }
          } catch {
            doc.text("[Signature image unavailable]", margin, y);
            y += 5;
          }
          
          // Signature line
          doc.setDrawColor(150);
          doc.line(margin, y, margin + 80, y);
          y += 8;
        }
      }

      doc.save(`${job.reference_number}-report.pdf`);
      toast({ title: "PDF generated", description: `${job.reference_number}-report.pdf downloaded.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
      {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
      {generating ? "Generating..." : "Export PDF Report"}
    </Button>
  );
}
