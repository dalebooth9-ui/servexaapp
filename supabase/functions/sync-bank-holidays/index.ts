import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Validate cron secret to prevent unauthorized invocations
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Fetch from the official UK Government bank holidays API
    const resp = await fetch("https://www.gov.uk/bank-holidays.json", {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      throw new Error(`GOV.UK API returned ${resp.status}`);
    }

    const data = await resp.json();
    const events: { title: string; date: string }[] =
      data["england-and-wales"]?.events ?? [];

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No events returned from GOV.UK API" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert all holidays — ON CONFLICT (date) DO UPDATE name
    const rows = events.map((e) => ({
      date: e.date,
      name: e.title,
      region: "england-wales",
    }));

    const { error, count } = await supabase
      .from("bank_holidays")
      .upsert(rows, { onConflict: "date", count: "exact" });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, upserted: count, total: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("sync-bank-holidays error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
