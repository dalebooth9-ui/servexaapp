// Creates a hosted Stripe Checkout session for an org's subscription.
// Requires secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID_DEFAULT, APP_PUBLIC_URL.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { STRIPE_SECRET_KEY, STRIPE_PRICE_ID_DEFAULT, APP_PUBLIC_URL } = requireEnv([
      "STRIPE_SECRET_KEY", "STRIPE_PRICE_ID_DEFAULT", "APP_PUBLIC_URL",
    ] as const);
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const uid = claims.claims.sub as string;

    // Resolve org and admin role.
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await svc.from("profiles").select("org_id").eq("user_id", uid).maybeSingle();
    const orgId = (profile as any)?.org_id as string | undefined;
    if (!orgId) return new Response(JSON.stringify({ error: "No organisation" }), { status: 400, headers: corsHeaders });
    const { data: roleRow } = await svc
      .from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Admins only" }), { status: 403, headers: corsHeaders });

    const { data: org } = await svc.from("organisations").select("name").eq("id", orgId).single();
    const { data: existing } = await svc.from("organisation_billing").select("stripe_customer_id").eq("org_id", orgId).maybeSingle();
    const { data: userRow } = await svc.auth.admin.getUserById(uid);
    const email = userRow.user?.email;

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });
    let customerId = (existing as any)?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, name: (org as any)?.name, metadata: { org_id: orgId } });
      customerId = customer.id;
      await svc.from("organisation_billing").upsert({ org_id: orgId, stripe_customer_id: customerId }, { onConflict: "org_id" });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID_DEFAULT, quantity: 1 }],
      success_url: `${APP_PUBLIC_URL}/settings?billing=success`,
      cancel_url: `${APP_PUBLIC_URL}/settings?billing=cancelled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { org_id: orgId } },
      metadata: { org_id: orgId },
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const missing = missingEnvResponse(err, corsHeaders);
    if (missing) return missing;
    console.error("stripe-create-checkout-session error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
