import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Token required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("quote_approval_tokens")
        .select("*, invoices:quote_id(id, invoice_number, customer_name, total, notes, status)")
        .eq("token", token)
        .single();

      if (tokenErr || !tokenRow) {
        return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "This approval link has expired" }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRow.status !== "pending") {
        return new Response(JSON.stringify({ error: "Already responded", status: tokenRow.status }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        quote: tokenRow.invoices,
        customer_name: tokenRow.customer_name,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { token, decision, notes } = await req.json();
      if (!token || !decision || !["accepted", "declined"].includes(decision)) {
        return new Response(JSON.stringify({ error: "Token and valid decision required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("quote_approval_tokens")
        .select("*")
        .eq("token", token)
        .single();

      if (tokenErr || !tokenRow) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRow.status !== "pending") {
        return new Response(JSON.stringify({ error: "Already responded" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Link expired" }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update token
      await supabase.from("quote_approval_tokens").update({
        status: decision,
        responded_at: new Date().toISOString(),
        response_notes: notes || null,
      }).eq("id", tokenRow.id);

      // Update the quote status
      await supabase.from("invoices").update({
        status: decision,
      }).eq("id", tokenRow.quote_id);

      return new Response(JSON.stringify({ success: true, status: decision }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("quote-approval error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
