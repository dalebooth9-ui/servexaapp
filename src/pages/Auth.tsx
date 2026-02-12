import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { HardHat, Wrench } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Name must be under 100 characters"),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <HardHat className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">FieldReport</CardTitle>
          <CardDescription className="flex items-center justify-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            {isLogin ? "Sign in to your account" : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="font-medium text-primary hover:underline">
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
