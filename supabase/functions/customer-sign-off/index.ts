import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("customer_sign_off_tokens")
      .select("*, jobs(id, name, reference_number, customer, address, status)")
      .eq("token", token)
      .single();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This sign-off link has expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenRow.signed_at) {
      return new Response(JSON.stringify({ error: "This job has already been signed off", signed_at: tokenRow.signed_at }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET = return job info
    if (req.method === "GET") {
      return new Response(JSON.stringify({
        job: tokenRow.jobs,
        customer_name: tokenRow.customer_name,
        customer_email: tokenRow.customer_email,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST = submit signature
    if (req.method === "POST") {
      const formData = await req.formData();
      const file = formData.get("signature") as File;
      const signerName = formData.get("signer_name") as string || tokenRow.customer_name || "Customer";

      if (!file) {
        return new Response(JSON.stringify({ error: "Signature file required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const jobId = tokenRow.job_id;
      const filePath = `customer/${jobId}-${Date.now()}.png`;

      // Upload signature image
      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from("signatures")
        .upload(filePath, arrayBuffer, { contentType: "image/png" });

      if (uploadErr) {
        return new Response(JSON.stringify({ error: "Failed to upload signature" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert signature record
      const { error: sigErr } = await supabase.from("job_signatures").insert({
        job_id: jobId,
        signer_id: tokenRow.created_by, // attribute to the user who created the token
        signer_name: signerName,
        signer_role: "customer",
        file_path: filePath,
      });

      if (sigErr) {
        return new Response(JSON.stringify({ error: "Failed to save signature record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark token as signed
      await supabase
        .from("customer_sign_off_tokens")
        .update({ signed_at: new Date().toISOString() })
        .eq("id", tokenRow.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
