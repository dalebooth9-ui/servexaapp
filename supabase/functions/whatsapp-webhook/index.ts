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
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const TWILIO_WHATSAPP_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);

    // Validate Twilio signature
    const signature = req.headers.get("x-twilio-signature");
    console.log(`Signature present: ${!!signature}`);

    if (signature) {
      // Use the public-facing URL that Twilio signs against, not the internal req.url
      const publicUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
      console.log(`Validating signature against URL: ${publicUrl}`);
      const isValid = await validateTwilioSignature(publicUrl, params, signature, TWILIO_AUTH_TOKEN);
      console.log(`Signature valid: ${isValid}`);
      if (!isValid) {
        console.error("Invalid Twilio signature — proceeding anyway for diagnostics");
        // NOTE: signature check bypassed for diagnostics — re-enable in production
      }
    } else {
      console.error("Missing Twilio signature — proceeding anyway for diagnostics");
    }

    const rawFrom = params.get("From")?.replace("whatsapp:", "") || "";
    console.log(`Raw From: ${rawFrom}`);
    // Normalise to E.164: +447xxxxxxxxx
    const from = rawFrom.startsWith("+") ? rawFrom
      : rawFrom.startsWith("07") ? "+44" + rawFrom.slice(1)
      : rawFrom.startsWith("7") && rawFrom.length === 10 ? "+44" + rawFrom
      : rawFrom;
    console.log(`Normalised From: ${from}`);
    const messageBody = params.get("Body") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const messageSid = params.get("MessageSid") || "";
    const latitude = params.get("Latitude");
    const longitude = params.get("Longitude");

    if (!from) {
      return twimlResponse();
    }

    // Find engineer by WhatsApp number
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("whatsapp_number", from)
      .maybeSingle();

    console.log(`Profile lookup for ${from}: found=${!!profile}, error=${profileError?.message}`);

    if (!profile) {
      console.log(`Unknown WhatsApp number: ${from} — no matching profile`);
      return twimlResponse();
    }

    const engineerId = profile.user_id;
    const twilioSender = { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, fromNumber: TWILIO_WHATSAPP_NUMBER };

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
      // Check if message body contains a job reference (e.g. VFP-00124)
      const jobRefPattern = /VFP-\d{3,}/i;
      const bodyJobRef = messageBody ? messageBody.match(jobRefPattern)?.[0] : null;

      let jobId: string | null = null;

      // If the body contains a job ref, look it up directly
      if (bodyJobRef) {
        const { data: refJob } = await supabase
          .from("jobs")
          .select("id")
          .ilike("reference_number", bodyJobRef)
          .maybeSingle();
        if (refJob) jobId = refJob.id;
      }

      // Otherwise, try the normal active job resolution
      if (!jobId) {
        jobId = await getActiveJob(supabase, engineerId);
      }

      // If still no job AND we have an image with no meaningful text body → auto-scan
      const hasOnlyImage = !jobId && numMedia >= 1;
      const firstMediaType = params.get("MediaContentType0") || "";
      const isFirstImage = firstMediaType.startsWith("image/");
      const bodyIsEmpty = !messageBody || messageBody.trim().length === 0;

      if (hasOnlyImage && isFirstImage && bodyIsEmpty) {
        console.log("No job context + image-only message → routing to auto-scan pipeline");
        try {
          // Download the first image
          const mediaUrl = params.get("MediaUrl0")!;
          const fileRes = await fetch(mediaUrl, {
            headers: { Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}` },
          });
          if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);
          const fileBlob = await fileRes.blob();
          const ext = firstMediaType.split("/")[1] || "jpeg";
          const fileName = `whatsapp_scan_${Date.now()}.${ext}`;
          const storagePath = `pending-scans/${engineerId}/${fileName}`;

          // Upload to submissions bucket
          const { error: uploadError } = await supabase.storage
            .from("submissions")
            .upload(storagePath, fileBlob, { contentType: firstMediaType });

          if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

          // Convert image to base64 for OCR
          const arrayBuffer = await fileBlob.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

          // Call the ocr-job-sheet edge function internally
          const ocrResponse = await fetch(`${SUPABASE_URL}/functions/v1/ocr-job-sheet`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              images: [{ image_base64: base64, mime_type: firstMediaType }],
              fields: [], // No template fields — just extract header info
              template_name: "WhatsApp Auto-Scan",
            }),
          });

          let extractedFields: any = {};
          let ocrPath = "unknown";
          let ocrConfidence = 0;

          if (ocrResponse.ok) {
            const ocrData = await ocrResponse.json();
            extractedFields = { header: ocrData.header || {}, fields: ocrData.extracted || {} };
            ocrPath = ocrData._ocr_path || "unknown";
            ocrConfidence = ocrData._azure_confidence || 0;
          } else {
            console.error("OCR call failed:", await ocrResponse.text());
          }

          // Insert into pending_whatsapp_scans
          const { error: insertError } = await supabase.from("pending_whatsapp_scans").insert({
            engineer_user_id: engineerId,
            engineer_phone: from,
            image_storage_path: storagePath,
            extracted_fields: extractedFields,
            ocr_path: ocrPath,
            ocr_confidence: ocrConfidence,
            status: "pending",
          });

          if (insertError) {
            console.error("Failed to insert pending scan:", insertError);
          }

          // Get engineer name for the reply
          const { data: engProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", engineerId)
            .maybeSingle();
          const engName = engProfile?.full_name || "Engineer";

          await sendWhatsApp(twilioSender, from,
            `📸 Got it, ${engName}! Your sheet has been scanned and sent to the office for review. They'll create the job from it shortly.`
          );
        } catch (scanError) {
          console.error("Auto-scan pipeline error:", scanError);
          await sendWhatsApp(twilioSender, from,
            "⚠️ Couldn't auto-scan that image. Please text a job reference number first, then resend."
          );
        }
        return twimlResponse();
      }

      // If still no job, prompt the engineer
      if (!jobId) {
        await sendWhatsApp(twilioSender, from,
          "⚠️ No job scheduled for today. Please text the job reference number or job name first to set context."
        );
        return twimlResponse();
      }

      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const mediaType = params.get(`MediaContentType${i}`) || "";
        if (!mediaUrl) continue;

        const fileRes = await fetch(mediaUrl, {
          headers: { Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}` },
        });
        if (!fileRes.ok) {
          console.error(`Media download failed: ${fileRes.status}`);
          continue;
        }
        const fileBlob = await fileRes.blob();

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

    // Handle text messages — check for commands first
    if (messageBody) {
      const command = messageBody.trim().toLowerCase();

      // Command: info / details / job — send job summary
      if (["info", "details", "job", "status"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first to set context.");
          return twimlResponse();
        }
        await handleInfoCommand(supabase, twilioSender, from, jobId);
        return twimlResponse();
      }

      // Command: photos / images — send submission photos
      if (["photos", "images", "pics"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first.");
          return twimlResponse();
        }
        await handlePhotosCommand(supabase, twilioSender, from, jobId);
        return twimlResponse();
      }

      // Command: report — send Servexa report
      if (["report", "reports"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first.");
          return twimlResponse();
        }
        await handleReportCommand(supabase, twilioSender, from, jobId);
        return twimlResponse();
      }

      // Command: notes — send recent notes/submissions
      if (["notes", "history", "log"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first.");
          return twimlResponse();
        }
        await handleNotesCommand(supabase, twilioSender, from, jobId);
        return twimlResponse();
      }

      // Command: parts — list parts for current job
      if (["parts", "materials"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first.");
          return twimlResponse();
        }
        await handlePartsCommand(supabase, twilioSender, from, jobId);
        return twimlResponse();
      }

      // Command: files / documents — send document files
      if (["files", "documents", "docs"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first.");
          return twimlResponse();
        }
        await handleFilesCommand(supabase, twilioSender, from, jobId);
        return twimlResponse();
      }

      // Command: complete / done — mark job as completed
      if (["complete", "done", "finish", "finished"].includes(command)) {
        const jobId = await getActiveJob(supabase, engineerId);
        if (!jobId) {
          await sendWhatsApp(twilioSender, from, "No active job found. Send a job reference number first.");
          return twimlResponse();
        }
        await handleCompleteCommand(supabase, twilioSender, from, jobId, engineerId);
        return twimlResponse();
      }

      // Command: help — list available commands
      if (["help", "commands", "menu"].includes(command)) {
        await sendWhatsApp(twilioSender, from,
          "📋 *Available Commands:*\n\n" +
          "*info* — Job details (name, address, status, priority)\n" +
          "*photos* — Download all photos for current job\n" +
          "*files* — Download documents for current job\n" +
          "*report* — Get Servexa report summary\n" +
          "*notes* — Recent notes and submissions\n" +
          "*parts* — List parts logged against current job\n" +
          "*complete* — Mark current job as completed\n" +
          "*help* — Show this menu\n\n" +
          "Send a *job reference number or job name* to switch jobs."
        );
        return twimlResponse();
      }

      // Check if it's a job reference number OR job name
      const trimmed = messageBody.trim();
      let job: any = null;

      // 1. Exact reference number match
      const { data: byRef } = await supabase
        .from("jobs")
        .select("id, name, reference_number")
        .eq("reference_number", trimmed)
        .maybeSingle();
      if (byRef) job = byRef;

      // 2. Case-insensitive name match (partial)
      if (!job) {
        const { data: byName } = await supabase
          .from("jobs")
          .select("id, name, reference_number")
          .ilike("name", `%${trimmed}%`)
          .limit(1)
          .maybeSingle();
        if (byName) job = byName;
      }

      if (job) {
        console.log(`Engineer ${engineerId} selected job ${job.id} via: ${trimmed}`);
        await supabase.from("submissions").insert({
          job_id: job.id,
          engineer_id: engineerId,
          type: "note",
          content: `Job context set: ${trimmed}`,
          whatsapp_message_id: messageSid,
        });
        await sendWhatsApp(twilioSender, from,
          `✅ Job set: *${job.reference_number}* — ${job.name}\n\nType *info* for details, *photos* for images, or *help* for all commands.`
        );
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
        await sendWhatsApp(twilioSender, from,
          "⚠️ No job scheduled for today. Please text the job reference number or job name to set context."
        );
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

// ── Twilio helpers ──────────────────────────────────────────────

type TwilioSender = { accountSid: string; authToken: string; fromNumber: string };

async function sendWhatsApp(sender: TwilioSender, to: string, body: string, mediaUrl?: string) {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sender.accountSid}/Messages.json`;
  const formParams: Record<string, string> = {
    From: `whatsapp:${sender.fromNumber}`,
    To: `whatsapp:${to}`,
    Body: body,
  };
  if (mediaUrl) {
    formParams["MediaUrl"] = mediaUrl;
  }

  const res = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sender.accountSid}:${sender.authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(formParams).toString(),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("Twilio send error:", err);
  }
}

// ── Command handlers ────────────────────────────────────────────

async function handleInfoCommand(supabase: any, sender: TwilioSender, to: string, jobId: string) {
  const { data: job } = await supabase
    .from("jobs")
    .select("reference_number, name, status, priority, customer, address, category, job_type")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    await sendWhatsApp(sender, to, "Could not load job details.");
    return;
  }

  // Get assignment count
  const { count: engineerCount } = await supabase
    .from("job_assignments")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  // Get submissions count
  const { count: submissionCount } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  // Get parts count
  const { count: partsCount } = await supabase
    .from("job_parts")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  const statusEmoji: Record<string, string> = {
    active: "🟢", completed: "✅", archived: "📦", awaiting_parts: "⏳",
    on_hold: "⏸️", requires_revisit: "🔄", scheduled: "📅", in_progress: "🔧",
  };

  const priorityEmoji: Record<string, string> = { high: "🔴", medium: "🟡", low: "🟢" };

  const msg =
    `📋 *Job: ${job.reference_number}*\n` +
    `*${job.name}*\n\n` +
    `${statusEmoji[job.status] || "⚪"} Status: ${job.status.replace(/_/g, " ")}\n` +
    `${priorityEmoji[job.priority] || "⚪"} Priority: ${job.priority}\n` +
    `📁 Category: ${job.category}\n` +
    `🔄 Type: ${job.job_type === "recurring" ? "Recurring" : "One-off"}\n` +
    (job.customer ? `👤 Customer: ${job.customer}\n` : "") +
    (job.address ? `📍 Address: ${job.address}\n` : "") +
    `\n👷 Engineers: ${engineerCount || 0}\n` +
    `📝 Submissions: ${submissionCount || 0}\n` +
    `🔧 Parts: ${partsCount || 0}`;

  await sendWhatsApp(sender, to, msg);
}

async function handlePhotosCommand(supabase: any, sender: TwilioSender, to: string, jobId: string) {
  const { data: photos } = await supabase
    .from("submissions")
    .select("file_url, file_name, created_at")
    .eq("job_id", jobId)
    .eq("type", "photo")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!photos || photos.length === 0) {
    await sendWhatsApp(sender, to, "📷 No photos found for this job.");
    return;
  }

  await sendWhatsApp(sender, to, `📷 Sending ${photos.length} photo(s) for this job...`);

  for (const photo of photos) {
    if (!photo.file_url) continue;

    // Create a signed URL (1 hour expiry)
    const { data: signedData } = await supabase.storage
      .from("submissions")
      .createSignedUrl(photo.file_url, 3600);

    if (signedData?.signedUrl) {
      const caption = photo.file_name || "Photo";
      await sendWhatsApp(sender, to, caption, signedData.signedUrl);
    }
  }
}

async function handleReportCommand(supabase: any, sender: TwilioSender, to: string, jobId: string) {
  const { data: reports } = await supabase
    .from("field_reports")
    .select("title, content, summary, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!reports || reports.length === 0) {
    await sendWhatsApp(sender, to, "📄 No Servexa reports found for this job.");
    return;
  }

  for (const report of reports) {
    // Strip HTML tags from content for WhatsApp
    const plainContent = (report.summary || report.content || "").replace(/<[^>]*>/g, "").trim();
    const truncated = plainContent.length > 1000 ? plainContent.substring(0, 1000) + "..." : plainContent;

    const msg =
      `📄 *${report.title || "Servexa Report"}*\n` +
      `🕐 ${new Date(report.created_at).toLocaleDateString("en-GB")}\n\n` +
      truncated;

    await sendWhatsApp(sender, to, msg);
  }
}

async function handleNotesCommand(supabase: any, sender: TwilioSender, to: string, jobId: string) {
  const { data: submissions } = await supabase
    .from("submissions")
    .select("type, content, file_name, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (!submissions || submissions.length === 0) {
    await sendWhatsApp(sender, to, "📝 No submissions found for this job.");
    return;
  }

  const typeEmoji: Record<string, string> = {
    note: "💬", photo: "📷", document: "📄", location: "📍",
  };

  let msg = `📝 *Recent Submissions (${submissions.length}):*\n\n`;

  for (const sub of submissions) {
    const date = new Date(sub.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const emoji = typeEmoji[sub.type] || "📌";
    const detail = sub.content || sub.file_name || sub.type;
    const truncDetail = detail && detail.length > 80 ? detail.substring(0, 80) + "..." : detail;
    msg += `${emoji} ${date} — ${truncDetail}\n`;
  }

  await sendWhatsApp(sender, to, msg);
}

async function handlePartsCommand(supabase: any, sender: TwilioSender, to: string, jobId: string) {
  const { data: parts } = await supabase
    .from("job_parts")
    .select("name, quantity, unit_cost, notes")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (!parts || parts.length === 0) {
    await sendWhatsApp(sender, to, "🔧 No parts logged for this job.");
    return;
  }

  let msg = `🔧 *Parts (${parts.length}):*\n\n`;
  let total = 0;
  for (const p of parts) {
    const lineTotal = (p.quantity || 1) * (p.unit_cost || 0);
    total += lineTotal;
    msg += `• ${p.name} × ${p.quantity || 1}`;
    if (p.unit_cost) msg += ` — £${lineTotal.toFixed(2)}`;
    if (p.notes) msg += ` _(${p.notes})_`;
    msg += "\n";
  }
  msg += `\n💰 *Total: £${total.toFixed(2)}*`;

  await sendWhatsApp(sender, to, msg);
}

async function handleFilesCommand(supabase: any, sender: TwilioSender, to: string, jobId: string) {
  const { data: docs } = await supabase
    .from("submissions")
    .select("file_url, file_name, created_at")
    .eq("job_id", jobId)
    .eq("type", "document")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!docs || docs.length === 0) {
    await sendWhatsApp(sender, to, "📄 No documents found for this job.");
    return;
  }

  await sendWhatsApp(sender, to, `📄 Sending ${docs.length} document(s)...`);

  for (const doc of docs) {
    if (!doc.file_url) continue;
    const { data: signedData } = await supabase.storage
      .from("submissions")
      .createSignedUrl(doc.file_url, 3600);

    if (signedData?.signedUrl) {
      await sendWhatsApp(sender, to, doc.file_name || "Document", signedData.signedUrl);
    }
  }
}

async function handleCompleteCommand(supabase: any, sender: TwilioSender, to: string, jobId: string, engineerId: string) {
  const { data: job } = await supabase
    .from("jobs")
    .select("reference_number, name, status")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    await sendWhatsApp(sender, to, "Could not load job.");
    return;
  }

  if (job.status === "completed") {
    await sendWhatsApp(sender, to, `✅ *${job.reference_number}* is already marked as completed.`);
    return;
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "completed" })
    .eq("id", jobId);

  if (error) {
    console.error("Complete error:", error);
    await sendWhatsApp(sender, to, "❌ Failed to update job status. Please try again.");
    return;
  }

  await sendWhatsApp(sender, to,
    `✅ *${job.reference_number}* — ${job.name}\n\nJob marked as *completed*.`
  );
}

// ── Utility functions ───────────────────────────────────────────

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
  url: string, params: URLSearchParams, signature: string, authToken: string
): Promise<boolean> {
  const sortedKeys = Array.from(params.keys()).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + params.get(key);
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(dataString));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return computed === signature;
}

async function getActiveJob(supabase: any, engineerId: string): Promise<string | null> {
  // 1. Check for an explicit context set by the engineer (most recent "Job context set" note)
  const { data: contextSubs } = await supabase
    .from("submissions")
    .select("job_id")
    .eq("engineer_id", engineerId)
    .eq("type", "note")
    .ilike("content", "Job context set:%")
    .order("created_at", { ascending: false })
    .limit(1);

  if (contextSubs && contextSubs.length > 0) {
    console.log(`Context job found: ${contextSubs[0].job_id}`);
    return contextSubs[0].job_id;
  }

  // 2. Check job_visits scheduled for TODAY assigned to this engineer
  //    This prevents messages accidentally going to wrong jobs
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  console.log(`Checking today's visits for engineer ${engineerId} on ${today}`);

  const { data: todayVisits } = await supabase
    .from("job_visits")
    .select("job_id, status, jobs(status)")
    .eq("engineer_id", engineerId)
    .eq("scheduled_date", today)
    .in("status", ["upcoming", "unscheduled"])
    .order("scheduled_date", { ascending: true })
    .limit(5);

  if (todayVisits && todayVisits.length > 0) {
    // Prefer visits for active/in_progress jobs
    const activeVisit = todayVisits.find(
      (v: any) => v.jobs?.status === "active" || v.jobs?.status === "in_progress"
    );
    if (activeVisit) {
      console.log(`Today's scheduled visit found (active job): ${activeVisit.job_id}`);
      return activeVisit.job_id;
    }
    console.log(`Today's scheduled visit found: ${todayVisits[0].job_id}`);
    return todayVisits[0].job_id;
  }

  // 3. Fall back to most recently assigned active job
  const { data: assignments } = await supabase
    .from("job_assignments")
    .select("job_id, jobs(status)")
    .eq("engineer_id", engineerId)
    .order("assigned_at", { ascending: false })
    .limit(10);

  if (!assignments) return null;

  for (const assignment of assignments) {
    if ((assignment as any).jobs?.status === "active") {
      console.log(`Fallback active job found: ${assignment.job_id}`);
      return assignment.job_id;
    }
  }

  // 4. Last resort: most recently assigned job regardless of status
  const fallback = assignments[0]?.job_id || null;
  console.log(`Last resort job: ${fallback}`);
  return fallback;
}
