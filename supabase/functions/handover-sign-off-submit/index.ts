import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, signature_data } = await req.json();
    if (!token || !signature_data) {
      return new Response(JSON.stringify({ error: "token and signature_data required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: record, error: tokErr } = await supabase
      .from("installation_handover_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokErr || !record) return new Response(JSON.stringify({ error: "Invalid token" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
    if (new Date(record.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Link expired" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 410 });
    if (record.status === "signed") return new Response(JSON.stringify({ ok: true, already_signed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await supabase
      .from("installation_handover_tokens")
      .update({ status: "signed", signed_at: new Date().toISOString(), signature_data })
      .eq("id", record.id);

    // Notify admins via notification
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    for (const admin of (admins || [])) {
      await supabase.from("notifications").insert({
        user_id: admin.user_id,
        title: "Handover Pack Signed",
        message: `${record.client_name || "The client"} has signed the handover pack.`,
        job_id: record.job_id,
      });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
