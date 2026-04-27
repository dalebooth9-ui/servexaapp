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
import { PDF_PALETTE } from "@/lib/pdfPalette";

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

/** Utility: auto-create a CoC draft for each dry riser commissioning cert submitted */
export async function autoCreateConformityCert(jobId: string, userId: string, jobInfo: {
  name?: string | null;
  address?: string | null;
  customer?: string | null;
  reference_number?: string;
  commissioning_ref?: string;
  other_qty?: number;
  category?: string | null;
  site?: { address?: string | null; postcode?: string | null; riser_location?: string | null } | null;
  engineers?: string[];
}) {
  const siteAddr = [jobInfo.address || jobInfo.site?.address, jobInfo.site?.postcode].filter(Boolean).join(", ");
  const today = new Date().toISOString().split("T")[0];

  // Fetch org branding for company name auto-fill
  let orgCompanyName = "Viva Fire Protection Ltd";
  let orgAddress = "Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham OL4 3DZ";
  let orgPhone = "0845 269 8482";
  let orgEmail = "sales@vivafire.co.uk";
  let orgWebsite = "www.vivafire.co.uk";
  let orgRegNo = "06464084";
  try {
    const { data: brandingSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "org_branding")
      .maybeSingle();
    if (brandingSetting?.value && typeof brandingSetting.value === "object") {
      const b = brandingSetting.value as any;
      if (b.company_name) orgCompanyName = b.company_name;
      if (b.address) orgAddress = b.address;
      if (b.phone) orgPhone = b.phone;
      if (b.email) orgEmail = b.email;
      if (b.website) orgWebsite = b.website;
      if (b.reg_no) orgRegNo = b.reg_no;
    }
  } catch {}

  // Derive system type from job category
  const cat = (jobInfo.category || "").toLowerCase();
  const systemType = cat.includes("wet") ? "wet riser system"
    : cat.includes("hydrant") ? "hydrant system"
    : cat.includes("sprinkler") ? "sprinkler system"
    : "dry riser system";

  // Derive CoC cert number from the commissioning ref (e.g. VFP-00123/Comm-1 → VFP-00123/CoC-1)
  // or fall back to counting existing CoCs if no commissioning ref provided
  let certNumber = "";
  if (jobInfo.commissioning_ref) {
    certNumber = jobInfo.commissioning_ref.replace("/Comm-", "/CoC-");
  } else {
    const { data: existing } = await supabase
      .from("conformity_certificates" as any)
      .select("id")
      .eq("job_id", jobId);
    const existingCount = (existing as any[] | null)?.length ?? 0;
    const ref = jobInfo.reference_number || "";
    const baseRef = ref ? ref.replace(/-/g, "") : "";
    const certSuffix = existingCount === 0 ? "/CoC" : `/CoC-${existingCount + 1}`;
    certNumber = baseRef ? `${baseRef}${certSuffix}` : "";
  }

  // Use the commissioning ref as the stored reference_number so it's traceable
  const ref = jobInfo.commissioning_ref || jobInfo.reference_number || "";

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
    // Store org company name and system type so PDF can use them
    test_outcome: systemType,
    // Store full org details as JSON in test_notes for PDF rendering
    test_notes: JSON.stringify({ orgCompanyName, orgAddress, orgPhone, orgEmail, orgWebsite, orgRegNo }),
  } as any);
}

/** Standalone PDF generator — matches actual Viva Fire Certificate of Conformity layout */
export async function generateConformityPdfBase64(cert: ConformityCert): Promise<{ base64: string; fileName: string }> {
  const { default: jsPDF } = await import("jspdf");
  const { loadWatermarkImage, addWatermarkToAllPages } = await import("@/lib/pdfWatermark");
  const { fetchCustomerAccreditationLogos, loadAccreditationLogos, renderAccreditationLogos } = await import("@/lib/pdfAccreditations");

  // ── Org branding — try stored JSON in test_notes first, then fetch live ──
  let orgCompanyName = "Viva Fire Protection Ltd";
  let orgAddress = "Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham OL4 3DZ";
  let orgPhone = "0845 269 8482";
  let orgEmail = "sales@vivafire.co.uk";
  let orgWebsite = "www.vivafire.co.uk";
  let orgRegNo = "06464084";

  // Try to parse stored JSON from test_notes
  let extraNotes = "";
  if (cert.test_notes) {
    try {
      const parsed = JSON.parse(cert.test_notes);
      if (parsed && typeof parsed === "object" && parsed.orgCompanyName) {
        orgCompanyName = parsed.orgCompanyName || orgCompanyName;
        orgAddress = parsed.orgAddress || orgAddress;
        orgPhone = parsed.orgPhone || orgPhone;
        orgEmail = parsed.orgEmail || orgEmail;
        orgWebsite = parsed.orgWebsite || orgWebsite;
        orgRegNo = parsed.orgRegNo || orgRegNo;
      } else {
        extraNotes = cert.test_notes;
      }
    } catch {
      extraNotes = cert.test_notes;
    }
  }

  // Fetch live org branding as fallback/override
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: brandingSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "org_branding")
      .maybeSingle();
    if (brandingSetting?.value && typeof brandingSetting.value === "object") {
      const b = brandingSetting.value as any;
      if (b.company_name) orgCompanyName = b.company_name;
      if (b.address) orgAddress = b.address;
      if (b.phone) orgPhone = b.phone;
      if (b.email) orgEmail = b.email;
      if (b.website) orgWebsite = b.website;
      if (b.reg_no) orgRegNo = b.reg_no;
    }
  } catch {}

  // System type from test_outcome field (stored at creation) or default
  const systemType = cert.test_outcome && cert.test_outcome !== "pass"
    ? cert.test_outcome
    : "dry riser system";
  const systemTypeTitle = systemType
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ML = 20; // left margin
  const MR = 20; // right margin
  const contentW = pw - ML - MR;

  // ── Watermark ────────────────────────────────────────────────────────
  const { loadWatermarkSettings } = await import("@/hooks/useWatermarkSettings");
  const watermarkSettings = await loadWatermarkSettings();
  const custAccredUrls = await fetchCustomerAccreditationLogos(cert.customer_name);
  const [watermark, logos] = await Promise.all([
    loadWatermarkImage(),
    loadAccreditationLogos(custAccredUrls),
  ]);
  if (watermark)
    addWatermarkToAllPages(doc, watermark, undefined, {
      mode: watermarkSettings.mode,
      opacity: watermarkSettings.opacity,
    });

  // ── Logo — top right ─────────────────────────────────────────────────
  const logoW = 52;
  const logoH = 20;
  try {
    const logoUrl = `${window.location.origin}/images/vivafire-logo-new.jpg`;
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    doc.addImage(logoBase64, "JPEG", pw - MR - logoW, 10, logoW, logoH);
  } catch {}

  // ── Title bands (grey shaded rows) ───────────────────────────────────
  let y = 38;
  const bandColor: [number, number, number] = PDF_PALETTE.headerStrip;
  const bandH = 9;
  const bandGap = 2;

  const drawTitleBand = (text: string, fontSize: number) => {
    doc.setFillColor(...bandColor);
    doc.rect(ML, y, contentW, bandH, "F");
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(30, 30, 30);
    doc.text(text, pw / 2, y + 6.2, { align: "center" });
    y += bandH + bandGap;
  };

  drawTitleBand(systemTypeTitle, 12);
  drawTitleBand("Certificate of Conformity", 14);
  drawTitleBand(`Certificate Number ${cert.certificate_number || "—"}`, 12);

  y += 8;

  // ── BUILDING section (left-aligned) ─────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  // Underlined BUILDING label
  doc.text("BUILDING", ML, y);
  const buildingLabelW = doc.getTextWidth("BUILDING");
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.line(ML, y + 1, ML + buildingLabelW, y + 1);
  y += 7;

  // Building name
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const buildingLines = doc.splitTextToSize(cert.job_name || "—", contentW);
  doc.text(buildingLines, ML, y);
  y += buildingLines.length * 5.5 + 4;

  // Client
  doc.setFont("helvetica", "bold");
  doc.text("Client \u2013 ", ML, y);
  const clientLabelW = doc.getTextWidth("Client \u2013 ");
  doc.setFont("helvetica", "normal");
  doc.text(cert.customer_name || "—", ML + clientLabelW, y);
  y += 7;

  // Date of Test (bold + underlined label)
  doc.setFont("helvetica", "bold");
  const dateLabel = `Date of Test: ${cert.issue_date || "—"}`;
  doc.text(dateLabel, ML, y);
  const dateLabelW = doc.getTextWidth(dateLabel);
  doc.line(ML, y + 1, ML + dateLabelW, y + 1);
  y += 10;

  // ── Body paragraphs (left-aligned) ───────────────────────────────────
  const inletQty = cert.inlet_qty ?? 1;
  const outletQty = cert.outlet_qty ?? 2;
  const pressureBar = cert.pressure_bar ?? 12;
  const pressureDuration = cert.pressure_duration ?? 15;
  const sysQty = cert.system_qty ?? 1;
  const sysText = sysQty === 1 ? `one ${systemType}` : `${sysQty} ${systemType}s`;
  const inletWord = inletQty === 1 ? "inlet valve" : "inlet valves";
  const outletWord = outletQty === 1 ? "outlet valve" : "outlet valves";

  const bodyParas = [
    `${orgCompanyName}, confirm having installed, inspected and tested ${sysText} at the above site.`,
    "The system was found to conform to the requirements of BS 9990:2015",
    `The ${systemType} comprises of ${inletQty} ${inletWord} and ${outletQty} ${outletWord}.`,
    `The ${orgCompanyName} test comprised of static pressure test with water to ${pressureBar} bar of the whole system for ${pressureDuration} minutes`,
  ];
  if (extraNotes) bodyParas.push(extraNotes);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  for (const para of bodyParas) {
    const lines = doc.splitTextToSize(para, contentW);
    doc.text(lines, ML, y);
    y += lines.length * 5.8 + 4;
  }

  y += 4;

  // ── Sign-off row — left label, date tabbed right ──────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Signed on behalf of ${orgCompanyName}`, ML, y);
  doc.text(`Date ${cert.sign_date || "—"}`, pw - MR, y, { align: "right" });
  y += 10;

  // ── Signature — left aligned ─────────────────────────────────────────
  if (cert.engineer_signature) {
    try {
      doc.addImage(cert.engineer_signature, "PNG", ML, y, 45, 16);
      y += 18;
    } catch {}
  } else {
    doc.setDrawColor(160, 160, 160);
    doc.rect(ML, y, 55, 14);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "italic");
    doc.text("Signature pending", ML + 27.5, y + 8, { align: "center" });
    doc.setTextColor(30, 30, 30);
    y += 16;
  }

  // Engineer name — bold, left aligned
  if (cert.engineer_name) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(cert.engineer_name, ML, y + 2);
    y += 8;
  }

  // ── Footer area ──────────────────────────────────────────────────────
  const footerBandY = ph - 22;
  const accrH = 12;
  if (watermarkSettings.mode !== "none") {
    renderAccreditationLogos(doc, logos, footerBandY - accrH - 6, accrH, watermarkSettings.opacity);
  }

  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.3);
  doc.line(ML, footerBandY - 3, pw - MR, footerBandY - 3);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(`${orgCompanyName},  ${orgAddress}`, ML, footerBandY + 2);
  doc.text(`Company Reg No: ${orgRegNo}`, pw - MR, footerBandY + 2, { align: "right" });

  // Bold contact strip at very bottom
  doc.setFillColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  const stripY = ph - 8;
  doc.text(`Tel: ${orgPhone}`, ML, stripY);
  doc.text(orgEmail, pw / 2, stripY, { align: "center" });
  doc.text(orgWebsite, pw - MR, stripY, { align: "right" });

  const base64 = doc.output("datauristring").split(",")[1];
  const fileName = `CoC-${cert.certificate_number || cert.reference_number || cert.job_id.slice(0, 8)}.pdf`;
  return { base64, fileName };
}
