import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Please enter a valid email address").max(255),
  company: z.string().trim().max(100).optional(),
  interest: z.string().min(1, "Please select an interest"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message must be under 2000 characters"),
});

type FormData = z.infer<typeof schema>;
type Errors = Partial<Record<keyof FormData, string>>;

export default function ContactSalesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState<Partial<FormData>>({ interest: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const handleSubmit = async () => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Errors = {};
      result.error.errors.forEach((e) => {
        const key = e.path[0] as keyof FormData;
        if (!fieldErrors[key]) fieldErrors[key] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("contact-sales", { body: result.data });
      if (error) throw error;
      setSent(true);
    } catch {
      setErrors({ message: "Something went wrong. Please try again or email hello@servexaapp.com directly." });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setForm({ interest: "" });
      setErrors({});
      setSent(false);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="py-8 text-center space-y-3">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-bold">Message sent!</h3>
            <p className="text-sm text-muted-foreground">We'll be in touch within 1 business day.</p>
            <Button className="mt-2 w-full" onClick={() => handleClose(false)}>Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <DialogTitle>Talk to us about a custom plan</DialogTitle>
              </div>
              <DialogDescription>
                Multiple branches, white-labelling, volume pricing — we'll put together something that fits.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cs-name">Your name <span className="text-destructive">*</span></Label>
                  <Input id="cs-name" placeholder="Jane Smith" value={form.name || ""} onChange={(e) => set("name", e.target.value)} className={errors.name ? "border-destructive" : ""} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-email">Work email <span className="text-destructive">*</span></Label>
                  <Input id="cs-email" type="email" placeholder="jane@company.co.uk" value={form.email || ""} onChange={(e) => set("email", e.target.value)} className={errors.email ? "border-destructive" : ""} />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-company">Company name</Label>
                <Input id="cs-company" placeholder="Acme Fire & Security Ltd" value={form.company || ""} onChange={(e) => set("company", e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>I'm interested in… <span className="text-destructive">*</span></Label>
                <Select value={form.interest || ""} onValueChange={(v) => set("interest", v)}>
                  <SelectTrigger className={errors.interest ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Multiple branches">Multiple branches</SelectItem>
                    <SelectItem value="White-label / own branding">White-label / own branding</SelectItem>
                    <SelectItem value="High-volume engineer teams">High-volume engineer teams</SelectItem>
                    <SelectItem value="Volume pricing / discount">Volume pricing / discount</SelectItem>
                    <SelectItem value="Reseller / partner programme">Reseller / partner programme</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.interest && <p className="text-xs text-destructive">{errors.interest}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-message">Tell us a bit more <span className="text-destructive">*</span></Label>
                <Textarea id="cs-message" placeholder="e.g. We have 4 branches across the UK and need separate logins but consolidated reporting…" rows={4} value={form.message || ""} onChange={(e) => set("message", e.target.value)} className={errors.message ? "border-destructive" : ""} />
                <div className="flex items-center justify-between">
                  {errors.message ? <p className="text-xs text-destructive">{errors.message}</p> : <span />}
                  <span className="text-xs text-muted-foreground ml-auto">{(form.message || "").length}/2000</span>
                </div>
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Send enquiry"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Or email us directly at{" "}
                <a href="mailto:hello@servexaapp.com" className="text-primary hover:underline">hello@servexaapp.com</a>
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
