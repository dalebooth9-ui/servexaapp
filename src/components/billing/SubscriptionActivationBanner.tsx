import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { penceToPoundsDisplay, PLAN_BANDS } from "@/lib/planBands";

type BillingPromptState = {
  name: string | null;
  plan_status: string | null;
  promo_price_pence: number | null;
  promo_price_note: string | null;
  user_band: string | null;
};

export default function SubscriptionActivationBanner() {
  const { orgId, userRole } = useAuth();
  const [state, setState] = useState<BillingPromptState | null>(null);

  useEffect(() => {
    if (!orgId || userRole !== "admin") return;
    let mounted = true;
    supabase
      .from("organisations")
      .select("name, plan_status, promo_price_pence, promo_price_note, user_band")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) setState((data as BillingPromptState | null) ?? null);
      });
    return () => {
      mounted = false;
    };
  }, [orgId, userRole]);

  const priceLabel = useMemo(() => {
    if (!state) return "";
    if (state.promo_price_pence && state.promo_price_pence > 0) {
      return `${penceToPoundsDisplay(state.promo_price_pence)}/mo founder rate`;
    }
    const band = PLAN_BANDS.find((b) => b.code === state.user_band) ?? PLAN_BANDS[0];
    return band.monthlyPriceGbp ? `£${band.monthlyPriceGbp}/mo` : "subscription";
  }, [state]);

  if (userRole !== "admin" || !state || state.plan_status === "active") return null;

  return (
    <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">Subscribe to activate your workspace</p>
            <p className="text-sm text-muted-foreground">
              Start checkout now to activate {state.name ?? "this workspace"}. {state.promo_price_note ? `${state.promo_price_note} · ` : ""}{priceLabel}.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/billing">
            <CreditCard className="mr-2 h-4 w-4" /> Subscribe
          </Link>
        </Button>
      </div>
    </div>
  );
}