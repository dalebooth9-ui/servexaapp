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
  strapline: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  signature_html: string | null;
  footer_note: string | null;
  accreditation_logo_urls: string[];
  sign_off_text: string;
}

const DEFAULTS: BrandingRow = {
  from_name: "Viva Fire Protection",
  from_address: "service@vivafire.co.uk",
  reply_to: "service@vivafire.co.uk",
  logo_url: null,
  brand_color: "#1e40af",
  company_name: "Viva Fire Protection Ltd",
  strapline: "Wet & Dry Riser Specialists",
  phone: "0845 269 8482",
  website: "https://www.vivafire.co.uk",
  address: "Unit 1 Lady Road, St Johns Industrial Estate, Lees, Oldham, OL4 3DZ",
  signature_html: null,
  footer_note:
    "This is an automated email from Viva Fire Protection. Reply to this message to contact us directly.",
  accreditation_logo_urls: [],
  sign_off_text: "Kind regards,",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderSignatureHtml(b: BrandingRow, senderName: string): string {
  const brand = b.brand_color || "#1e40af";
  const phoneClean = (b.phone || "").replace(/\s+/g, "");
  const websiteHref = b.website
    ? (/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`)
    : "";
  const websiteLabel = b.website ? b.website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const signOff = (b.sign_off_text && b.sign_off_text.trim()) || "Kind regards,";

  const signOffBlock = `
    <p style="margin:0 0 14px;color:#111827;font-size:14px;line-height:1.5;">
      ${escapeHtml(signOff)}<br/>
      <strong>${escapeHtml(senderName)}</strong>
    </p>`;

  const divider = `<div style="height:3px;background:${brand};margin:0 0 14px;line-height:3px;font-size:0;">&nbsp;</div>`;

  const logoRow = b.logo_url
    ? `<img src="${b.logo_url}" alt="${escapeHtml(b.company_name)}" width="180" style="max-height:60px;max-width:180px;display:block;border:0;outline:none;margin:0 0 6px;" />`
    : `<p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:16px;">${escapeHtml(b.company_name)}</p>`;

  const strapline = b.strapline
    ? `<p style="margin:0 0 10px;color:${brand};font-size:12px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(b.strapline)}</p>`
    : "";

  const rows: string[] = [];
  if (b.phone) rows.push(`<tr><td style="padding:1px 0;font-size:12px;color:#374151;">Tel: <a href="tel:${phoneClean}" style="color:${brand};text-decoration:none;">${escapeHtml(b.phone)}</a></td></tr>`);
  if (b.from_address) rows.push(`<tr><td style="padding:1px 0;font-size:12px;color:#374151;">Email: <a href="mailto:${b.from_address}" style="color:${brand};text-decoration:none;">${escapeHtml(b.from_address)}</a></td></tr>`);
  if (b.website) rows.push(`<tr><td style="padding:1px 0;font-size:12px;color:#374151;">Web: <a href="${websiteHref}" style="color:${brand};text-decoration:none;">${escapeHtml(websiteLabel)}</a></td></tr>`);
  const contact = rows.length ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows.join("")}</table>` : "";

  const address = b.address
    ? `<p style="margin:0 0 10px;font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml(b.address)}</p>`
    : "";

  const accreditations = b.accreditation_logo_urls.length
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px 0 0;"><tr>${b.accreditation_logo_urls
        .filter(Boolean)
        .map((url) => `<td style="padding:0 8px 0 0;vertical-align:middle;"><img src="${url}" alt="Accreditation" height="34" style="height:34px;width:auto;max-height:34px;display:block;border:0;outline:none;" /></td>`)
        .join("")}</tr></table>`
    : "";

  const body = (b.signature_html && b.signature_html.trim().length > 0)
    ? b.signature_html
    : `${logoRow}${strapline}${contact}${address}${accreditations}`;

  return `${signOffBlock}${divider}${body}`;
}

function buildPreviewHtml(b: BrandingRow, senderName: string): string {
  const brand = b.brand_color || "#1e40af";
  const headerLogo = b.logo_url
    ? `<img src="${b.logo_url}" alt="${escapeHtml(b.company_name)}" style="max-height:56px;max-width:220px;display:block;border:0;outline:none;" />`
    : `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(b.company_name)}</h1>`;

  const sig = renderSignatureHtml(b, senderName);

  const sampleBody = `
    <p>Hi,</p>
    <p>We've booked in a new job for you: <strong>VFP-01234</strong> — 6-month sprinkler visual inspection.</p>
    <p><strong>Location:</strong> 1 Example Way, Sheffield S1 1AA</p>
    <p>We'll keep you updated as it progresses. If you need to reach us about it, just reply to this email.</p>
  `;

  return `
    <div style="background:#f4f6f9;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">
        <div style="background:${brand};padding:20px 28px;">${headerLogo}</div>
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

  const previewSenderName = (user as any)?.user_metadata?.full_name || user?.email || row.company_name;
  const previewHtml = useMemo(
    () => buildPreviewHtml(row, previewSenderName),
    [row, previewSenderName],
  );

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
      strapline: row.strapline,
      phone: row.phone,
      website: row.website,
      address: row.address,
      signature_html: row.signature_html,
      footer_note: row.footer_note,
      accreditation_logo_urls: row.accreditation_logo_urls || [],
      sign_off_text: row.sign_off_text || "Kind regards,",
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

  const onAccreditationUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadingLogo(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 2 * 1024 * 1024) { toast.error(`${file.name} is over 2MB`); continue; }
        const ext = file.name.split(".").pop() || "png";
        const path = `email-branding/accreditations/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("customer-logos")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        const { data } = supabase.storage.from("customer-logos").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      if (uploaded.length) {
        update("accreditation_logo_urls", [...(row.accreditation_logo_urls || []), ...uploaded]);
        toast.success(`${uploaded.length} accreditation logo(s) uploaded — remember to Save`);
      }
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeAccreditation = (idx: number) => {
    const next = [...(row.accreditation_logo_urls || [])];
    next.splice(idx, 1);
    update("accreditation_logo_urls", next);
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
          <div className="space-y-1">
            <Label>Strapline</Label>
            <Input value={row.strapline ?? ""} onChange={(e) => update("strapline", e.target.value || null)} placeholder="Wet & Dry Riser Specialists" />
            <p className="text-[11px] text-muted-foreground">Short tagline shown under the logo in the signature.</p>
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
              <Label>Sign-off text</Label>
              <Input value={row.sign_off_text ?? ""} onChange={(e) => update("sign_off_text", e.target.value)} placeholder="Kind regards," />
              <p className="text-[11px] text-muted-foreground">Appears above the signature. The sender's full name is added automatically (falls back to company name for system emails).</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Footer note</Label>
              <Input value={row.footer_note ?? ""} onChange={(e) => update("footer_note", e.target.value || null)} />
            </div>
          </div>
        </section>

        <Separator />

        {/* Accreditations */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Accreditation logos</h3>
          <p className="text-[11px] text-muted-foreground">Displayed in a row at the bottom of the signature (Constructionline, SSIP, SMAS Worksafe, FIRAS, ISO 9001, BAFE, etc.). Upload transparent PNGs at roughly the same height for best results.</p>
          <div className="flex flex-wrap items-center gap-2">
            {(row.accreditation_logo_urls || []).map((url, idx) => (
              <div key={url + idx} className="relative rounded border bg-white p-1">
                <img src={url} alt="Accreditation" className="h-10 w-auto" />
                <button
                  type="button"
                  onClick={() => removeAccreditation(idx)}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none flex items-center justify-center"
                  aria-label="Remove accreditation"
                >×</button>
              </div>
            ))}
            <input
              id="accreditation-upload"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { onAccreditationUpload(e.target.files); e.target.value = ""; }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("accreditation-upload")?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Uploading…</> : "Upload accreditation logo(s)"}
            </Button>
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
