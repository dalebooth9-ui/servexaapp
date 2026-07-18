import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, ExternalLink, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

type Billing = {
  plan_code: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  grace_period_ends_at: string | null;
  stripe_customer_id: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  trialing: { label: "Trialing", variant: "secondary" },
  past_due: { label: "Past due", variant: "destructive" },
  canceled: { label: "Cancelled", variant: "destructive" },
  unpaid: { label: "Unpaid", variant: "destructive" },
  incomplete: { label: "Not started", variant: "outline" },
};

export default function BillingCard() {
  const { orgId, userRole } = useAuth();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase.from("organisation_billing").select("*").eq("org_id", orgId).maybeSingle();
      setBilling((data as any) ?? null);
      setLoading(false);
    })();
  }, [orgId]);

  if (userRole !== "admin") return null;

  const status = billing?.subscription_status ?? "incomplete";
  const info = STATUS_LABEL[status] ?? { label: status, variant: "outline" as const };
  const hasSub = !!billing?.stripe_customer_id && status !== "incomplete";

  const startCheckout = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", { body: {} });
      if (error) throw error;
      if ((data as any)?.url) window.location.href = (data as any).url;
      else toast.error("Could not start checkout — check your Stripe configuration.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const openPortal = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-billing-portal", { body: {} });
      if (error) throw error;
      if ((data as any)?.url) window.location.href = (data as any).url;
      else toast.error("Could not open billing portal.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Billing</CardTitle>
            <CardDescription>Subscription and invoice management</CardDescription>
          </div>
          <Badge variant={info.variant}>{info.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{billing?.plan_code ?? "—"}</span></div>
            {billing?.current_period_end && (
              <div className="flex justify-between"><span className="text-muted-foreground">Renews</span><span>{format(new Date(billing.current_period_end), "d MMM yyyy")}</span></div>
            )}
            {status === "past_due" && billing?.grace_period_ends_at && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-medium">Payment failed</div>
                  <div className="text-xs">Access will pause on {format(new Date(billing.grace_period_ends_at), "d MMM yyyy")} if not resolved.</div>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {hasSub ? (
                <Button onClick={openPortal} disabled={busy} variant="outline">
                  Manage billing <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button onClick={startCheckout} disabled={busy}>Start subscription</Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
