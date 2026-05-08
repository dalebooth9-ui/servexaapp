import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
  ShieldCheck,
  XCircle,
  Save,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "email_delivery_settings_v1";
const DEFAULTS = {
  rootDomain: "vivafire.co.uk",
  senderSubdomain: "notify.vivafire.co.uk",
  fromName: "Servexa",
  fromLocal: "noreply",
};

type EmailSettings = typeof DEFAULTS;

function loadSettings(): EmailSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; to: string; at: string }
  | { kind: "error"; message: string };

type CheckStatus = "ok" | "warn" | "fail" | "loading";

interface DnsCheck {
  label: string;
  detail: string;
  status: CheckStatus;
  records: string[];
}

interface DomainStatus {
  loading: boolean;
  checkedAt: string | null;
  overall: CheckStatus;
  checks: DnsCheck[];
  error?: string;
}

const DOH = "https://cloudflare-dns.com/dns-query";

async function dohQuery(name: string, type: string): Promise<string[]> {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error(`DNS query failed (${res.status})`);
  const json = await res.json();
  if (!json?.Answer) return [];
  return (json.Answer as Array<{ data: string }>).map((a) =>
    String(a.data).replace(/^"|"$/g, "").replace(/\.$/, "")
  );
}

async function runDomainStatusChecks(rootDomain: string, senderSubdomain: string): Promise<DomainStatus> {
  const checks: DnsCheck[] = [];

  try {
    const txt = await dohQuery(senderSubdomain, "TXT");
    const spf = txt.find((t) => t.toLowerCase().startsWith("v=spf1"));
    const hasResend = spf ? /amazonses\.com|_spf\.resend\.com/i.test(spf) : false;
    checks.push({
      label: "SPF record (Resend)",
      detail: spf
        ? hasResend
          ? "SPF authorises Resend (Amazon SES) to send"
          : "SPF present but does not include Resend/Amazon SES"
        : "No SPF (v=spf1) record found",
      status: spf && hasResend ? "ok" : spf ? "warn" : "fail",
      records: spf ? [spf] : ["(none)"],
    });
  } catch (err: any) {
    checks.push({ label: "SPF record (Resend)", detail: `Lookup failed: ${err?.message || "unknown error"}`, status: "warn", records: [] });
  }

  try {
    const recs = await dohQuery(`resend._domainkey.${senderSubdomain}`, "TXT");
    const dk = recs.find((r) => r.toLowerCase().includes("p=") || r.toLowerCase().includes("k=rsa"));
    checks.push({
      label: "DKIM signing key (Resend)",
      detail: dk ? "DKIM key published at resend._domainkey" : "No DKIM key found at resend._domainkey",
      status: dk ? "ok" : "fail",
      records: dk ? [dk.slice(0, 80) + (dk.length > 80 ? "…" : "")] : ["(none)"],
    });
  } catch (err: any) {
    checks.push({ label: "DKIM signing key (Resend)", detail: `Lookup failed: ${err?.message || "unknown error"}`, status: "fail", records: [] });
  }

  try {
    const mx = await dohQuery(`send.${senderSubdomain}`, "MX");
    const hasSes = mx.some((m) => /amazonses\.com|feedback-smtp/i.test(m));
    checks.push({
      label: "MX (bounce handling)",
      detail: mx.length
        ? hasSes
          ? "Resend bounce MX configured (feedback-smtp)"
          : "MX present but not Resend's feedback host"
        : "No MX record on send subdomain — bounce tracking disabled",
      status: hasSes ? "ok" : "warn",
      records: mx.length ? mx : ["(none)"],
    });
  } catch (err: any) {
    checks.push({ label: "MX (bounce handling)", detail: `Lookup failed: ${err?.message || "unknown error"}`, status: "warn", records: [] });
  }

  try {
    const recs = await dohQuery(`_dmarc.${rootDomain}`, "TXT");
    const dmarc = recs.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    checks.push({
      label: "DMARC policy",
      detail: dmarc ? "DMARC policy published on root domain" : "No DMARC policy found (recommended for deliverability)",
      status: dmarc ? "ok" : "warn",
      records: dmarc ? [dmarc] : ["(none)"],
    });
  } catch (err: any) {
    checks.push({ label: "DMARC policy", detail: `Lookup failed: ${err?.message || "unknown error"}`, status: "warn", records: [] });
  }

  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const overall: CheckStatus = hasFail ? "fail" : hasWarn ? "warn" : "ok";

  return { loading: false, checkedAt: new Date().toLocaleTimeString(), overall, checks };
}

function StatusDot({ status }: { status: CheckStatus }) {
  if (status === "loading") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === "warn") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function OverallBadge({ status }: { status: CheckStatus }) {
  if (status === "loading") return <Badge variant="secondary">Checking…</Badge>;
  if (status === "ok") return <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Verified</Badge>;
  if (status === "warn") return <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Propagating</Badge>;
  return <Badge variant="destructive">Not verified</Badge>;
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export default function EmailDeliveryTestCard() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<EmailSettings>(() => loadSettings());
  const [draft, setDraft] = useState<EmailSettings>(settings);
  const [to, setTo] = useState("");
  const [state, setState] = useState<SendState>({ kind: "idle" });
  const [domain, setDomain] = useState<DomainStatus>({
    loading: true, checkedAt: null, overall: "loading", checks: [],
  });

  const fromAddress = useMemo(
    () => `${settings.fromName} <${settings.fromLocal}@${settings.senderSubdomain}>`,
    [settings]
  );

  const refreshDomain = useCallback(async () => {
    setDomain((d) => ({ ...d, loading: true, overall: "loading" }));
    try {
      const result = await runDomainStatusChecks(settings.rootDomain, settings.senderSubdomain);
      setDomain(result);
    } catch (err: any) {
      setDomain({
        loading: false, checkedAt: new Date().toLocaleTimeString(), overall: "fail",
        checks: [], error: err?.message || "Failed to check DNS",
      });
    }
  }, [settings.rootDomain, settings.senderSubdomain]);

  useEffect(() => { refreshDomain(); }, [refreshDomain]);

  useEffect(() => {
    if (user?.email && !to) setTo(user.email);
  }, [user?.email]);

  const dirty =
    draft.rootDomain !== settings.rootDomain ||
    draft.senderSubdomain !== settings.senderSubdomain ||
    draft.fromName !== settings.fromName ||
    draft.fromLocal !== settings.fromLocal;

  const saveSettings = () => {
    const root = draft.rootDomain.trim().toLowerCase();
    const sub = draft.senderSubdomain.trim().toLowerCase();
    const local = draft.fromLocal.trim();
    if (!DOMAIN_RE.test(root)) { toast.error("Invalid root domain"); return; }
    if (!DOMAIN_RE.test(sub)) { toast.error("Invalid sender subdomain"); return; }
    if (!sub.endsWith(`.${root}`) && sub !== root) {
      toast.error("Sender subdomain must be a subdomain of the root domain");
      return;
    }
    if (!/^[a-z0-9._%+-]+$/i.test(local)) { toast.error("Invalid local-part for from address"); return; }
    const next = { rootDomain: root, senderSubdomain: sub, fromName: draft.fromName.trim() || "Servexa", fromLocal: local };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSettings(next);
    setDraft(next);
    toast.success("Email settings saved");
  };

  const resetDefaults = () => {
    setDraft({ ...DEFAULTS });
  };

  const sendTest = async () => {
    const trimmed = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    setState({ kind: "sending" });
    try {
      const { data, error } = await supabase.functions.invoke("test-resend-email", {
        body: { to: trimmed, from: fromAddress, subject: "Servexa — email delivery test" },
      });
      if (error) throw new Error(error.message || "Failed to send");
      if (data && data.success === false) {
        const detail =
          (data.detail && (data.detail.message || data.detail.error || JSON.stringify(data.detail))) ||
          data.error || "Email gateway rejected the request";
        throw new Error(detail);
      }
      setState({ kind: "success", to: trimmed, at: new Date().toLocaleTimeString() });
      toast.success(`Test email sent to ${trimmed}`);
    } catch (err: any) {
      const message = err?.message || "Failed to send test email";
      setState({ kind: "error", message });
      toast.error(message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Email delivery & domain status</CardTitle>
        </div>
        <CardDescription>
          Configure your sender domain and run a live DNS check (SPF, DKIM, MX, DMARC) plus a one-click test send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Settings form */}
        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">Sender configuration</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="root-domain">Root domain</Label>
              <Input
                id="root-domain"
                placeholder="vivafire.co.uk"
                value={draft.rootDomain}
                onChange={(e) => setDraft({ ...draft, rootDomain: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Used for the DMARC check (_dmarc.&lt;root&gt;).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-subdomain">Sender subdomain</Label>
              <Input
                id="sender-subdomain"
                placeholder="notify.vivafire.co.uk"
                value={draft.senderSubdomain}
                onChange={(e) => setDraft({ ...draft, senderSubdomain: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Verified in Resend. Used for SPF, DKIM &amp; MX checks.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from-name">From display name</Label>
              <Input
                id="from-name"
                placeholder="Servexa"
                value={draft.fromName}
                onChange={(e) => setDraft({ ...draft, fromName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from-local">From mailbox</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="from-local"
                  placeholder="noreply"
                  value={draft.fromLocal}
                  onChange={(e) => setDraft({ ...draft, fromLocal: e.target.value })}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">@{draft.senderSubdomain}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground font-mono break-all">
              From: {draft.fromName} &lt;{draft.fromLocal}@{draft.senderSubdomain}&gt;
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={resetDefaults}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" onClick={saveSettings} disabled={!dirty}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </div>
        </div>

        {/* Domain status */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Domain verification</p>
              <OverallBadge status={domain.overall} />
            </div>
            <Button variant="outline" size="sm" onClick={refreshDomain} disabled={domain.loading}>
              {domain.loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
              Recheck
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Checking <span className="font-mono">{settings.senderSubdomain}</span> (DMARC on <span className="font-mono">{settings.rootDomain}</span>).
          </p>

          {domain.error && <p className="text-xs text-destructive">{domain.error}</p>}

          <ul className="space-y-1.5">
            {domain.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                <StatusDot status={c.status} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-tight">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                  {c.records.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/80 font-mono break-all mt-0.5">
                      {c.records.join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {domain.loading && domain.checks.length === 0 && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Querying DNS…
              </li>
            )}
          </ul>

          {domain.checkedAt && (
            <p className="text-[11px] text-muted-foreground">
              Checked at {domain.checkedAt} via Cloudflare DNS. DNS changes can take up to 72 hours to fully propagate.
            </p>
          )}
        </div>

        {/* Send test */}
        <div className="space-y-1.5">
          <Label htmlFor="email-test-to">Send test email to</Label>
          <div className="flex gap-2">
            <Input
              id="email-test-to"
              type="email"
              placeholder="you@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={state.kind === "sending"}
              className="flex-1"
            />
            <Button onClick={sendTest} disabled={state.kind === "sending" || !to.trim()}>
              {state.kind === "sending" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              {state.kind === "sending" ? "Sending..." : "Send test"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sends from <span className="font-mono">{fromAddress}</span>. Save changes above before testing a new sender.
          </p>
        </div>

        {state.kind === "success" && (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">Test email sent</p>
              <p className="text-xs text-muted-foreground">
                Sent to {state.to} at {state.at}. Check the inbox (and spam folder) to confirm delivery.
              </p>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="font-medium">Test email failed</p>
              <p className="text-xs text-muted-foreground break-words">{state.message}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
