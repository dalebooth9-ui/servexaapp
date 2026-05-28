import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireEnv, missingEnvResponse } from "../_shared/requireEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Twilio WhatsApp media limits: up to 10 media items per message; each fetched by Twilio at send time.
const MAX_MEDIA = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Check admin or engineer role
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    const { data: isEngineer } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "engineer",
    });

    if (!isAdmin && !isEngineer) {
      return new Response(JSON.stringify({ error: "Forbidden: admin or engineer only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { engineerId, message, jobId, mediaUrls } = await req.json();

    if (!engineerId || (!message?.trim() && (!Array.isArray(mediaUrls) || mediaUrls.length === 0))) {
      return new Response(JSON.stringify({ error: "engineerId and message or mediaUrls are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate media URLs (must be https, max 10)
    let validMedia: string[] = [];
    if (Array.isArray(mediaUrls)) {
      validMedia = mediaUrls
        .filter((u): u is string => typeof u === "string" && /^https:\/\//i.test(u))
        .slice(0, MAX_MEDIA);
    }

    // Get engineer's WhatsApp number
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("whatsapp_number, full_name")
      .eq("user_id", engineerId)
      .maybeSingle();

    if (!profile?.whatsapp_number) {
      return new Response(
        JSON.stringify({ error: "Engineer does not have a WhatsApp number configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Twilio — fail fast with a clear error if any Twilio key is missing.
    const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_WHATSAPP_NUMBER: rawFrom } =
      requireEnv(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_NUMBER"] as const);
    const fromNumber = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${rawFrom}`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const twilioParams = new URLSearchParams();
    twilioParams.set("From", fromNumber);
    twilioParams.set("To", `whatsapp:${profile.whatsapp_number}`);
    if (message?.trim()) twilioParams.set("Body", message.trim());
    // URLSearchParams supports repeated keys — Twilio reads up to 10 MediaUrl values.
    for (const u of validMedia) twilioParams.append("MediaUrl", u);

    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: twilioParams.toString(),
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error("Twilio error:", twilioData);
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: twilioData.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messageSid: string = twilioData.sid;

    // Poll Twilio briefly to catch immediate delivery failures (e.g. 63016 — outside 24h window).
    // WhatsApp typically reports failure within 1–3 seconds.
    const statusUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`;
    const authBasic = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
    let finalStatus: string = twilioData.status || "queued";
    let errorCode: number | null = twilioData.error_code ?? null;
    let errorMessage: string | null = twilioData.error_message ?? null;

    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 750));
      try {
        const r = await fetch(statusUrl, { headers: { Authorization: authBasic } });
        if (!r.ok) break;
        const s = await r.json();
        finalStatus = s.status;
        errorCode = s.error_code ?? null;
        errorMessage = s.error_message ?? null;
        if (["delivered", "read", "sent", "failed", "undelivered"].includes(finalStatus)) break;
      } catch (_) {
        break;
      }
    }

    const failed = finalStatus === "failed" || finalStatus === "undelivered" || errorCode != null;

    if (failed) {
      let friendly = errorMessage || `WhatsApp delivery ${finalStatus}`;
      if (errorCode === 63016) {
        friendly =
          "WhatsApp won't deliver this message because it's been more than 24 hours since the engineer last messaged you. Ask the engineer to send any WhatsApp message to reopen the conversation window, then try again.";
      } else if (errorCode === 63015) {
        friendly = "WhatsApp rejected the message (engineer hasn't opted in to receive messages).";
      } else if (errorCode === 63003) {
        friendly = "WhatsApp number isn't reachable — check the engineer's WhatsApp number.";
      }
      return new Response(
        JSON.stringify({ error: friendly, status: finalStatus, errorCode, messageSid }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the outbound message as a submission if jobId provided
    if (jobId) {
      const summary = `[Reply from office] ${message?.trim() || ""}${validMedia.length ? `\n(${validMedia.length} attachment${validMedia.length === 1 ? "" : "s"})` : ""}`.trim();
      await adminSupabase.from("submissions").insert({
        job_id: jobId,
        engineer_id: engineerId,
        type: "note",
        content: summary,
        whatsapp_message_id: messageSid,
      });
    }

    return new Response(
      JSON.stringify({ success: true, messageSid, status: finalStatus, mediaSent: validMedia.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const cfg = missingEnvResponse(error, corsHeaders);
    if (cfg) return cfg;
    console.error("Send WhatsApp error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
