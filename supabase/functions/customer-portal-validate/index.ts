import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ valid: false, error: "No token provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenData, error } = await supabase
      .from("customer_portal_tokens")
      .select("id, customer_id, customer_email, is_active, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !tokenData) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenData.is_active === false) {
      return new Response(JSON.stringify({ valid: false, reason: "deactivated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return new Response(JSON.stringify({ valid: false, reason: "expired" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Touch last_accessed (fire & forget)
    supabase.from("customer_portal_tokens")
      .update({ last_accessed: new Date().toISOString() })
      .eq("id", tokenData.id)
      .then(() => {});

    return new Response(JSON.stringify({ valid: true, customer_id: tokenData.customer_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ valid: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
