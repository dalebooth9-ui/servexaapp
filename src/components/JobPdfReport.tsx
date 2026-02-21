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
      // Fetch all related data including site details and job sheet responses
      const [subsRes, reportsRes, visitsRes, partsRes, assignRes, sigRes, siteRes, sheetRespRes, templatesRes] = await Promise.all([
        supabase.from("submissions").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("field_reports").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_visits").select("*").eq("job_id", jobId).order("scheduled_date", { ascending: true }),
        supabase.from("job_parts" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        supabase.from("job_assignments").select("engineer_id").eq("job_id", jobId),
        supabase.from("job_signatures" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
        job.site_id ? supabase.from("sites").select("name, address, postcode, contact_name, contact_phone, contact_email").eq("id", job.site_id).single() : Promise.resolve({ data: null }),
        supabase.from("job_sheet_responses").select("*").eq("job_id", jobId).eq("status", "submitted").order("created_at", { ascending: true }),
        supabase.from("job_sheet_templates").select("*"),
      ]);

      const submissions = subsRes.data || [];
      const reports = reportsRes.data || [];
      const visits = visitsRes.data || [];
      const parts = (partsRes.data as any[]) || [];
      const signatures = (sigRes.data as any[]) || [];
      const site = siteRes.data as any;
      const sheetResponses = (sheetRespRes.data || []) as any[];
      const templates = (templatesRes.data || []) as any[];

      // Build template lookup
      const templateMap: Record<string, any> = {};
      templates.forEach((t: any) => {
        templateMap[t.id] = {
          ...t,
          fields: typeof t.fields === "string" ? JSON.parse(t.fields) : t.fields,
        };
      });

      // Fetch engineer names
      const engIds = [...new Set((assignRes.data || []).map((a: any) => a.engineer_id))];
      let engineerNames: string[] = [];
      if (engIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", engIds);
        engineerNames = (profiles || []).map((p) => p.full_name || "Unknown");
      }

      // Pre-load photo images for embedding
      const photos = submissions.filter((s: any) => s.type === "photo" && s.file_url);
      const photoImages: Record<string, string> = {};
      await Promise.all(photos.map(async (p: any) => {
        try {
          const path = extractPath(p.file_url);
          if (!path) return;
          const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 60);
          if (!data?.signedUrl) return;
          const response = await fetch(data.signedUrl);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          photoImages[p.id] = dataUrl;
        } catch { /* skip */ }
      }));

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

      // --- Job Details ---
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Reference: ${job.reference_number}`, margin, y); y += 5;
      doc.text(`Name: ${job.name}`, margin, y); y += 5;
      if (job.customer) { doc.text(`Customer: ${job.customer}`, margin, y); y += 5; }
      if (job.address) { doc.text(`Address: ${job.address}`, margin, y); y += 5; }
      doc.text(`Status: ${job.status}`, margin, y); y += 5;
      doc.text(`Priority: ${job.priority || "medium"}`, margin, y); y += 5;
      if (engineerNames.length > 0) { doc.text(`Engineers: ${engineerNames.join(", ")}`, margin, y); y += 5; }
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, margin, y); y += 8;

      // --- Full Site Details ---
      if (site) {
        checkPage(30);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Site Details", margin, y); y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        if (site.name) { doc.text(`Site Name: ${site.name}`, margin, y); y += 5; }
        if (site.address) { doc.text(`Address: ${site.address}`, margin, y); y += 5; }
        if (site.postcode) { doc.text(`Postcode: ${site.postcode}`, margin, y); y += 5; }
        if (site.contact_name) { doc.text(`Contact: ${site.contact_name}`, margin, y); y += 5; }
        if (site.contact_phone) { doc.text(`Phone: ${site.contact_phone}`, margin, y); y += 5; }
        if (site.contact_email) { doc.text(`Email: ${site.contact_email}`, margin, y); y += 5; }
        y += 3;
      }

      // --- Visits ---
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

      // --- Parts ---
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

      // --- Job Sheet Template Responses ---
      if (sheetResponses.length > 0) {
        for (const resp of sheetResponses) {
          const tpl = templateMap[resp.template_id];
          if (!tpl) continue;

          checkPage(20);
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.text(`Job Sheet: ${tpl.name}`, margin, y); y += 7;

          const fields = tpl.fields || [];
          const responses = resp.responses || {};
          const sections = [...new Set(fields.map((f: any) => f.section || "General"))] as string[];

          for (const section of sections) {
            const sectionFields = fields.filter((f: any) => (f.section || "General") === section);
            if (sectionFields.length === 0) continue;

            checkPage(12);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setFillColor(230, 230, 230);
            doc.rect(margin, y - 3, maxWidth, 5, "F");
            doc.text(section.toUpperCase(), margin + 1, y);
            y += 5;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);

            for (const field of sectionFields) {
              checkPage(8);
              const val = responses[field.id];
              let displayVal = "—";
              if (field.type === "pass_fail") {
                displayVal = val === "pass" ? "PASS" : val === "fail" ? "FAIL" : val === "n/a" ? "N/A" : "—";
              } else if (field.type === "checkbox") {
                displayVal = val ? "YES" : "NO";
              } else if (field.type === "photo") {
                displayVal = val ? "✓ Captured" : "—";
              } else if (val) {
                displayVal = String(val).substring(0, 80);
              }

              const labelWidth = maxWidth * 0.6;
              const label = doc.splitTextToSize(field.label, labelWidth - 2).slice(0, 1)[0];
              doc.text(label, margin, y);
              
              // Color coding for pass/fail
              if (field.type === "pass_fail" && val === "pass") {
                doc.setTextColor(0, 128, 0);
                doc.setFont("helvetica", "bold");
              } else if (field.type === "pass_fail" && val === "fail") {
                doc.setTextColor(200, 0, 0);
                doc.setFont("helvetica", "bold");
              }
              doc.text(displayVal, margin + labelWidth, y);
              doc.setTextColor(0, 0, 0);
              doc.setFont("helvetica", "normal");
              y += 4.5;

              // Inline note
              const noteVal = responses[`${field.id}_notes`];
              if (noteVal) {
                doc.setFontSize(7);
                doc.setFont("helvetica", "italic");
                doc.setTextColor(100, 100, 100);
                doc.text(`Note: ${noteVal}`.substring(0, 100), margin + 4, y);
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(8);
                doc.setFont("helvetica", "normal");
                y += 3.5;
              }
            }
            y += 2;
          }
          y += 5;
        }
      }

      // --- Field Reports ---
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

      // --- Engineer Notes ---
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

      // --- Embedded Photos ---
      if (photos.length > 0) {
        checkPage(20);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`Photos (${photos.length})`, margin, y); y += 7;

        for (const p of photos) {
          const dataUrl = photoImages[p.id];
          if (dataUrl) {
            checkPage(65);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text(`${p.file_name || "Photo"} — ${new Date(p.created_at).toLocaleDateString("en-GB")}`, margin, y);
            y += 3;
            try {
              doc.addImage(dataUrl, "JPEG", margin, y, 60, 45);
              y += 50;
            } catch {
              doc.text("[Image could not be embedded]", margin, y);
              y += 5;
            }
          } else {
            checkPage(8);
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.text(`• ${p.file_name} — ${new Date(p.created_at).toLocaleDateString("en-GB")}`, margin, y);
            y += 5;
          }
        }
      }

      // --- Signatures ---
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

function extractPath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/object\/(?:public|sign)\/submissions\/(.+?)(?:\?|$)/);
  if (match) return match[1];
  if (!fileUrl.startsWith("http")) return fileUrl;
  return null;
}
