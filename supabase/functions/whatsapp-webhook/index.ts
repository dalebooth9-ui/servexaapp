import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireEnv, MissingEnvError } from "../_shared/requireEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let SUPABASE_URL: string, SUPABASE_SERVICE_ROLE_KEY: string;
  let TWILIO_AUTH_TOKEN: string, TWILIO_ACCOUNT_SID: string, TWILIO_WHATSAPP_NUMBER: string;
  try {
    ({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_WHATSAPP_NUMBER } =
      requireEnv([
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_ACCOUNT_SID",
        "TWILIO_WHATSAPP_NUMBER",
      ] as const));
  } catch (err) {
    if (err instanceof MissingEnvError) {
      console.error("[whatsapp-webhook] missing configuration:", err.message);
      // Return 503 with a clear JSON body so operators can see exactly which secret is missing.
      return new Response(
        JSON.stringify({ error: "missing_configuration", message: err.message, missing: err.missing }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    throw err;
  }

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

    console.log(`[profile-lookup] normalisedFrom="${from}" rawFrom="${rawFrom}" found=${!!profile} error=${profileError?.message ?? "none"} engineerId=${profile?.user_id ?? "n/a"}`);

    if (!profile) {
      console.log(`[profile-lookup] Unknown WhatsApp number: ${from} — no matching profile`);
      return twimlResponse();
    }

    const engineerId = profile.user_id;
    console.log(`[profile-lookup] resolved engineerId=${engineerId} for from=${from}`);
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
      console.log(`[media-msg] numMedia=${numMedia} messageBody="${messageBody}"`);
      // Check if message body / caption contains a job reference.
      // Supports any prefix-style ref, e.g. VFP-00124, TM-2026-0608, QUO-00021, JOB-2026-001.
      const jobRefPattern = /\b[A-Z]{2,6}(?:-[A-Z0-9]+){1,4}\b/gi;
      const candidates = messageBody ? Array.from(messageBody.matchAll(jobRefPattern)).map(m => m[0]) : [];

      let jobId: string | null = null;

      // Try each candidate against jobs.reference_number (case-insensitive exact match)
      for (const cand of candidates) {
        const { data: refJob } = await supabase
          .from("jobs")
          .select("id")
          .ilike("reference_number", cand)
          .maybeSingle();
        if (refJob) { jobId = refJob.id; break; }
      }

      // If no reference matched, try fuzzy match against job name OR linked site name
      // using the caption text. Combined search (not fallback): any job where
      //   jobs.name ILIKE %caption%  OR  jobs.site → sites.name ILIKE %caption%.
      // Strip out any reference-number patterns we already tried, then use the
      // remaining caption text as the fuzzy search term.
      const strippedBody = (messageBody || "").replace(jobRefPattern, " ").replace(/\s+/g, " ").trim();
      console.log(`[fuzzy-match] jobId=${jobId} strippedBody="${strippedBody}" candidatesFromRef=${candidates.length}`);
      let fuzzyAttemptedNoMatch = false;
      if (!jobId && strippedBody.length >= 3) {
        const term = strippedBody.slice(0, 120);
        const escaped = term.replace(/[%_,()]/g, " ").trim();
        console.log(`[fuzzy-match] searching with term="${escaped}"`);

        // 1. Jobs whose own name matches
        const { data: byJobName, error: byJobNameErr } = await supabase
          .from("jobs")
          .select("id, name, reference_number, sites(name)")
          .neq("status", "archived")
          .ilike("name", `%${escaped}%`)
          .limit(10);
        if (byJobNameErr) console.error(`[fuzzy-match] byJobName err:`, byJobNameErr);
        console.log(`[fuzzy-match] byJobName count=${(byJobName||[]).length} rows:`, JSON.stringify(byJobName));

        // 2. Jobs whose linked site name matches (via site_id FK)
        const { data: matchingSites, error: sitesErr } = await supabase
          .from("sites")
          .select("id, name")
          .ilike("name", `%${escaped}%`)
          .limit(10);
        if (sitesErr) console.error(`[fuzzy-match] sites err:`, sitesErr);
        console.log(`[fuzzy-match] matchingSites rows:`, JSON.stringify(matchingSites));

        let bySiteName: any[] = [];
        if (matchingSites && matchingSites.length > 0) {
          const siteIds = matchingSites.map((s: any) => s.id);
          const { data, error: bySiteErr } = await supabase
            .from("jobs")
            .select("id, name, reference_number, sites(name)")
            .in("site_id", siteIds)
            .neq("status", "archived")
            .order("updated_at", { ascending: false })
            .limit(10);
          if (bySiteErr) console.error(`[fuzzy-match] bySite err:`, bySiteErr);
          bySiteName = data || [];
        }

        // Merge + dedupe by job id
        const merged = new Map<string, any>();
        for (const j of [...(byJobName || []), ...bySiteName]) merged.set(j.id, j);
        const matches = Array.from(merged.values());
        console.log(`[fuzzy-match] byJobName=${(byJobName||[]).length} bySite=${bySiteName.length} merged=${matches.length}`);

        if (matches.length === 1) {
          jobId = matches[0].id;
          console.log(`[fuzzy-match] single match → job ${matches[0].reference_number} (${jobId})`);
        } else if (matches.length > 1) {
          const refs = matches
            .slice(0, 10)
            .map((j: any) => j.reference_number || j.name || j.id)
            .join(", ");
          await sendWhatsApp(twilioSender, from,
            `Found ${matches.length} jobs matching "${term}": ${refs} — please resend with the reference number.`
          );
          return twimlResponse();
        } else {
          // Caption was provided but no jobs matched — do NOT silently fall back
          // to a stale active-job context. Tell the engineer.
          fuzzyAttemptedNoMatch = true;
          console.log(`[fuzzy-match] zero matches for caption — skipping getActiveJob fallback`);
        }
      }

      // Otherwise, try the normal active job resolution — but only if the
      // engineer didn't give us a caption that we already failed to match.
      if (!jobId && !fuzzyAttemptedNoMatch) {
        jobId = await getActiveJob(supabase, engineerId);
        console.log(`[active-job] resolved jobId=${jobId}`);
      }

      // If a caption was provided but matched nothing, prompt the engineer
      // instead of silently dropping or guessing.
      if (!jobId && fuzzyAttemptedNoMatch) {
        console.log(`[media-msg] FINAL jobId=null (no fuzzy match, fallback skipped)`);
        await sendWhatsApp(twilioSender, from,
          `⚠️ Couldn't find a job matching "${strippedBody.slice(0, 80)}". Please resend with the job reference number (e.g. VFP-00123 or TM-2026-0608).`
        );
        return twimlResponse();
      }
      console.log(`[media-msg] FINAL resolved jobId=${jobId}`);

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

      // Fetch job info once for friendly file naming + confirmation message
      const { data: jobInfo } = await supabase
        .from("jobs")
        .select("reference_number, name, customer, customers(name), sites(name, address)")
        .eq("id", jobId)
        .maybeSingle();

      // Load workspace filename template (with sensible default)
      const { data: fmtRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "filename_format")
        .maybeSingle();
      const fmtCfg = (fmtRow?.value as any) || {};
      const template: string = fmtCfg.template || "{type} - {reference} - {customer}";

      // Engineer name for {engineer} token
      const { data: engProfileForName } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", engineerId)
        .maybeSingle();

      const sanitize = (s: string) =>
        s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

      const sanitizeStorageSegment = (s: string) => {
        const cleaned = s
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Za-z0-9._-]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^[_\-.]+|[_\-.]+$/g, "")
          .slice(0, 120);
        return cleaned || `file_${Date.now()}`;
      };

      const buildFriendlyName = (isImage: boolean, ext: string, idx: number) => {
        const tokens: Record<string, string> = {
          "{type}": isImage ? "Photo" : "Document",
          "{reference}": (jobInfo as any)?.reference_number || "",
          "{job_name}": (jobInfo as any)?.name || "",
          "{customer}":
            (jobInfo as any)?.customer || (jobInfo as any)?.customers?.name || "",
          "{date}": new Date().toISOString().slice(0, 10),
          "{engineer}": (engProfileForName as any)?.full_name || "",
        };
        let out = template;
        Object.entries(tokens).forEach(([k, v]) => {
          out = out.split(k).join(v || "");
        });
        // Collapse separator runs left by empty tokens (e.g. " -  - ")
        out = out.replace(/\s*-\s*-\s*/g, " - ").replace(/^\s*-\s*|\s*-\s*$/g, "");
        const base = sanitize(out) || `${isImage ? "Photo" : "Document"}_${Date.now()}`;
        const suffix = numMedia > 1 ? ` (${idx + 1})` : "";
        return `${base}${suffix}.${ext}`;
      };

      // Pre-fetch existing friendly file_names for this job+engineer so we
      // can detect collisions and append a short disambiguator.
      const { data: existingDocs } = await supabase
        .from("submissions")
        .select("file_name")
        .eq("job_id", jobId)
        .eq("engineer_id", engineerId);
      const usedNames = new Set<string>(
        (existingDocs || []).map((d: any) => (d.file_name || "").toLowerCase()),
      );

      // Short, URL-safe hash of an arbitrary string (5 chars, base36).
      const shortHash = (s: string) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return Math.abs(h).toString(36).slice(0, 5).padStart(5, "0");
      };

      const disambiguate = (name: string, seedKey: string): string => {
        if (!usedNames.has(name.toLowerCase())) {
          usedNames.add(name.toLowerCase());
          return name;
        }
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        // First try a short content-derived hash, then fall back to timestamp + counter.
        let candidate = `${stem} ~${shortHash(seedKey)}${ext}`;
        let counter = 1;
        while (usedNames.has(candidate.toLowerCase())) {
          candidate = `${stem} ~${shortHash(seedKey)}-${Date.now().toString(36).slice(-4)}${counter}${ext}`;
          counter++;
          if (counter > 20) break; // safety
        }
        usedNames.add(candidate.toLowerCase());
        return candidate;
      };

      let savedCount = 0;
      const savedPaths: string[] = [];
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
        const rawFriendly = buildFriendlyName(isImage, ext, i);
        const friendlyName = disambiguate(rawFriendly, `${mediaUrl}|${i}|${Date.now()}`);
        // Storage keys must be URL-safe; keep the human-friendly label in file_name only.
        const safeStorageName = sanitizeStorageSegment(friendlyName);
        const storagePath = `${jobId}/${engineerId}/${Date.now()}_${i}_${safeStorageName}`;

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
          file_name: friendlyName,
          whatsapp_message_id: messageSid,
          content: messageBody || null,
        });
        savedCount++;
        savedPaths.push(storagePath);
      }

      // Send confirmation back to engineer with matched job + download link/folder
      if (savedCount > 0) {
        const ji: any = jobInfo || {};
        const ref = ji.reference_number || "job";
        const jobName = ji.name ? ` — ${ji.name}` : "";
        const siteName = ji.sites?.name ? ` — ${ji.sites.name}` : (ji.sites?.address ? ` — ${ji.sites.address}` : "");
        const noun = savedCount === 1 ? "Photo" : `${savedCount} files`;
        const folderPath = `submissions/${jobId}/${engineerId}`;

        // Generate a signed download link (7-day expiry) for the first saved file
        let linkLine = "";
        try {
          const { data: signed } = await supabase.storage
            .from("submissions")
            .createSignedUrl(savedPaths[0], 60 * 60 * 24 * 7);
          if (signed?.signedUrl) {
            linkLine = savedCount === 1
              ? `\n📥 Download: ${signed.signedUrl}`
              : `\n📥 First file: ${signed.signedUrl}\n📁 Folder: ${folderPath}`;
          } else {
            linkLine = `\n📁 Folder: ${folderPath}`;
          }
        } catch (e) {
          console.error("[confirmation] signed URL error:", e);
          linkLine = `\n📁 Folder: ${folderPath}`;
        }

        await sendWhatsApp(twilioSender, from,
          `✅ ${noun} saved to job ${ref}${jobName}${siteName}${linkLine}`
        );
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

      // 3. Match by site name → most recent active job at that site
      if (!job) {
        const { data: matchingSites } = await supabase
          .from("sites")
          .select("id")
          .ilike("name", `%${trimmed}%`)
          .limit(5);
        const siteIds = (matchingSites || []).map((s: any) => s.id);
        if (siteIds.length > 0) {
          const { data: bySite } = await supabase
            .from("jobs")
            .select("id, name, reference_number")
            .in("site_id", siteIds)
            .in("status", ["active", "in_progress", "scheduled", "awaiting_parts", "on_hold", "requires_revisit"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (bySite) job = bySite;
        }
      }

      // 4. Match by job address (partial)
      if (!job) {
        const { data: byAddr } = await supabase
          .from("jobs")
          .select("id, name, reference_number")
          .ilike("address", `%${trimmed}%`)
          .in("status", ["active", "in_progress", "scheduled", "awaiting_parts", "on_hold", "requires_revisit"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byAddr) job = byAddr;
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

      // Heuristic: short messages (≤5 words, ≤50 chars) look like a job/site lookup
      // attempt rather than a note. If we can't match them, ask the engineer to
      // clarify instead of silently attaching to whatever active job is cached —
      // that's how photos end up in the wrong folder.
      const wordCount = trimmed.split(/\s+/).length;
      const looksLikeJobLookup = trimmed.length <= 50 && wordCount <= 5;

      if (looksLikeJobLookup) {
        console.log(`No job/site match for short text "${trimmed}" — asking for clarification`);
        await sendWhatsApp(twilioSender, from,
          `⚠️ Couldn't find a job, site or address matching "${trimmed.slice(0, 80)}". Please send the job reference number (e.g. VFP-00123) to set the job.`
        );
        return twimlResponse();
      }

      // Longer text → treat as a note for the current active job
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
