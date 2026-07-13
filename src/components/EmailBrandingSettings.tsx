import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Palette, Loader2, Save, Send, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BrandingRow {
  id?: string;
  org_id?: string;
  from_name: string;
  from_address: string;
  reply_to: string;
  logo_url: string | null;
  brand_color: string;
  company_name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  signature_html: string | null;
  footer_note: string | null;
}

const DEFAULTS: BrandingRow = {
  from_name: "Viva Fire Protection",
  from_address: "service@vivafire.co.uk",
  reply_to: "service@vivafire.co.uk",
  logo_url: null,
  brand_color: "#1e40af",
  company_name: "Viva Fire Protection Ltd",
  phone: null,
  website: "https://www.vivafire.co.uk",
  address: null,
  signature_html: null,
  footer_note:
    "This is an automated email from Viva Fire Protection. Reply to this message to contact us directly.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPreviewHtml(b: BrandingRow): string {
  const brand = b.brand_color || "#1e40af";
  const logo = b.logo_url
    ? `<img src="${b.logo_url}" alt="${escapeHtml(b.company_name)}" style="max-height:56px;max-width:220px;display:block;border:0;outline:none;" />`
    : `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(b.company_name)}</h1>`;
  const phoneClean = (b.phone || "").replace(/\s+/g, "");
  const sig = (b.signature_html && b.signature_html.trim().length > 0)
    ? b.signature_html
    : `
      <p style="margin:0 0 4px;font-weight:600;color:#111827;font-size:14px;">${escapeHtml(b.company_name)}</p>
      ${b.phone ? `<p style="margin:0;font-size:13px;color:#374151;">Tel: <a href="tel:${phoneClean}" style="color:${brand};text-decoration:none;">${escapeHtml(b.phone)}</a></p>` : ""}
      ${b.website ? `<p style="margin:0;font-size:13px;color:#374151;">Web: <a href="${b.website}" style="color:${brand};text-decoration:none;">${escapeHtml(b.website.replace(/^https?:\/\//, ""))}</a></p>` : ""}
      ${b.address ? `<p style="margin:6px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml(b.address)}</p>` : ""}
    `;

  const sampleBody = `
    <p>Hi,</p>
    <p>We've booked in a new job for you: <strong>VFP-01234</strong> — 6-month sprinkler visual inspection.</p>
    <p><strong>Location:</strong> 1 Example Way, Sheffield S1 1AA</p>
    <p>We'll keep you updated as it progresses. If you need to reach us about it, just reply to this email.</p>
    <p>Kind regards,<br/>${escapeHtml(b.company_name)}</p>
  `;

  return `
    <div style="background:#f4f6f9;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">
        <div style="background:${brand};padding:20px 28px;">${logo}</div>
        <div style="padding:28px;font-size:15px;line-height:1.6;">${sampleBody}</div>
        <div style="padding:20px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">${sig}</div>
        ${b.footer_note ? `<div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #eef1f4;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">${escapeHtml(b.footer_note)}</div>` : ""}
      </div>
    </div>
  `;
}

export default function EmailBrandingSettings() {
  const { user } = useAuth();
  const [row, setRow] = useState<BrandingRow>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("email_branding")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        toast.error(`Failed to load branding: ${error.message}`);
      } else if (data) {
        setRow({ ...DEFAULTS, ...(data as any) });
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (user?.email && !testEmail) setTestEmail(user.email);
  }, [user?.email]);

  const previewHtml = useMemo(() => buildPreviewHtml(row), [row]);

  const update = <K extends keyof BrandingRow>(k: K, v: BrandingRow[K]) =>
    setRow((prev) => ({ ...prev, [k]: v }));

  const validate = (): string | null => {
    if (!row.from_name.trim()) return "From name is required";
    if (!EMAIL_RE.test(row.from_address)) return "From address is not a valid email";
    if (!EMAIL_RE.test(row.reply_to)) return "Reply-to is not a valid email";
    if (!HEX_RE.test(row.brand_color)) return "Brand colour must be a hex value like #1e40af";
    if (!row.company_name.trim()) return "Company name is required";
    if (row.website && !/^https?:\/\//i.test(row.website)) return "Website must start with http(s)://";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    const payload: any = {
      from_name: row.from_name.trim(),
      from_address: row.from_address.trim(),
      reply_to: row.reply_to.trim(),
      logo_url: row.logo_url,
      brand_color: row.brand_color.trim(),
      company_name: row.company_name.trim(),
      phone: row.phone,
      website: row.website,
      address: row.address,
      signature_html: row.signature_html,
      footer_note: row.footer_note,
    };
    const { error } = row.id
      ? await supabase.from("email_branding").update(payload).eq("id", row.id)
      : await supabase.from("email_branding").insert(payload);
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else {
      toast.success("Email branding saved");
      // reload to pick up id/org_id
      const { data } = await supabase.from("email_branding").select("*").limit(1).maybeSingle();
      if (data) setRow({ ...DEFAULTS, ...(data as any) });
    }
  };

  const onLogoUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2MB"); return; }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `email-branding/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("customer-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("customer-logos").getPublicUrl(path);
      update("logo_url", data.publicUrl);
      toast.success("Logo uploaded — remember to Save");
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message || e}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const sendPreview = async () => {
    const to = testEmail.trim();
    if (!EMAIL_RE.test(to)) { toast.error("Enter a valid email"); return; }
    // Save first if dirty? Just send — helper reads latest DB row.
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-branded-preview", { body: { to } });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.detail?.message || "Send failed");
      toast.success(`Preview sent to ${to}`);
    } catch (e: any) {
      toast.error(`Send failed: ${e.message || e}`);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Email signature &amp; branding</CardTitle>
          </div>
        </CardHeader>
        <CardContent><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Email signature &amp; branding</CardTitle>
        </div>
        <CardDescription>
          Controls how <strong>all automated customer emails</strong> look and who they appear from —
          booking confirmations, date notifications, follow-ups, compliance reminders and report deliveries.
          Save your changes then send yourself a preview to check it renders in Outlook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sender identity */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Sender identity</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>From name</Label>
              <Input value={row.from_name} onChange={(e) => update("from_name", e.target.value)} placeholder="Viva Fire Protection" />
            </div>
            <div className="space-y-1">
              <Label>From address</Label>
              <Input value={row.from_address} onChange={(e) => update("from_address", e.target.value)} placeholder="service@vivafire.co.uk" />
              <p className="text-[11px] text-muted-foreground">Must be on a domain verified in Resend.</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Reply-to</Label>
              <Input value={row.reply_to} onChange={(e) => update("reply_to", e.target.value)} placeholder="service@vivafire.co.uk" />
              <p className="text-[11px] text-muted-foreground">Customer replies to automated emails land here.</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Branding */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Branding</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label>Company name</Label>
              <Input value={row.company_name} onChange={(e) => update("company_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Brand colour</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 rounded border cursor-pointer"
                  value={HEX_RE.test(row.brand_color) ? row.brand_color : "#1e40af"}
                  onChange={(e) => update("brand_color", e.target.value)}
                />
                <Input className="w-28 font-mono" value={row.brand_color} onChange={(e) => update("brand_color", e.target.value)} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {row.logo_url ? (
                <img src={row.logo_url} alt="Logo" className="h-12 w-auto rounded border bg-white p-1" />
              ) : (
                <div className="h-12 w-24 flex items-center justify-center rounded border bg-muted text-muted-foreground text-xs">
                  <ImageIcon className="h-4 w-4 mr-1" /> None
                </div>
              )}
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onLogoUpload(e.target.files[0])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("logo-upload")?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Uploading…</> : "Upload logo"}
              </Button>
              {row.logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => update("logo_url", null)}>Remove</Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">PNG or SVG on a transparent background works best. Max 2MB.</p>
          </div>
        </section>

        <Separator />

        {/* Signature */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Signature block</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={row.phone ?? ""} onChange={(e) => update("phone", e.target.value || null)} placeholder="0114 123 4567" />
            </div>
            <div className="space-y-1">
              <Label>Website</Label>
              <Input value={row.website ?? ""} onChange={(e) => update("website", e.target.value || null)} placeholder="https://www.vivafire.co.uk" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Address</Label>
              <Input value={row.address ?? ""} onChange={(e) => update("address", e.target.value || null)} placeholder="Unit 1, Example Estate, Sheffield S1 1AA" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Custom signature HTML (optional — overrides the fields above)</Label>
              <Textarea rows={4} value={row.signature_html ?? ""} onChange={(e) => update("signature_html", e.target.value || null)} placeholder="<p>Custom HTML signature…</p>" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Footer note</Label>
              <Input value={row.footer_note ?? ""} onChange={(e) => update("footer_note", e.target.value || null)} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : <><Save className="mr-1.5 h-4 w-4" /> Save branding</>}
          </Button>
        </div>

        <Separator />

        {/* Live preview */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Live preview</h3>
          <div className="rounded-lg border overflow-hidden" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          <p className="text-[11px] text-muted-foreground">
            This is a client-side preview of the template. Save your changes then send a real test below to check how it renders in Outlook.
          </p>
        </section>

        <Separator />

        {/* Send test */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Send a test email</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[220px]">
              <Label>Send to</Label>
              <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <Button onClick={sendPreview} disabled={sending}>
              {sending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</> : <><Send className="mr-1.5 h-4 w-4" /> Send preview</>}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sends a sample booking-confirmation email using your saved branding, from{" "}
            <code className="font-mono">{row.from_name} &lt;{row.from_address}&gt;</code>{" "}
            with reply-to <code className="font-mono">{row.reply_to}</code>.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
