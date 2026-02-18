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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Find records expiring within 30 days
    const { data: expiring } = await supabase
      .from("compliance_records")
      .select("id, title, record_type, expiry_date, status, asset_id, site_id")
      .lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0])
      .in("status", ["valid", "expiring_soon"]);

    let updated = 0;
    let notified = 0;

    // Get all admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins || []).map((a) => a.user_id);

    for (const record of expiring || []) {
      const expiryDate = new Date(record.expiry_date);
      const isExpired = expiryDate < today;
      const newStatus = isExpired ? "expired" : "expiring_soon";

      if (record.status !== newStatus) {
        await supabase.from("compliance_records")
          .update({ status: newStatus })
          .eq("id", record.id);
        updated++;

        // Notify admins
        for (const adminId of adminIds) {
          await supabase.from("notifications").insert({
            user_id: adminId,
            title: isExpired ? "Compliance Expired" : "Compliance Expiring Soon",
            message: `${record.title} (${record.record_type.replace("_", " ")}) ${isExpired ? "has expired" : "expires on " + record.expiry_date}`,
            job_id: null,
          });
          notified++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated, notified, checked: expiring?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Compliance check error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
