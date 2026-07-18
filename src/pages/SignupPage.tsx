import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Sparkles } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  fullName: z.string().trim().min(1, "Your name is required").max(100),
  orgName: z.string().trim().min(2, "Company name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  code: z.string().trim().min(4, "Invitation code is required").max(64),
});

export default function SignupPage() {
  const [params] = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(params.get("code") || "");
  const [seedTemplates, setSeedTemplates] = useState(true);
  const [codeStatus, setCodeStatus] = useState<{ valid: boolean; note?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Validate the invite code as the user types (debounced)
  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed.length < 4) { setCodeStatus(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("preview_signup_code", { _code: trimmed });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.valid) {
        setCodeStatus({ valid: true, note: row.note ?? undefined });
        if (row.seed_templates_default === false) setSeedTemplates(false);
      } else {
        setCodeStatus({ valid: false });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ fullName, orgName, email, password, code });
    if (!parsed.success) {
      toast({ title: "Check your details", description: parsed.error.errors[0]?.message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Server-side validation happens in provision-new-org after email confirmation,
      // but we short-circuit obvious bad codes to save the user a round-trip.
      if (codeStatus?.valid === false) {
        toast({ title: "Invalid invitation", description: "That code is not recognised.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: {
            full_name: parsed.data.fullName,
            signup_flow: "invite_code",
            signup_code: parsed.data.code,
            org_name: parsed.data.orgName,
            seed_templates: seedTemplates,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
        return;
      }
      // Log a signup intent for audit
      await supabase.from("signup_intents").insert({
        email: parsed.data.email,
        code: parsed.data.code,
        org_name: parsed.data.orgName,
        seed_templates: seedTemplates,
      }).select().maybeSingle().then(() => {}, () => {});
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <CardTitle className="mt-4">Check your email</CardTitle>
            <CardDescription>
              We've sent a confirmation link to <strong>{email}</strong>. Click it to finish
              creating <strong>{orgName}</strong> and sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-xs text-muted-foreground">
              Your workspace will be provisioned automatically the first time you sign in.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>Go to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-base font-black text-primary-foreground">S</span>
          </div>
          <span className="text-xl font-black tracking-tight">Servexa</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create your Servexa workspace</CardTitle>
            <CardDescription>Invite-only during private beta. Enter your invitation code below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Invitation code</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="e.g. FIRETECH-2026" autoComplete="off" />
                {codeStatus?.valid && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Valid invitation{codeStatus.note ? ` — ${codeStatus.note}` : ""}
                  </p>
                )}
                {codeStatus?.valid === false && (
                  <p className="text-xs text-destructive">That code isn't valid or has been used.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Your name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgName">Company name</Label>
                  <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose a password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" />
              </div>
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm cursor-pointer">
                <Checkbox checked={seedTemplates} onCheckedChange={(v) => setSeedTemplates(!!v)} className="mt-0.5" />
                <span>
                  <span className="font-medium flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Start with example fire protection templates</span>
                  <span className="text-xs text-muted-foreground block mt-1">Clones the structure of our canonical fire, extinguisher, hydrant and sprinkler templates (no example data or branding). You can edit or delete any of them later.</span>
                </span>
              </label>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating your workspace…" : "Create workspace"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By continuing you agree to our{" "}
                <Link to="/terms" className="underline">Terms</Link>,{" "}
                <Link to="/privacy" className="underline">Privacy</Link>,{" "}
                <Link to="/dpa" className="underline">DPA</Link> and{" "}
                <Link to="/aup" className="underline">AUP</Link>.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Already have an account? <Link to="/login" className="text-primary underline">Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
