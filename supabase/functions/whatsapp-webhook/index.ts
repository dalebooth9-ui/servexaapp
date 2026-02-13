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
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // Parse Twilio's form-encoded body
    const body = await req.text();
    const params = new URLSearchParams(body);

    // Validate Twilio signature
    const signature = req.headers.get("x-twilio-signature");
    if (!signature) {
      console.error("Missing Twilio signature");
      return new Response("<Response></Response>", {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    const isValid = await validateTwilioSignature(
      req.url,
      params,
      signature,
      TWILIO_AUTH_TOKEN
    );
    if (!isValid) {
      console.error("Invalid Twilio signature");
      return new Response("<Response></Response>", {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // Extract message data from Twilio's format
    const from = params.get("From")?.replace("whatsapp:", "") || "";
    const messageBody = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const messageSid = params.get("MessageSid") || "";
    const latitude = params.get("Latitude");
    const longitude = params.get("Longitude");

    if (!from) {
      return new Response("<Response></Response>", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // Find engineer by WhatsApp number
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("whatsapp_number", from)
      .maybeSingle();

    if (!profile) {
      console.log(`Unknown WhatsApp number: ${from}`);
      return twimlResponse();
    }

    const engineerId = profile.user_id;

    // Handle location messages
    if (latitude && longitude) {
      const jobId = await getActiveJob(supabase, engineerId);
      if (jobId) {
        await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: engineerId,
          type: "location",
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          content: messageBody || null,
          whatsapp_message_id: messageSid,
        });
      }
      return twimlResponse();
    }

    // Handle media messages (photos, documents)
    if (numMedia > 0) {
      const jobId = await getActiveJob(supabase, engineerId);
      if (!jobId) return twimlResponse();

      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const mediaType = params.get(`MediaContentType${i}`) || "";

        console.log(`Media ${i}: url=${mediaUrl}, type=${mediaType}`);
        if (!mediaUrl) continue;

        // Download media from Twilio
        const fileRes = await fetch(mediaUrl, {
          headers: {
            Authorization: `Basic ${btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${TWILIO_AUTH_TOKEN}`)}`,
          },
        });
        console.log(`Media download status: ${fileRes.status}`);
        if (!fileRes.ok) {
          console.error(`Media download failed: ${fileRes.status} ${await fileRes.text()}`);
          continue;
        }
        const fileBlob = await fileRes.blob();
        console.log(`Media blob size: ${fileBlob.size}`);

        const isImage = mediaType.startsWith("image/");
        const ext = mediaType.split("/")[1] || "bin";
        const fileName = `${isImage ? "photo" : "document"}_${Date.now()}_${i}.${ext}`;
        const storagePath = `${jobId}/${engineerId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("submissions")
          .upload(storagePath, fileBlob, { contentType: mediaType });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: engineerId,
          type: isImage ? "photo" : "document",
          file_url: storagePath,
          file_name: fileName,
          whatsapp_message_id: messageSid,
          content: messageBody || null,
        });
      }

      return twimlResponse();
    }

    // Handle text messages
    if (messageBody) {
      // Check if it's a job reference number
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("reference_number", messageBody.trim())
        .maybeSingle();

      if (job) {
        console.log(`Engineer ${engineerId} selected job ${job.id} via ref: ${messageBody.trim()}`);
        await supabase.from("submissions").insert({
          job_id: job.id,
          engineer_id: engineerId,
          type: "note",
          content: `Job context set: ${messageBody.trim()}`,
          whatsapp_message_id: messageSid,
        });
        return twimlResponse();
      }

      // Text note for active job
      const jobId = await getActiveJob(supabase, engineerId);
      if (jobId) {
        await supabase.from("submissions").insert({
          job_id: jobId,
          engineer_id: engineerId,
          type: "note",
          content: messageBody,
          whatsapp_message_id: messageSid,
        });
      } else {
        console.log(`No active job for engineer ${engineerId}`);
      }
    }

    return twimlResponse();
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("<Response></Response>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});

function twimlResponse(message?: string): Response {
  const body = message
    ? `<Response><Message>${message}</Message></Response>`
    : "<Response></Response>";
  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

async function validateTwilioSignature(
  url: string,
  params: URLSearchParams,
  signature: string,
  authToken: string
): Promise<boolean> {
  // Sort params and concatenate
  const sortedKeys = Array.from(params.keys()).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + params.get(key);
  }

  // HMAC-SHA1 + Base64
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(dataString));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return computed === signature;
}

async function getActiveJob(supabase: any, engineerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("job_assignments")
    .select("job_id, jobs(status)")
    .eq("engineer_id", engineerId)
    .order("assigned_at", { ascending: false })
    .limit(10);

  if (!data) return null;

  for (const assignment of data) {
    if ((assignment as any).jobs?.status === "active") {
      return assignment.job_id;
    }
  }

  return data[0]?.job_id || null;
}
