import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Handle Meta webhook verification (GET request)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
        console.log("Webhook verified successfully");
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // Handle incoming messages (POST)
    if (req.method === "POST") {
      const body = await req.json();

      const entries = body?.entry || [];
      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value = change.value;
          const messages = value?.messages || [];

          for (const message of messages) {
            const from = message.from; // WhatsApp number
            const timestamp = message.timestamp;

            // Find engineer by WhatsApp number
            const { data: profile } = await supabase
              .from("profiles")
              .select("user_id")
              .eq("whatsapp_number", from)
              .maybeSingle();

            if (!profile) {
              console.log(`Unknown WhatsApp number: ${from}`);
              continue;
            }

            const engineerId = profile.user_id;

            // Determine active job context — check if engineer texted a reference number
            if (message.type === "text") {
              const text = message.text?.body?.trim() || "";

              // Check if it's a job reference number
              const { data: job } = await supabase
                .from("jobs")
                .select("id")
                .eq("reference_number", text)
                .maybeSingle();

              if (job) {
                // Store active job context (using a simple approach with the message itself)
                // The engineer is selecting a job context
                console.log(`Engineer ${engineerId} selected job ${job.id} via ref: ${text}`);
                // Store as a "context" note
                await supabase.from("submissions").insert({
                  job_id: job.id,
                  engineer_id: engineerId,
                  type: "note",
                  content: `Job context set: ${text}`,
                  whatsapp_message_id: message.id,
                });
                continue;
              }

              // Otherwise it's a text note — find latest assigned job
              const jobId = await getActiveJob(supabase, engineerId);
              if (!jobId) {
                console.log(`No active job for engineer ${engineerId}`);
                continue;
              }

              await supabase.from("submissions").insert({
                job_id: jobId,
                engineer_id: engineerId,
                type: "note",
                content: text,
                whatsapp_message_id: message.id,
              });
            }

            if (message.type === "image" || message.type === "document") {
              const jobId = await getActiveJob(supabase, engineerId);
              if (!jobId) continue;

              const mediaId = message.image?.id || message.document?.id;
              const mimeType = message.image?.mime_type || message.document?.mime_type;
              const fileName = message.document?.filename || `${message.type}_${Date.now()}`;

              // Download media from WhatsApp (requires WHATSAPP_TOKEN)
              const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
              if (!WHATSAPP_TOKEN || !mediaId) continue;

              // Get media URL
              const mediaUrlRes = await fetch(
                `https://graph.facebook.com/v21.0/${mediaId}`,
                { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
              );
              const mediaUrlData = await mediaUrlRes.json();
              const mediaUrl = mediaUrlData.url;
              if (!mediaUrl) continue;

              // Download the actual file
              const fileRes = await fetch(mediaUrl, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
              });
              const fileBlob = await fileRes.blob();

              // Upload to storage
              const storagePath = `${jobId}/${engineerId}/${Date.now()}_${fileName}`;
              const { error: uploadError } = await supabase.storage
                .from("submissions")
                .upload(storagePath, fileBlob, { contentType: mimeType });

              if (uploadError) {
                console.error("Upload error:", uploadError);
                continue;
              }

              const { data: publicUrl } = supabase.storage
                .from("submissions")
                .getPublicUrl(storagePath);

              await supabase.from("submissions").insert({
                job_id: jobId,
                engineer_id: engineerId,
                type: message.type === "image" ? "photo" : "document",
                file_url: publicUrl.publicUrl,
                file_name: fileName,
                whatsapp_message_id: message.id,
              });
            }

            if (message.type === "location") {
              const jobId = await getActiveJob(supabase, engineerId);
              if (!jobId) continue;

              await supabase.from("submissions").insert({
                job_id: jobId,
                engineer_id: engineerId,
                type: "location",
                latitude: message.location.latitude,
                longitude: message.location.longitude,
                content: message.location.name || message.location.address || null,
                whatsapp_message_id: message.id,
              });
            }
          }
        }
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getActiveJob(supabase: any, engineerId: string): Promise<string | null> {
  // Get the most recently assigned active job for this engineer
  const { data } = await supabase
    .from("job_assignments")
    .select("job_id, jobs(status)")
    .eq("engineer_id", engineerId)
    .order("assigned_at", { ascending: false })
    .limit(10);

  if (!data) return null;

  // Find the first active job
  for (const assignment of data) {
    if ((assignment as any).jobs?.status === "active") {
      return assignment.job_id;
    }
  }

  // Fallback to most recent assignment
  return data[0]?.job_id || null;
}
