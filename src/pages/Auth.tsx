import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wrench, CheckCircle2, ClipboardList, MapPin } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Name must be under 100 characters"),
});

type Mode = "login" | "signup" | "forgot";

const FEATURES = [
  { icon: Briefcase, text: "Manage jobs, engineers & customers" },
  { icon: ClipboardList, text: "Digital job sheets & compliance docs" },
  { icon: MapPin, text: "Live engineer tracking & scheduling" },
  { icon: CheckCircle2, text: "Customer sign-off & instant reports" },
];

function Briefcase({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}

export default function Auth() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "forgot") {
      const emailParsed = z.string().trim().email("Please enter a valid email address").safeParse(email);
      if (!emailParsed.success) {
        toast({ title: "Validation error", description: emailParsed.error.errors[0]?.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(emailParsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({ title: "Error", description: "Could not send reset email. Please try again.", variant: "destructive" });
      } else {
        setForgotSent(true);
      }
      setLoading(false);
      return;
    }

    if (mode === "login") {
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) {
        toast({ title: "Validation error", description: parsed.error.errors[0]?.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (error) {
        toast({ title: "Login failed", description: "Invalid email or password.", variant: "destructive" });
      } else {
        navigate("/");
      }
    } else {
      const parsed = signupSchema.safeParse({ email, password, fullName });
      if (!parsed.success) {
        toast({ title: "Validation error", description: parsed.error.errors[0]?.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Sign up failed", description: "Unable to create account. Please try again.", variant: "destructive" });
      } else {
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link to verify your account.",
        });
      }
    }
    setLoading(false);
  };

  const titleMap: Record<Mode, string> = {
    login: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
  };

  const subtitleMap: Record<Mode, string> = {
    login: "Sign in to your FieldReport account",
    signup: "Get started with FieldReport",
    forgot: "We'll email you a reset link",
  };

  return (
    <div className="flex min-h-screen">
      {/* Branded left panel — hidden on small screens */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-sidebar p-12 text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="FieldReport logo" className="h-10 w-10 rounded-xl" />
          <span className="text-xl font-bold text-sidebar-primary-foreground">FieldReport</span>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight text-sidebar-primary-foreground">
              Field service management,<br />
              <span className="text-primary">built for engineers.</span>
            </h1>
            <p className="mt-4 text-sidebar-foreground/70 text-lg leading-relaxed">
              From job creation to customer sign-off — manage your entire field operation in one place.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              { text: "Manage jobs, engineers & customers" },
              { text: "Digital job sheets & compliance docs" },
              { text: "Live engineer tracking & scheduling" },
              { text: "Customer sign-off & instant reports" },
            ].map(({ text }) => (
              <li key={text} className="flex items-center gap-3 text-sidebar-foreground/80">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-sidebar-foreground/40">© {new Date().getFullYear()} FieldReport. All rights reserved.</p>
          <div className="flex gap-3 text-xs text-sidebar-foreground/30">
            <a href="/terms" target="_blank" className="hover:text-sidebar-foreground/60 transition-colors">Terms of Service</a>
            <a href="/privacy" target="_blank" className="hover:text-sidebar-foreground/60 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <img src="/favicon.png" alt="FieldReport logo" className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold">FieldReport</span>
          </div>

          <Card className="border-border/60 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold">{titleMap[mode]}</CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                {subtitleMap[mode]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mode === "forgot" && forgotSent ? (
                <div className="space-y-4 py-4 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                  <p className="font-medium">Check your inbox</p>
                  <p className="text-sm text-muted-foreground">We've sent a password reset link to <strong>{email}</strong>.</p>
                  <Button variant="outline" className="w-full" onClick={() => { setMode("login"); setForgotSent(false); }}>
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Smith" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
                  </div>
                  {mode !== "forgot" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {mode === "login" && (
                          <button
                            type="button"
                            onClick={() => setMode("forgot")}
                            className="text-xs text-primary hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Loading..." : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
                  </Button>
                </form>
              )}

              {!forgotSent && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  {mode === "login" ? (
                    <>Don't have an account?{" "}
                      <button onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">Sign Up</button>
                    </>
                  ) : mode === "signup" ? (
                    <>Already have an account?{" "}
                      <button onClick={() => setMode("login")} className="font-medium text-primary hover:underline">Sign In</button>
                    </>
                  ) : (
                    <button onClick={() => setMode("login")} className="font-medium text-primary hover:underline">Back to Sign In</button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
