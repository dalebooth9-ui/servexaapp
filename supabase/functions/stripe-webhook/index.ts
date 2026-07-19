// Stripe webhook: signature-verified, idempotent per event id.
// Handles: checkout.session.completed, invoice.payment_failed,
// invoice.payment_succeeded, customer.subscription.updated,
// customer.subscription.deleted.
//
// Drives the existing suspend/reactivate lifecycle.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const GRACE_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = requireEnv(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const);
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });
    const sig = req.headers.get("stripe-signature") ?? "";
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      console.error("Signature verification failed", (e as Error).message);
      return new Response("bad signature", { status: 400 });
    }

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Idempotency: reject events already processed.
    const { data: dup } = await svc
      .from("organisation_billing")
      .select("org_id")
      .eq("last_webhook_event_id", event.id)
      .maybeSingle();
    if (dup) return new Response("duplicate", { status: 200 });

    const findOrgId = async (customerId: string | null | undefined): Promise<string | null> => {
      if (!customerId) return null;
      const { data } = await svc.from("organisation_billing").select("org_id").eq("stripe_customer_id", customerId).maybeSingle();
      return (data as any)?.org_id ?? null;
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = (s.metadata?.org_id as string | undefined) ?? await findOrgId(s.customer as string);
        if (!orgId) break;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        const priceId = (s.metadata?.price_id as string | undefined) ?? null;
        await svc.from("organisation_billing").upsert({
          org_id: orgId,
          stripe_customer_id: s.customer as string,
          stripe_subscription_id: subId,
          stripe_price_id: priceId,
          subscription_status: "active",
          grace_period_ends_at: null,
          last_webhook_event_id: event.id,
        }, { onConflict: "org_id" });
        await svc.from("organisations").update({ plan_status: "active", grace_period_ends_at: null }).eq("id", orgId);
        await svc.rpc("reactivate_organisation", { _org_id: orgId, _source: "billing", _reason: "subscription_started" });
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const orgId = await findOrgId(inv.customer as string);
        if (!orgId) break;
        await svc.from("organisation_billing").update({
          subscription_status: "active",
          current_period_end: inv.lines.data[0]?.period?.end ? new Date(inv.lines.data[0].period.end * 1000).toISOString() : null,
          grace_period_ends_at: null,
          last_webhook_event_id: event.id,
        }).eq("org_id", orgId);
        await svc.from("organisations").update({ plan_status: "active", grace_period_ends_at: null }).eq("id", orgId);
        await svc.rpc("reactivate_organisation", { _org_id: orgId, _source: "billing", _reason: "payment_succeeded" }).then(() => {}, () => {});
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const orgId = await findOrgId(inv.customer as string);
        if (!orgId) break;
        const { data: current } = await svc.from("organisation_billing").select("grace_period_ends_at").eq("org_id", orgId).maybeSingle();
        const grace = (current as any)?.grace_period_ends_at
          ?? new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await svc.from("organisation_billing").update({
          subscription_status: "past_due",
          grace_period_ends_at: grace,
          last_webhook_event_id: event.id,
        }).eq("org_id", orgId);
        await svc.from("organisations").update({ plan_status: "past_due", grace_period_ends_at: grace }).eq("id", orgId);
        // Do NOT suspend yet — cron job enforce-billing-grace handles it after grace expires.
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await findOrgId(sub.customer as string);
        if (!orgId) break;
        await svc.from("organisation_billing").update({
          subscription_status: sub.status,
          stripe_subscription_id: sub.id,
          stripe_price_id: sub.items.data[0]?.price?.id ?? null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          last_webhook_event_id: event.id,
        }).eq("org_id", orgId);
        await svc.from("organisations").update({ plan_status: sub.status }).eq("id", orgId);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await findOrgId(sub.customer as string);
        if (!orgId) break;
        await svc.from("organisation_billing").update({
          subscription_status: "canceled",
          grace_period_ends_at: null,
          last_webhook_event_id: event.id,
        }).eq("org_id", orgId);
        await svc.from("organisations").update({ plan_status: "canceled", grace_period_ends_at: null }).eq("id", orgId);
        await svc.rpc("suspend_organisation", {
          _org_id: orgId,
          _reason: "subscription_cancelled",
          _message: "Your Stripe subscription has been cancelled. Restart it to reactivate access.",
          _source: "billing",
        }).then(() => {}, (e) => console.error("suspend failed", e));
        break;
      }
      default:
        // Ignore other events for now — record the id so we don't re-process.
        break;
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (err) {
    const missing = missingEnvResponse(err, corsHeaders);
    if (missing) return missing;
    console.error("stripe-webhook error", err);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
