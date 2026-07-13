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

    // Validate Twilio signature — enforced
    const signature = req.headers.get("x-twilio-signature");
    console.log(`Signature present: ${!!signature}`);

    if (!signature) {
      console.error("Missing Twilio signature — rejecting request");
      return new Response("Forbidden: missing signature", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Use the public-facing URL that Twilio signs against, not the internal req.url
    const publicUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    console.log(`Validating signature against URL: ${publicUrl}`);
    const isValid = await validateTwilioSignature(publicUrl, params, signature, TWILIO_AUTH_TOKEN);
    console.log(`Signature valid: ${isValid}`);
    if (!isValid) {
      console.error("Invalid Twilio signature — rejecting request");
      return new Response("Forbidden: invalid signature", {
        status: 403,
        headers: corsHeaders,
      });
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

    // Find engineer by WhatsApp number — try E.164 first, fall back to 0-prefixed UK legacy format.
    const fallbackFrom = from.startsWith("+44") ? "0" + from.slice(3) : null;
    const candidates = fallbackFrom ? [from, fallbackFrom] : [from];
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, whatsapp_number")
      .in("whatsapp_number", candidates)
      .maybeSingle();

    console.log(`[profile-lookup] normalisedFrom="${from}" fallback="${fallbackFrom ?? ""}" rawFrom="${rawFrom}" found=${!!profile} error=${profileError?.message ?? "none"} engineerId=${profile?.user_id ?? "n/a"}`);

    if (!profile) {
      console.log(`[profile-lookup] Unknown WhatsApp number: ${from} — no matching profile`);
      return twimlResponse();
    }

    const engineerId = profile.user_id;

    // ── Resolve engineer's org ─────────────────────────────────────
    // ALL writes below MUST be stamped with this org_id. The affected tables
    // (submissions, pending_whatsapp_scans, job_activity_log, notifications)
    // have `NOT NULL DEFAULT '11111111-...'` on org_id — so any insert that
    // omits org_id silently attributes the row to Viva Fire. That's fine
    // today (Viva is single-tenant), but it's a cross-tenant leak the moment
    // a second org's engineer WhatsApps us. We derive org from an authoritative
    // source (organisation_members) rather than trusting profile.org_id, which
    // is only a denormalised copy.
    const { data: memberRow } = await supabase
      .from("organisation_members")
      .select("org_id")
      .eq("user_id", engineerId)
      .eq("status", "active")
      .maybeSingle();
    const engineerOrgId: string | null = memberRow?.org_id ?? null;
    if (!engineerOrgId) {
      console.warn(`[profile-lookup] engineer ${engineerId} has no active org membership — dropping message to avoid mis-attribution`);
      return twimlResponse();
    }
    console.log(`[profile-lookup] resolved engineerId=${engineerId} orgId=${engineerOrgId} for from=${from}`);
    const twilioSender = { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, fromNumber: TWILIO_WHATSAPP_NUMBER };

    // ── Idempotency guard ────────────────────────────────────────
    // Twilio occasionally re-delivers the same MessageSid (network retry, our
    // slow response). Every submission we write records the MessageSid, so a
    // prior successful run is easy to detect. If we've already filed anything
    // for this MessageSid + engineer, bail out — never double-file.
    if (messageSid) {
      const { data: alreadyProcessed } = await supabase
        .from("submissions")
        .select("id")
        .eq("whatsapp_message_id", messageSid)
        .eq("engineer_id", engineerId)
        .limit(1);
      if (alreadyProcessed && alreadyProcessed.length > 0) {
        console.log(`[idempotency] MessageSid=${messageSid} already processed for engineer=${engineerId} — skipping`);
        return twimlResponse();
      }
    }


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
          org_id: engineerOrgId,
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

      // ── Burst race guard ────────────────────────────────────────
      // Real incident (2026-07-13 11:05 UTC): a captioned photo + 6
      // captionless photos arrived within ~5s. Parallel invocations of this
      // function read the sticky-context row BEFORE the captioned sibling's
      // context write had landed, so 3 captionless siblings inherited a
      // *stale* context set hours earlier and mis-filed to another customer.
      //
      // Fix for captionless media: defer briefly so any captioned sibling in
      // the same burst wins the context write, then resolve context against
      // the NEWEST note. Captioned media is unaffected — it always resolves
      // from its own text.
      const bodyIsEmptyForBurst = !messageBody || messageBody.trim().length === 0;
      if (bodyIsEmptyForBurst) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        console.log(`[burst-guard] captionless media deferred 2500ms to let sibling context writes land`);
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
        // Load a pool of non-archived jobs (with linked site info) to score against.
        // Client-side normalised matching so "cedar tree", "cedar-tree",
        // "CEDARTREE COURT" all collapse to the same token.
        const { data: jobPool, error: poolErr } = await supabase
          .from("jobs")
          .select("id, name, reference_number, address, sites(name, address, postcode)")
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (poolErr) console.error(`[fuzzy-match] pool err:`, poolErr);
        console.log(`[fuzzy-match] pool size=${(jobPool || []).length}`);

        const matches = matchJobsByCaption(strippedBody, jobPool || []);
        console.log(`[fuzzy-match] scored matches=${matches.length} top:`,
          JSON.stringify(matches.slice(0, 5).map((m) => ({
            ref: m.job.reference_number, name: m.job.name, score: m.score, tokens: m.tokensMatched,
          }))));

        if (matches.length === 1 || (matches.length > 1 && matches[0].score > matches[1].score * 1.5)) {
          jobId = matches[0].job.id;
          console.log(`[fuzzy-match] confident match → job ${matches[0].job.reference_number} (${jobId})`);
        } else if (matches.length > 1) {
          const refs = matches
            .slice(0, 10)
            .map((m) => m.job.reference_number || m.job.name || m.job.id)
            .join(", ");
          await sendWhatsApp(twilioSender, from,
            `Found ${matches.length} jobs matching "${strippedBody.slice(0, 80)}": ${refs} — please resend with the reference number.`
          );
          return twimlResponse();
        } else {
          fuzzyAttemptedNoMatch = true;
          console.log(`[fuzzy-match] zero matches for caption — skipping getActiveJob fallback`);
        }
      }

      // Track whether this media message matched via its own caption — if so,
      // we set sticky context so subsequent captionless photos in the same
      // burst follow the same job.
      const matchedViaCaption = !!jobId;

      // Otherwise, try the normal active job resolution — but only if the
      // engineer didn't give us a caption that we already failed to match.
      // Strict mode + 4h window: never guess, never use stale context.
      if (!jobId && !fuzzyAttemptedNoMatch) {
        jobId = await getActiveJob(supabase, engineerId, true, 4);
        console.log(`[active-job] strict(4h) resolved jobId=${jobId}`);
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
            org_id: engineerOrgId,
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
            `📸 Got it, ${engName}! Which job is this for? Reply with the job name or reference and resend, or send a job name first. In the meantime I've queued it for the office to review.`
          );
        } catch (scanError) {
          console.error("Auto-scan pipeline error:", scanError);
          await sendWhatsApp(twilioSender, from,
            "⚠️ Which job is this for? Reply with the job name or reference (e.g. VFP-00123) and resend."
          );
        }
        return twimlResponse();
      }

      // If still no job, prompt the engineer
      if (!jobId) {
        await sendWhatsApp(twilioSender, from,
          "⚠️ Which job is this for? Reply with the job name or reference (e.g. VFP-00123) and resend, or send a job name first."
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
          org_id: engineerOrgId,
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

        // If this media matched via its own caption, set/refresh sticky context
        // so subsequent captionless photos in the same burst follow this job.
        // Without this write, only standalone text messages set context — which
        // is exactly the bug that caused captionless follow-ups to fall through
        // to the today's-visits guess and mis-file to another customer's job.
        if (matchedViaCaption) {
          await supabase.from("submissions").insert({
            job_id: jobId,
            engineer_id: engineerId,
            type: "note",
            content: `Job context set: ${messageBody.slice(0, 200)} (via captioned photo)`,
            org_id: engineerOrgId,
          });
          console.log(`[sticky-context] set from captioned media → job ${jobId}`);
        }

        await sendWhatsApp(twilioSender, from,
          `✅ ${noun} saved to job ${ref}${jobName}${siteName}`
        );
      }

      return twimlResponse();
    }

    // Handle text messages — check for commands first
    if (messageBody) {
      const command = messageBody.trim().toLowerCase();

      // ── Combined "<job name/ref> <command>" messages ──
      // e.g. "Cedartree court complete", "VFP-00132 - info", "site name, photos".
      // If the message ends with a known command word after a job identifier,
      // resolve the prefix to a job, set sticky context, then run the command.
      // Only fires when the whole message isn't itself a bare command.
      const COMBINED_COMMANDS: Record<string, string> = {
        complete: "complete", done: "complete", finish: "complete", finished: "complete",
        info: "info", details: "info", status: "info",
        photos: "photos", images: "photos", pics: "photos",
        files: "files", documents: "files", docs: "files",
        report: "report", reports: "report",
        notes: "notes", history: "notes", log: "notes",
        parts: "parts", materials: "parts",
        help: "help", commands: "help", menu: "help",
      };
      const combinedMatch = command.match(
        /^(.+?)[\s,\-–—]+(complete|done|finish|finished|info|details|status|photos|images|pics|files|documents|docs|report|reports|notes|history|log|parts|materials|help|commands|menu)\s*[.!?]*$/i,
      );
      if (combinedMatch && !(command in COMBINED_COMMANDS)) {
        const prefixRaw = messageBody.trim().slice(0, combinedMatch[1].length).trim().replace(/[\s,\-–—]+$/, "");
        const cmd = COMBINED_COMMANDS[combinedMatch[2].toLowerCase()];
        console.log(`[combined-cmd] prefix="${prefixRaw}" cmd=${cmd}`);

        if (prefixRaw.length >= 2) {
          // Resolve prefix to a job (exact ref → ilike name → fuzzy pool match)
          let comboJob: any = null;
          const { data: byRef } = await supabase
            .from("jobs").select("id, name, reference_number")
            .ilike("reference_number", prefixRaw).maybeSingle();
          if (byRef) comboJob = byRef;
          if (!comboJob) {
            const { data: byName } = await supabase
              .from("jobs").select("id, name, reference_number")
              .ilike("name", `%${prefixRaw}%`).limit(1).maybeSingle();
            if (byName) comboJob = byName;
          }
          if (!comboJob) {
            const { data: jobPool } = await supabase
              .from("jobs")
              .select("id, name, reference_number, address, sites(name, address, postcode)")
              .in("status", ["active", "in_progress", "scheduled", "awaiting_parts", "on_hold", "requires_revisit"])
              .order("updated_at", { ascending: false })
              .limit(1000);
            const matches = matchJobsByCaption(prefixRaw, jobPool || []);
            if (matches.length > 0 && (matches.length === 1 || matches[0].score > matches[1].score * 1.5)) {
              comboJob = matches[0].job;
            } else if (matches.length > 1) {
              const refs = matches.slice(0, 10).map((m) => m.job.reference_number || m.job.name || m.job.id).join(", ");
              await sendWhatsApp(twilioSender, from,
                `Found ${matches.length} jobs matching "${prefixRaw.slice(0, 80)}": ${refs} — please resend with the reference number.`
              );
              return twimlResponse();
            }
          }

          if (comboJob) {
            // Set sticky context so subsequent captionless media follows this job
            await supabase.from("submissions").insert({
              job_id: comboJob.id,
              engineer_id: engineerId,
              type: "note",
              content: `Job context set: ${prefixRaw} (via combined command)`,
              whatsapp_message_id: messageSid,
            });
            console.log(`[combined-cmd] resolved job ${comboJob.reference_number} (${comboJob.id}) → running ${cmd}`);

            switch (cmd) {
              case "complete":
                await handleCompleteCommand(supabase, twilioSender, from, comboJob.id, engineerId);
                break;
              case "info":
                await handleInfoCommand(supabase, twilioSender, from, comboJob.id); break;
              case "photos":
                await handlePhotosCommand(supabase, twilioSender, from, comboJob.id); break;
              case "files":
                await handleFilesCommand(supabase, twilioSender, from, comboJob.id); break;
              case "report":
                await handleReportCommand(supabase, twilioSender, from, comboJob.id); break;
              case "notes":
                await handleNotesCommand(supabase, twilioSender, from, comboJob.id); break;
              case "parts":
                await handlePartsCommand(supabase, twilioSender, from, comboJob.id); break;
              case "help":
                // Confirm the job set, then fall through to help text
                await sendWhatsApp(twilioSender, from,
                  `✅ Job set: *${comboJob.reference_number}* — ${comboJob.name}\n\nSee *help* for commands.`);
                break;
            }
            return twimlResponse();
          }

          // Prefix didn't resolve — ask for clarification instead of treating as a note
          await sendWhatsApp(twilioSender, from,
            `⚠️ Couldn't find a job matching "${prefixRaw.slice(0, 80)}". Please resend with the job reference number (e.g. VFP-00123), then the command.`
          );
          return twimlResponse();
        }
      }


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

      // 3. Normalised fuzzy match by job name / site name / site address / job address
      //    Uses the same tokenised scoring as the caption matcher so "cedar tree"
      //    matches "CEDARTREE COURT".
      if (!job) {
        const { data: jobPool } = await supabase
          .from("jobs")
          .select("id, name, reference_number, address, sites(name, address, postcode)")
          .in("status", ["active", "in_progress", "scheduled", "awaiting_parts", "on_hold", "requires_revisit"])
          .order("updated_at", { ascending: false })
          .limit(1000);
        const matches = matchJobsByCaption(trimmed, jobPool || []);
        if (matches.length > 0 && (matches.length === 1 || matches[0].score > matches[1].score * 1.5)) {
          job = matches[0].job;
        }
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

  // Safety: never send signed download URLs back over WhatsApp.
  // List photo metadata only — engineers/admins can view files in the app.
  let msg = `📷 *Photos (${photos.length}):*\n\n`;
  for (const photo of photos) {
    const date = new Date(photo.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    msg += `• ${date} — ${photo.file_name || "Photo"}\n`;
  }
  msg += `\nView them in the job folder in Servexa.`;
  await sendWhatsApp(sender, to, msg);
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

  // Safety: never send signed download URLs back over WhatsApp.
  let msg = `📄 *Documents (${docs.length}):*\n\n`;
  for (const doc of docs) {
    const date = new Date(doc.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    msg += `• ${date} — ${doc.file_name || "Document"}\n`;
  }
  msg += `\nOpen them in the job folder in Servexa.`;
  await sendWhatsApp(sender, to, msg);
}

async function handleCompleteCommand(supabase: any, sender: TwilioSender, to: string, jobId: string, engineerId: string) {
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, reference_number, name, status, org_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    console.error("[complete] load job failed", { jobId, jobErr });
    await sendWhatsApp(sender, to,
      "Something went wrong completing the job — it has NOT been marked complete, please tell the office.");
    return;
  }

  if (job.status === "completed") {
    await sendWhatsApp(sender, to, `✅ *${job.reference_number}* is already marked as completed.`);
    return;
  }

  // Look up engineer name for the activity log entry
  let engineerName = "an engineer";
  try {
    const { data: prof } = await supabase
      .from("profiles").select("full_name").eq("user_id", engineerId).maybeSingle();
    if (prof?.full_name) engineerName = prof.full_name;
  } catch (_) { /* non-fatal */ }

  const nowIso = new Date().toISOString();

  // 1) Update the job — verify the row was actually written by using .select()
  const { data: updatedJobRows, error: jobUpdErr } = await supabase
    .from("jobs")
    .update({ status: "completed", completed_at: nowIso, completed_by: engineerId })
    .eq("id", jobId)
    .select("id, status");

  if (jobUpdErr || !updatedJobRows || updatedJobRows.length === 0 || updatedJobRows[0].status !== "completed") {
    console.error("[complete] job update failed or affected 0 rows", { jobId, jobUpdErr, updatedJobRows });
    await sendWhatsApp(sender, to,
      "Something went wrong completing the job — it has NOT been marked complete, please tell the office.");
    return;
  }

  // 2) Update today's visit for this engineer (if any). Do NOT fail the whole
  //    completion if there is no matching visit — jobs can exist without one.
  const today = new Date().toISOString().slice(0, 10);
  const { data: updatedVisits, error: visitUpdErr } = await supabase
    .from("job_visits")
    .update({ status: "completed", completed_at: nowIso })
    .eq("job_id", jobId)
    .eq("engineer_id", engineerId)
    .eq("scheduled_date", today)
    .in("status", ["upcoming", "unscheduled", "overdue"])
    .select("id");

  if (visitUpdErr) {
    // Log but don't roll back — the job itself is completed. Warn office.
    console.error("[complete] visit update errored", { jobId, engineerId, visitUpdErr });
  }

  // 3) Best-effort activity log (the trigger also logs status_change, but this
  //    records who did it — the trigger sees auth.uid()=null from service role).
  try {
    await supabase.from("job_activity_log").insert({
      job_id: jobId,
      user_id: engineerId,
      action: "status_change",
      details: `Completed via WhatsApp by ${engineerName}`,
      org_id: job.org_id,
    });
  } catch (e) {
    console.error("[complete] activity log insert failed (non-fatal)", e);
  }

  const visitNote = updatedVisits && updatedVisits.length > 0
    ? `\nToday's visit closed.`
    : "";
  await sendWhatsApp(sender, to,
    `✅ *${job.reference_number}* — ${job.name}\n\nJob marked as *completed*.${visitNote}`
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

// ── Normalised job/site matching ────────────────────────────────
// Collapses case, spaces, hyphens, dashes and punctuation so "cedar tree",
// "cedar-tree" and "CEDARTREE COURT" all map to the same tokens.
function normaliseWord(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function tokenise(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

type JobCandidate = {
  id: string;
  name?: string | null;
  reference_number?: string | null;
  address?: string | null;
  sites?: { name?: string | null; address?: string | null; postcode?: string | null } | null;
};

type ScoredJob = { job: JobCandidate; score: number; tokensMatched: number };

/**
 * Score jobs against a caption/text. The engineer typically writes the job or
 * site name first, then notes. We try the first N leading tokens (5→1) as the
 * search phrase, and score by:
 *   - how many consecutive leading caption tokens appear (in order) at the
 *     start of the normalised job name / site name / addresses
 *   - full normalised-substring hits
 * Returns candidates sorted by score descending. Only scores > 0 are returned.
 */
const isNumericToken = (t: string) => /^\d+$/.test(t);
const stripNumericTokens = (tokens: string[]) => tokens.filter((t) => !isNumericToken(t));

/**
 * Score a caption's tokens against a single field's tokens using the four
 * heuristics: full-substring, leading-consecutive, combined-prefix and
 * all-tokens-present. Returns the best score for this pairing.
 */
function scoreTokenPair(
  capTokens: string[],
  fieldTokens: string[],
  weight: number,
): { score: number; tokens: number } {
  if (capTokens.length === 0 || fieldTokens.length === 0) return { score: 0, tokens: 0 };
  const capNormFull = capTokens.join("");
  const fieldNormFull = fieldTokens.join("");
  let best = 0;
  let bestTokens = 0;

  // 1. Full normalised substring hit.
  if (fieldNormFull.includes(capNormFull) && capNormFull.length >= 3) {
    const s = weight * 3 + (fieldNormFull.startsWith(capNormFull) ? 50 : 0);
    if (s > best) { best = s; bestTokens = capTokens.length; }
  }

  // 2. Consecutive leading tokens (prefix-matching both directions).
  const maxK = Math.min(capTokens.length, fieldTokens.length, 5);
  for (let k = maxK; k >= 1; k--) {
    let allMatch = true;
    for (let i = 0; i < k; i++) {
      const ct = normaliseWord(capTokens[i]);
      const ft = normaliseWord(fieldTokens[i]);
      if (!ct || !ft) { allMatch = false; break; }
      if (!ft.startsWith(ct) && !ct.startsWith(ft)) { allMatch = false; break; }
    }
    if (allMatch) {
      const s = weight * k + 20;
      if (s > best) { best = s; bestTokens = k; }
      break;
    }
  }

  // 3. Combined-tokens prefix.
  if (best === 0 && capNormFull.length >= 4 && fieldNormFull.startsWith(capNormFull)) {
    const s = weight * 2;
    if (s > best) { best = s; bestTokens = capTokens.length; }
  }

  // 4. Every caption token appears somewhere in the field.
  if (capTokens.length >= 2) {
    const allIn = capTokens.every((t) => {
      const n = normaliseWord(t);
      return n.length >= 2 && fieldNormFull.includes(n);
    });
    if (allIn) {
      const s = weight + 10 * capTokens.length;
      if (s > best) { best = s; bestTokens = capTokens.length; }
    }
  }

  return { score: best, tokens: bestTokens };
}

function matchJobsByCaption(caption: string, jobs: JobCandidate[]): ScoredJob[] {
  const capTokens = tokenise(caption);
  if (capTokens.length === 0) return [];
  const capTokensNoNum = stripNumericTokens(capTokens);
  const capNumTokens = capTokens.filter(isNumericToken);

  const scored: ScoredJob[] = [];

  for (const job of jobs) {
    const fields: Array<{ value: string; weight: number; primary: boolean }> = [];
    if (job.name) fields.push({ value: job.name, weight: 100, primary: true });
    if (job.sites?.name) fields.push({ value: job.sites.name, weight: 90, primary: true });
    if (job.sites?.address) fields.push({ value: job.sites.address, weight: 40, primary: false });
    if (job.sites?.postcode) fields.push({ value: job.sites.postcode, weight: 60, primary: false });
    if (job.address) fields.push({ value: job.address, weight: 30, primary: false });
    if (fields.length === 0) continue;

    let best = 0;
    let bestTokens = 0;
    let matchedNumericField = false;

    for (const f of fields) {
      const fieldTokens = tokenise(f.value);
      if (fieldTokens.length === 0) continue;
      const fieldTokensNoNum = stripNumericTokens(fieldTokens);

      // Score with original tokens on both sides.
      const withNums = scoreTokenPair(capTokens, fieldTokens, f.weight);
      if (withNums.score > best) { best = withNums.score; bestTokens = withNums.tokens; }

      // Also score with numeric tokens stripped from BOTH sides — this is the
      // fix that lets "cedartree court" match "1 Cedartree Court" or
      // "HOME GROUP - CEDARTREE COURT". Purely numeric tokens are ignored on
      // both the search term and the job/site fields so that leading house
      // numbers, unit numbers, etc. never block a word-based match.
      if (capTokensNoNum.length > 0 && fieldTokensNoNum.length > 0) {
        const noNums = scoreTokenPair(capTokensNoNum, fieldTokensNoNum, f.weight);
        // Slight discount so an equally-good numbered match still wins the
        // tiebreak (see disambiguation bonus below).
        const adjusted = { score: Math.floor(noNums.score * 0.98), tokens: noNums.tokens };
        if (adjusted.score > best) { best = adjusted.score; bestTokens = adjusted.tokens; }
      }

      // Track whether any numeric token in the caption is present in this
      // field's tokens — used as a small disambiguation bonus when two jobs
      // otherwise tie (e.g. "12 High Street" vs "14 High Street").
      if (capNumTokens.length > 0) {
        for (const n of capNumTokens) {
          if (fieldTokens.includes(n)) { matchedNumericField = true; break; }
        }
      }
    }

    if (best > 0) {
      // Disambiguation bonus: caption included a number AND the job/site had
      // the same number → nudge this job above otherwise-tied candidates.
      const bonus = matchedNumericField ? 15 : 0;
      scored.push({ job, score: best + bonus, tokensMatched: bestTokens });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
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

async function getActiveJob(
  supabase: any,
  engineerId: string,
  strict = false,
  maxContextHours = 12,
): Promise<string | null> {
  // 1. Check for an explicit context set by the engineer (most recent "Job context set" note)
  //    Only trust context set within the last `maxContextHours` — stale context
  //    silently swallowing new photos is exactly the failure mode we're avoiding.
  const cutoff = new Date(Date.now() - maxContextHours * 3600 * 1000).toISOString();
  const { data: contextSubs } = await supabase
    .from("submissions")
    .select("job_id, created_at")
    .eq("engineer_id", engineerId)
    .eq("type", "note")
    .ilike("content", "Job context set:%")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (contextSubs && contextSubs.length > 0) {
    console.log(`Context job found (within ${maxContextHours}h): ${contextSubs[0].job_id} @ ${contextSubs[0].created_at}`);
    return contextSubs[0].job_id;
  }

  // In strict mode (used for media routing) we NEVER guess. Silently mis-filing
  // a photo to the wrong customer's job is worse than asking a follow-up
  // question, so return null and let the caller prompt / route to pending-scan.
  if (strict) {
    console.log(`Strict mode: no recent (<${maxContextHours}h) explicit context — returning null (no visit/assignment fallback)`);
    return null;
  }

  // 2. (Non-strict, e.g. text commands like "info"/"photos") Check today's visits
  const today = new Date().toISOString().split("T")[0];
  const { data: todayVisits } = await supabase
    .from("job_visits")
    .select("job_id, status, jobs(status)")
    .eq("engineer_id", engineerId)
    .eq("scheduled_date", today)
    .in("status", ["upcoming", "unscheduled"])
    .order("scheduled_date", { ascending: true })
    .limit(5);

  if (todayVisits && todayVisits.length > 0) {
    const activeVisit = todayVisits.find(
      (v: any) => v.jobs?.status === "active" || v.jobs?.status === "in_progress"
    );
    if (activeVisit) return activeVisit.job_id;
    return todayVisits[0].job_id;
  }

  // 3. Fall back to most recently assigned active job (non-strict only)
  const { data: assignments } = await supabase
    .from("job_assignments")
    .select("job_id, jobs(status)")
    .eq("engineer_id", engineerId)
    .order("assigned_at", { ascending: false })
    .limit(10);

  if (!assignments) return null;

  for (const assignment of assignments) {
    if ((assignment as any).jobs?.status === "active") {
      return assignment.job_id;
    }
  }

  return assignments[0]?.job_id || null;
}
