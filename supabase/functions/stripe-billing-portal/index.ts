// Returns a hosted Stripe Billing Portal URL for the caller's org.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { STRIPE_SECRET_KEY, APP_PUBLIC_URL } = requireEnv(["STRIPE_SECRET_KEY", "APP_PUBLIC_URL"] as const);
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const uid = claims.claims.sub as string;

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await svc.from("profiles").select("org_id").eq("user_id", uid).maybeSingle();
    const orgId = (profile as any)?.org_id as string | undefined;
    if (!orgId) return new Response("No org", { status: 400, headers: corsHeaders });
    const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response("Admins only", { status: 403, headers: corsHeaders });

    const { data: billing } = await svc.from("organisation_billing").select("stripe_customer_id").eq("org_id", orgId).maybeSingle();
    const customerId = (billing as any)?.stripe_customer_id as string | undefined;
    if (!customerId) return new Response(JSON.stringify({ error: "No Stripe customer for this org yet — start a subscription first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${APP_PUBLIC_URL}/settings` });
    return new Response(JSON.stringify({ url: portal.url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const missing = missingEnvResponse(err, corsHeaders);
    if (missing) return missing;
    console.error("stripe-billing-portal error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
