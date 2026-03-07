import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Award, Loader2, FileDown, Pencil, CheckCircle2, X } from "lucide-react";
import InlineSignaturePad from "@/components/InlineSignaturePad";
import jsPDF from "jspdf";

export type ConformityCert = {
  id: string;
  job_id: string;
  certificate_number: string;
  issue_date: string;
  job_name: string;
  site_address: string;
  customer_name: string;
  reference_number: string;
  system_qty: number;
  riser_locations: string;
  installation_date: string;
  test_outcome: string;
  test_notes: string;
  engineer_name: string;
  engineer_signature: string | null;
  sign_date: string;
  status: string;
  created_at: string;
};

type Props = {
  jobId: string;
  /** If provided, the CoC was auto-created from a commissioning cert submission */
  certId?: string;
  onSendReady?: (base64: string, fileName: string) => void;
};

export default function CertificateOfConformity({ jobId, certId, onSendReady }: Props) {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [certs, setCerts] = useState<ConformityCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCert, setEditingCert] = useState<ConformityCert | null>(null);
  const [form, setForm] = useState<Partial<ConformityCert>>({});
  const [saving, setSaving] = useState(false);
  const [showSigCapture, setShowSigCapture] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const fetchCerts = async () => {
    const { data } = await supabase
      .from("conformity_certificates" as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setCerts((data as unknown as ConformityCert[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCerts(); }, [jobId]);

  const openEdit = (cert: ConformityCert) => {
    setEditingCert(cert);
    setForm({ ...cert });
  };

  const handleSave = async () => {
    if (!editingCert) return;
    setSaving(true);
    try {
      await supabase
        .from("conformity_certificates" as any)
        .update(form as any)
        .eq("id", editingCert.id);
      toast({ title: "Certificate saved" });
      await fetchCerts();
      setEditingCert(null);
    } catch {
      toast({ title: "Error saving certificate", variant: "destructive" });
    }
    setSaving(false);
  };

  const generatePdf = async (cert: ConformityCert): Promise<{ base64: string; fileName: string }> => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(220, 38, 38); // red-600
    doc.rect(0, 0, pw, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATE OF CONFORMITY", pw / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Dry Riser Installation — BS EN 9990:2015", pw / 2, 19, { align: "center" });
    doc.text("Viva Fire Protection Ltd", pw / 2, 24, { align: "center" });

    doc.setTextColor(0, 0, 0);

    // Certificate meta row
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 32, pw - 28, 14, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`Certificate No: ${cert.certificate_number || "—"}`, 18, 39);
    doc.text(`Issue Date: ${cert.issue_date || "—"}`, pw / 2, 39, { align: "center" });
    const outcomeColor = cert.test_outcome === "pass" ? [22, 163, 74] : [220, 38, 38];
    doc.setTextColor(...(outcomeColor as [number, number, number]));
    doc.setFont("helvetica", "bold");
    doc.text(`Outcome: ${cert.test_outcome.toUpperCase()}`, pw - 18, 39, { align: "right" });
    doc.setTextColor(0, 0, 0);

    let y = 52;
    const sectionHeader = (title: string) => {
      doc.setFillColor(239, 68, 68);
      doc.rect(14, y, pw - 28, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(title.toUpperCase(), 17, y + 5);
      doc.setTextColor(0, 0, 0);
      y += 9;
    };
    const row = (label: string, value: string, rightLabel?: string, rightValue?: string) => {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(label, 17, y);
      doc.setFont("helvetica", "normal");
      doc.text(value || "—", 65, y);
      if (rightLabel) {
        doc.setFont("helvetica", "bold");
        doc.text(rightLabel, pw / 2 + 5, y);
        doc.setFont("helvetica", "normal");
        doc.text(rightValue || "—", pw / 2 + 45, y);
      }
      y += 7;
    };

    sectionHeader("Project Details");
    row("Job Reference:", cert.reference_number, "Customer:", cert.customer_name);
    row("Job Name:", cert.job_name);
    row("Site Address:", cert.site_address);
    y += 2;

    sectionHeader("System Information");
    row("No. of Dry Riser Systems:", String(cert.system_qty), "Installation Date:", cert.installation_date || "—");
    row("Riser Locations:", cert.riser_locations);
    y += 2;

    sectionHeader("Test Results");
    row("Outcome:", cert.test_outcome.toUpperCase());
    if (cert.test_notes) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", 17, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(cert.test_notes, pw - 80);
      doc.text(lines, 65, y);
      y += lines.length * 5 + 2;
    }
    y += 2;

    sectionHeader("Compliance Declaration");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const declaration = `We hereby certify that the dry riser installation described above has been installed, tested and commissioned in accordance with BS EN 9990:2015 and all relevant statutory requirements. The installation has been inspected and found to be in a satisfactory condition and complies with the specification as detailed herein.`;
    const declLines = doc.splitTextToSize(declaration, pw - 32);
    doc.text(declLines, 17, y);
    y += declLines.length * 5 + 6;

    sectionHeader("Sign-Off");
    row("Engineer / Technician:", cert.engineer_name, "Date:", cert.sign_date || "—");
    y += 4;

    // Signature
    if (cert.engineer_signature) {
      try {
        doc.addImage(cert.engineer_signature, "PNG", 17, y, 50, 20);
      } catch {}
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.text("Authorised Signature", 17, y + 22);
      y += 28;
    } else {
      doc.setDrawColor(200, 200, 200);
      doc.rect(17, y, 70, 18);
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(150, 150, 150);
      doc.text("Signature pending", 20, y + 10);
      doc.setTextColor(0, 0, 0);
      y += 24;
    }

    // Footer
    const fY = doc.internal.pageSize.getHeight() - 14;
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.5);
    doc.line(14, fY - 3, pw - 14, fY - 3);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text("Viva Fire Protection Ltd  |  Certificate of Conformity  |  Dry Riser Installation", pw / 2, fY + 2, { align: "center" });

    const base64 = doc.output("datauristring").split(",")[1];
    const fileName = `CoC-${cert.reference_number || cert.job_id.slice(0, 8)}.pdf`;
    return { base64, fileName };
  };

  const handleDownload = async (cert: ConformityCert) => {
    setExporting(cert.id);
    try {
      const { base64, fileName } = await generatePdf(cert);
      const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      onSendReady?.(base64, fileName);
    } catch {
      toast({ title: "Error generating PDF", variant: "destructive" });
    }
    setExporting(null);
  };

  if (loading) return null;
  if (certs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
        <Award className="h-3 w-3" /> Certificate of Conformity
      </p>
      {certs.map((cert) => (
        <div key={cert.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-card">
          <Award className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Certificate of Conformity</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant={cert.status === "final" ? "default" : "secondary"} className="text-[10px]">
                {cert.status === "final" ? "Final" : "Draft"}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] ${cert.test_outcome === "pass" ? "border-green-500/40 text-green-600" : "border-destructive/40 text-destructive"}`}
              >
                {cert.test_outcome.toUpperCase()}
              </Badge>
              {cert.certificate_number && (
                <span className="text-[10px] text-muted-foreground">{cert.certificate_number}</span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 gap-1 shrink-0"
            onClick={() => handleDownload(cert)}
            disabled={exporting === cert.id}
          >
            {exporting === cert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
            PDF
          </Button>
          {userRole === "admin" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 gap-1 shrink-0"
              onClick={() => openEdit(cert)}
            >
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          )}
        </div>
      ))}

      {/* Edit Dialog */}
      <Dialog open={!!editingCert} onOpenChange={(o) => { if (!o) setEditingCert(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" /> Edit Certificate of Conformity
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Certificate Number</Label>
              <Input value={form.certificate_number || ""} onChange={(e) => setForm({ ...form, certificate_number: e.target.value })} placeholder="CoC-001" />
            </div>
            <div>
              <Label className="text-xs">Issue Date</Label>
              <Input type="date" value={form.issue_date || ""} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Job Name</Label>
              <Input value={form.job_name || ""} onChange={(e) => setForm({ ...form, job_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Site Address</Label>
              <Input value={form.site_address || ""} onChange={(e) => setForm({ ...form, site_address: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Customer Name</Label>
              <Input value={form.customer_name || ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Reference Number</Label>
              <Input value={form.reference_number || ""} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">No. of Dry Riser Systems</Label>
              <Input type="number" min={1} value={form.system_qty || 1} onChange={(e) => setForm({ ...form, system_qty: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <Label className="text-xs">Installation Date</Label>
              <Input type="date" value={form.installation_date || ""} onChange={(e) => setForm({ ...form, installation_date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Riser Locations</Label>
              <Input value={form.riser_locations || ""} onChange={(e) => setForm({ ...form, riser_locations: e.target.value })} placeholder="e.g. Main lobby, Level 2 stairwell" />
            </div>
            <div>
              <Label className="text-xs">Test Outcome</Label>
              <Select value={form.test_outcome || "pass"} onValueChange={(v) => setForm({ ...form, test_outcome: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="conditional_pass">Conditional Pass</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status || "draft"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Test Notes / Observations</Label>
              <Textarea rows={3} value={form.test_notes || ""} onChange={(e) => setForm({ ...form, test_notes: e.target.value })} placeholder="Any observations or conditions..." />
            </div>
            <div>
              <Label className="text-xs">Engineer / Technician Name</Label>
              <Input value={form.engineer_name || ""} onChange={(e) => setForm({ ...form, engineer_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Sign Date</Label>
              <Input type="date" value={form.sign_date || ""} onChange={(e) => setForm({ ...form, sign_date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Engineer Signature</Label>
              {form.engineer_signature ? (
                <div className="flex items-center gap-3">
                  <img src={form.engineer_signature} alt="Signature" className="h-12 border rounded bg-white" />
                  <Button variant="outline" size="sm" onClick={() => setForm({ ...form, engineer_signature: undefined })}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowSigCapture(true)}>
                  Capture Signature
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setEditingCert(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Save Certificate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showSigCapture && (
        <InlineSignaturePad
          onCapture={(sig) => { setForm((f) => ({ ...f, engineer_signature: sig })); setShowSigCapture(false); }}
          onCancel={() => setShowSigCapture(false)}
        />
      )}
    </div>
  );
}

/** Utility: auto-create a CoC draft when a commissioning cert is submitted */
export async function autoCreateConformityCert(jobId: string, userId: string, jobInfo: {
  name?: string | null;
  address?: string | null;
  customer?: string | null;
  reference_number?: string;
  other_qty?: number;
  site?: { address?: string | null; postcode?: string | null; riser_location?: string | null } | null;
  engineers?: string[];
}) {
  // Avoid duplicate: only create if none exists for this job
  const { data: existing } = await supabase
    .from("conformity_certificates" as any)
    .select("id")
    .eq("job_id", jobId)
    .limit(1);
  if (existing && (existing as any[]).length > 0) return;

  const siteAddr = [jobInfo.address || jobInfo.site?.address, jobInfo.site?.postcode].filter(Boolean).join(", ");
  const today = new Date().toISOString().split("T")[0];

  await supabase.from("conformity_certificates" as any).insert({
    job_id: jobId,
    created_by: userId,
    job_name: jobInfo.name || "",
    site_address: siteAddr,
    customer_name: jobInfo.customer || "",
    reference_number: jobInfo.reference_number || "",
    system_qty: jobInfo.other_qty || 1,
    riser_locations: jobInfo.site?.riser_location || "",
    issue_date: today,
    sign_date: today,
    engineer_name: (jobInfo.engineers || []).join(", "),
    status: "draft",
    test_outcome: "pass",
  } as any);
}
