import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth guard — admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: claimsData.claims.sub, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Find engineer documents expiring within 30 days (or already expired)
    const { data: expiring } = await supabase
      .from("engineer_documents")
      .select("id, title, document_type, expiry_date, engineer_id")
      .not("expiry_date", "is", null)
      .lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0]);

    // Get all admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins || []).map((a: any) => a.user_id);

    // Get engineer profiles for names
    const engineerIds = [...new Set((expiring || []).map((d: any) => d.engineer_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", engineerIds);

    const nameMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });

    // Deduplicate — only notify once per document per day by checking recent notifications
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: recentNotifs } = await supabase
      .from("notifications")
      .select("message")
      .gte("created_at", yesterday.toISOString())
      .like("title", "%Engineer Cert%");

    const recentMessages = new Set((recentNotifs || []).map((n: any) => n.message));

    let notified = 0;

    for (const doc of expiring || []) {
      const expiryDate = new Date(doc.expiry_date);
      const isExpired = expiryDate < today;
      const engineerName = nameMap[doc.engineer_id] || "Unknown engineer";
      const docTypeLabel = doc.document_type.replace(/_/g, " ");

      const message = `${engineerName}'s ${docTypeLabel} "${doc.title}" ${
        isExpired ? `expired on ${doc.expiry_date}` : `expires on ${doc.expiry_date}`
      }`;

      // Skip if already notified recently
      if (recentMessages.has(message)) continue;

      for (const adminId of adminIds) {
        await supabase.from("notifications").insert({
          user_id: adminId,
          title: isExpired ? "Engineer Cert Expired" : "Engineer Cert Expiring Soon",
          message,
          job_id: null,
        });
        notified++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: expiring?.length || 0, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Engineer doc expiry check error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
