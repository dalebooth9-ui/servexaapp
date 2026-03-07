import { useState, useEffect } from "react";
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
  inlet_qty: number;
  outlet_qty: number;
  pressure_bar: number;
  pressure_duration: number;
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
  certId?: string;
  onSendReady?: (base64: string, fileName: string) => void;
};

export default function CertificateOfConformity({ jobId, certId, onSendReady }: Props) {
  const { userRole } = useAuth();
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

  const handleDownload = async (cert: ConformityCert) => {
    setExporting(cert.id);
    try {
      const { base64, fileName } = await generateConformityPdfBase64(cert);
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
              <Input value={form.certificate_number || ""} onChange={(e) => setForm({ ...form, certificate_number: e.target.value })} placeholder="VFP09129/0809" />
            </div>
            <div>
              <Label className="text-xs">Date of Test</Label>
              <Input type="date" value={form.issue_date || ""} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Building / Site Name</Label>
              <Input value={form.job_name || ""} onChange={(e) => setForm({ ...form, job_name: e.target.value })} placeholder="4 High Court, Leeds" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Site Address</Label>
              <Input value={form.site_address || ""} onChange={(e) => setForm({ ...form, site_address: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Client Name</Label>
              <Input value={form.customer_name || ""} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="PH Plumbing" />
            </div>
            <div>
              <Label className="text-xs">Reference Number</Label>
              <Input value={form.reference_number || ""} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
            </div>

            <div className="col-span-2 border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">No. of Dry Riser Systems</Label>
                  <Input type="number" min={1} value={form.system_qty ?? 1} onChange={(e) => setForm({ ...form, system_qty: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-xs">No. of Inlet Valves</Label>
                  <Input type="number" min={1} value={form.inlet_qty ?? 1} onChange={(e) => setForm({ ...form, inlet_qty: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-xs">No. of Outlet Valves</Label>
                  <Input type="number" min={1} value={form.outlet_qty ?? 2} onChange={(e) => setForm({ ...form, outlet_qty: parseInt(e.target.value) || 2 })} />
                </div>
                <div>
                  <Label className="text-xs">Pressure Test (bar)</Label>
                  <Input type="number" min={1} value={form.pressure_bar ?? 12} onChange={(e) => setForm({ ...form, pressure_bar: parseInt(e.target.value) || 12 })} />
                </div>
                <div>
                  <Label className="text-xs">Test Duration (minutes)</Label>
                  <Input type="number" min={1} value={form.pressure_duration ?? 15} onChange={(e) => setForm({ ...form, pressure_duration: parseInt(e.target.value) || 15 })} />
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
              </div>
            </div>

            <div className="col-span-2">
              <Label className="text-xs">Additional Notes (optional)</Label>
              <Textarea rows={2} value={form.test_notes || ""} onChange={(e) => setForm({ ...form, test_notes: e.target.value })} placeholder="Any additional observations..." />
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
  const { data: existing } = await supabase
    .from("conformity_certificates" as any)
    .select("id")
    .eq("job_id", jobId)
    .limit(1);
  if (existing && (existing as any[]).length > 0) return;

  const siteAddr = [jobInfo.address || jobInfo.site?.address, jobInfo.site?.postcode].filter(Boolean).join(", ");
  const today = new Date().toISOString().split("T")[0];

  // Auto-generate cert number from reference number e.g. VFP-00123 → VFP00123/CoC
  const ref = jobInfo.reference_number || "";
  const certNumber = ref ? `${ref.replace(/-/g, "")}/CoC` : "";

  // Load Dale Booth's profile signature automatically
  let daleSig: string | null = null;
  try {
    const { data: daleProfiles } = await supabase
      .from("profiles")
      .select("signature_data")
      .ilike("full_name", "%dale booth%")
      .limit(1);
    if (daleProfiles && daleProfiles.length > 0) {
      daleSig = (daleProfiles[0] as any).signature_data || null;
    }
  } catch {}

  await supabase.from("conformity_certificates" as any).insert({
    job_id: jobId,
    created_by: userId,
    job_name: jobInfo.name || "",
    site_address: siteAddr,
    customer_name: jobInfo.customer || "",
    reference_number: ref,
    certificate_number: certNumber,
    system_qty: jobInfo.other_qty || 1,
    inlet_qty: 1,
    outlet_qty: 2,
    pressure_bar: 12,
    pressure_duration: 15,
    riser_locations: jobInfo.site?.riser_location || "",
    issue_date: today,
    sign_date: today,
    engineer_name: "Dale Booth",
    engineer_signature: daleSig,
    status: "draft",
    test_outcome: "pass",
  } as any);
}

/** Standalone PDF generator — matches actual Viva Fire Certificate of Conformity layout */
export async function generateConformityPdfBase64(cert: ConformityCert): Promise<{ base64: string; fileName: string }> {
  const { default: jsPDF } = await import("jspdf");
  const { loadWatermarkImage, addWatermarkToAllPages } = await import("@/lib/pdfWatermark");
  const { loadAccreditationLogos, renderAccreditationLogos } = await import("@/lib/pdfAccreditations");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  // ── Watermark (blue flame behind content) ────────────────────────────
  const [watermark, logos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(),
  ]);
  if (watermark) addWatermarkToAllPages(doc, watermark);

  // ── Logo ─────────────────────────────────────────────────────────────
  try {
    const logoUrl = `${window.location.origin}/images/vivafire-logo-new.jpg`;
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const reader = new FileReader();
    const logoBase64 = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    doc.addImage(logoBase64, "JPEG", pw / 2 - 30, 10, 60, 22);
  } catch {}

  // ── Title block ──────────────────────────────────────────────────────
  let y = 38;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Dry Riser System", pw / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(16);
  doc.text("Certificate of Conformity", pw / 2, y, { align: "center" });
  y += 8;

  // Certificate number
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Certificate Number  ${cert.certificate_number || "—"}`, pw / 2, y, { align: "center" });
  y += 10;

  // ── Divider ──────────────────────────────────────────────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.6);
  doc.line(20, y, pw - 20, y);
  y += 8;

  // ── BUILDING section ─────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("BUILDING", pw / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(13);
  const buildingLines = doc.splitTextToSize(cert.job_name || "—", pw - 60);
  doc.text(buildingLines, pw / 2, y, { align: "center" });
  y += buildingLines.length * 7 + 2;

  if (cert.site_address) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const addrLines = doc.splitTextToSize(cert.site_address, pw - 60);
    doc.text(addrLines, pw / 2, y, { align: "center" });
    y += addrLines.length * 5 + 2;
  }

  y += 4;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(`Client – ${cert.customer_name || "—"}`, pw / 2, y, { align: "center" });
  y += 6;
  doc.text(`Date of Test: ${cert.issue_date || "—"}`, pw / 2, y, { align: "center" });
  y += 10;

  // ── Divider ──────────────────────────────────────────────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.line(20, y, pw - 20, y);
  y += 10;

  // ── Body text ────────────────────────────────────────────────────────
  const inletQty = cert.inlet_qty ?? 1;
  const outletQty = cert.outlet_qty ?? 2;
  const pressureBar = cert.pressure_bar ?? 12;
  const pressureDuration = cert.pressure_duration ?? 15;
  const sysQty = cert.system_qty ?? 1;
  const sysText = sysQty === 1 ? "one dry riser system" : `${sysQty} dry riser systems`;

  const para1 = `Viva Fire Protection Ltd, confirm having installed, inspected and tested ${sysText} at the above site.`;
  const para2 = "The system was found to conform to the requirements of BS 9990:2015";
  const inletWord = inletQty === 1 ? "inlet valve" : "inlet valves";
  const outletWord = outletQty === 1 ? "outlet valve" : "outlet valves";
  const para3 = `The dry riser system comprises of ${inletQty} ${inletWord} and ${outletQty} ${outletWord}.`;
  const para4 = `The Viva Fire test comprised of static pressure test with water to ${pressureBar} bar of the whole system for ${pressureDuration} minutes`;

  const bodyLines = [para1, para2, para3, para4];
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  for (const para of bodyLines) {
    const lines = doc.splitTextToSize(para, pw - 40);
    doc.text(lines, pw / 2, y, { align: "center" });
    y += lines.length * 6 + 4;
  }

  if (cert.test_notes) {
    const noteLines = doc.splitTextToSize(cert.test_notes, pw - 40);
    doc.text(noteLines, pw / 2, y, { align: "center" });
    y += noteLines.length * 6 + 4;
  }

  y += 6;

  // ── Sign-off ─────────────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.text(`Signed on behalf of Viva Fire Protection Ltd    Date ${cert.sign_date || "—"}`, pw / 2, y, { align: "center" });
  y += 12;

  // Signature image or blank box
  if (cert.engineer_signature) {
    try {
      doc.addImage(cert.engineer_signature, "PNG", pw / 2 - 25, y, 50, 18);
      y += 20;
    } catch {}
  } else {
    doc.setDrawColor(160, 160, 160);
    doc.rect(pw / 2 - 35, y, 70, 16);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "italic");
    doc.text("Signature pending", pw / 2, y + 9, { align: "center" });
    doc.setTextColor(30, 30, 30);
    y += 18;
  }

  // Engineer name
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  if (cert.engineer_name) {
    doc.text(cert.engineer_name, pw / 2, y + 2, { align: "center" });
    y += 7;
  }

  // ── Accreditation logos ──────────────────────────────────────────────
  const footerY = ph - 18;
  const logoH = 14;
  const logoRowY = footerY - logoH - 5;
  renderAccreditationLogos(doc, logos, logoRowY, logoH);

  // ── Footer ───────────────────────────────────────────────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.line(14, footerY - 4, pw - 14, footerY - 4);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Viva Fire Protection Limited, Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham OL4 3DZ",
    pw / 2, footerY, { align: "center" }
  );
  doc.text(
    "Company Reg No: 06464084   Tel: 0845 269 8482   sales@vivafire.co.uk   www.vivafire.co.uk",
    pw / 2, footerY + 5, { align: "center" }
  );

  const base64 = doc.output("datauristring").split(",")[1];
  const fileName = `CoC-${cert.certificate_number || cert.reference_number || cert.job_id.slice(0, 8)}.pdf`;
  return { base64, fileName };
}
