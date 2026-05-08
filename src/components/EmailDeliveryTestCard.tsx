import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const ROOT_DOMAIN = "vivafire.co.uk";
const SENDER_SUBDOMAIN = `notify.${ROOT_DOMAIN}`;

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

async function runDomainStatusChecks(): Promise<DomainStatus> {
  const checks: DnsCheck[] = [];

  // 1. SPF — Resend requires include:amazonses.com
  try {
    const txt = await dohQuery(SENDER_SUBDOMAIN, "TXT");
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
    checks.push({
      label: "SPF record (Resend)",
      detail: `Lookup failed: ${err?.message || "unknown error"}`,
      status: "warn",
      records: [],
    });
  }

  // 2. DKIM — Resend publishes the selector "resend"
  try {
    const recs = await dohQuery(`resend._domainkey.${SENDER_SUBDOMAIN}`, "TXT");
    const dk = recs.find((r) => r.toLowerCase().includes("p=") || r.toLowerCase().includes("k=rsa"));
    checks.push({
      label: "DKIM signing key (Resend)",
      detail: dk ? "DKIM key published at resend._domainkey" : "No DKIM key found at resend._domainkey",
      status: dk ? "ok" : "fail",
      records: dk ? [dk.slice(0, 80) + (dk.length > 80 ? "…" : "")] : ["(none)"],
    });
  } catch (err: any) {
    checks.push({
      label: "DKIM signing key (Resend)",
      detail: `Lookup failed: ${err?.message || "unknown error"}`,
      status: "fail",
      records: [],
    });
  }

  // 3. MX — Resend bounce handling via Amazon SES feedback
  try {
    const mx = await dohQuery(`send.${SENDER_SUBDOMAIN}`, "MX");
    const hasSes = mx.some((m) => /amazonses\.com|feedback-smtp/i.test(m));
    checks.push({
      label: "MX (bounce handling)",
      detail: mx.length
        ? hasSes
          ? "Resend bounce MX configured (feedback-smtp)"
          : "MX present but not Resend's feedback host"
        : "No MX record on send subdomain — bounce tracking disabled",
      status: hasSes ? "ok" : mx.length ? "warn" : "warn",
      records: mx.length ? mx : ["(none)"],
    });
  } catch (err: any) {
    checks.push({
      label: "MX (bounce handling)",
      detail: `Lookup failed: ${err?.message || "unknown error"}`,
      status: "warn",
      records: [],
    });
  }

  // 4. DMARC on the root domain (recommended)
  try {
    const recs = await dohQuery(`_dmarc.${ROOT_DOMAIN}`, "TXT");
    const dmarc = recs.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    checks.push({
      label: "DMARC policy",
      detail: dmarc ? "DMARC policy published on root domain" : "No DMARC policy found (recommended for deliverability)",
      status: dmarc ? "ok" : "warn",
      records: dmarc ? [dmarc] : ["(none)"],
    });
  } catch (err: any) {
    checks.push({
      label: "DMARC policy",
      detail: `Lookup failed: ${err?.message || "unknown error"}`,
      status: "warn",
      records: [],
    });
  }

  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const overall: CheckStatus = hasFail ? "fail" : hasWarn ? "warn" : "ok";

  return {
    loading: false,
    checkedAt: new Date().toLocaleTimeString(),
    overall,
    checks,
  };
}

function StatusDot({ status }: { status: CheckStatus }) {
  if (status === "loading") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === "warn") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function OverallBadge({ status }: { status: CheckStatus }) {
  if (status === "loading")
    return <Badge variant="secondary">Checking…</Badge>;
  if (status === "ok")
    return <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Verified</Badge>;
  if (status === "warn")
    return <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Propagating</Badge>;
  return <Badge variant="destructive">Not verified</Badge>;
}

export default function EmailDeliveryTestCard() {
  const { user } = useAuth();
  const [to, setTo] = useState("");
  const [state, setState] = useState<SendState>({ kind: "idle" });
  const [domain, setDomain] = useState<DomainStatus>({
    loading: true,
    checkedAt: null,
    overall: "loading",
    checks: [],
  });

  const refreshDomain = useCallback(async () => {
    setDomain((d) => ({ ...d, loading: true, overall: "loading" }));
    try {
      const result = await runDomainStatusChecks();
      setDomain(result);
    } catch (err: any) {
      setDomain({
        loading: false,
        checkedAt: new Date().toLocaleTimeString(),
        overall: "fail",
        checks: [],
        error: err?.message || "Failed to check DNS",
      });
    }
  }, []);

  useEffect(() => {
    refreshDomain();
  }, [refreshDomain]);

  useEffect(() => {
    if (user?.email && !to) setTo(user.email);
  }, [user?.email]);

  const sendTest = async () => {
    const trimmed = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    setState({ kind: "sending" });
    try {
      const { data, error } = await supabase.functions.invoke("test-resend-email", {
        body: { to: trimmed, subject: "Servexa — email delivery test" },
      });
      if (error) throw new Error(error.message || "Failed to send");
      if (data && data.success === false) {
        const detail =
          (data.detail && (data.detail.message || data.detail.error || JSON.stringify(data.detail))) ||
          data.error ||
          "Email gateway rejected the request";
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
          Live DNS check for <strong>{SENDER_SUBDOMAIN}</strong> against Resend's required records (SPF, DKIM, MX, DMARC), plus a one-click test send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Domain status */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Domain verification</p>
              <OverallBadge status={domain.overall} />
            </div>
            <Button variant="outline" size="sm" onClick={refreshDomain} disabled={domain.loading}>
              {domain.loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Recheck
            </Button>
          </div>

          {domain.error && (
            <p className="text-xs text-destructive">{domain.error}</p>
          )}

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
              {state.kind === "sending" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              {state.kind === "sending" ? "Sending..." : "Send test"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            If the domain isn't fully verified yet, the test send will fail with a clear error.
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
