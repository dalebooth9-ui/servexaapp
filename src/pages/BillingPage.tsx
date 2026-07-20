import BillingCard from "@/components/billing/BillingCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_BANDS, penceToPoundsDisplay } from "@/lib/planBands";
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type OrgBillingSummary = {
  name: string | null;
  plan_status: string | null;
  promo_price_pence: number | null;
  promo_price_note: string | null;
  user_band: string | null;
};

export default function BillingPage() {
  const { orgId } = useAuth();
  const [summary, setSummary] = useState<OrgBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let mounted = true;
    supabase
      .from("organisations")
      .select("name, plan_status, promo_price_pence, promo_price_note, user_band")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) {
          setSummary((data as OrgBillingSummary | null) ?? null);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [orgId]);

  const band = useMemo(
    () => PLAN_BANDS.find((b) => b.code === summary?.user_band) ?? PLAN_BANDS[0],
    [summary?.user_band],
  );

  const price = summary?.promo_price_pence
    ? `${penceToPoundsDisplay(summary.promo_price_pence)}/mo`
    : band.monthlyPriceGbp
      ? `£${band.monthlyPriceGbp}/mo`
      : "Contact us";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CreditCard className="h-6 w-6 text-primary" /> Billing
          </h1>
          <p className="text-sm text-muted-foreground">Activate and manage your Servexa workspace subscription.</p>
        </div>
        {summary?.plan_status && <Badge variant={summary.plan_status === "active" ? "default" : "outline"}>{summary.plan_status}</Badge>}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subscription summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Workspace</span>
                <span className="font-medium">{summary?.name ?? "—"}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{band.label}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Price</span>
                <span className="font-semibold text-primary">{price}</span>
              </div>
              {summary?.promo_price_note && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                  <span className="font-medium text-primary">Founder rate applied</span>
                  <span className="mt-1 block text-muted-foreground">{summary.promo_price_note}</span>
                </div>
              )}
              <Separator />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Users className="h-4 w-4" /> Customer portal users are free.</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Checkout is handled securely by Stripe.</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Your workspace unlocks automatically after payment.</div>
              </div>
            </CardContent>
          </Card>

          <BillingCard />
        </div>
      )}
    </div>
  );
}