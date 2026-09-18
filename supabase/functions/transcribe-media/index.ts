import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM = `You are a UK fire-protection and safety expert. You are given a TRANSCRIPT of an on-site inspection video or voice note.

Extract:
1. A concise summary (2-4 sentences) of what was said or observed.
2. A list of remedial action items — specific things that need fixing, replacing, testing or checking.

Return JSON: { "summary": "...", "remedials": [{ "description": "...", "severity": "high" }] }

HARD RULES:
- Use ONLY what is actually said in the transcript. Never invent work, locations, quantities or equipment.
- Only include actionable remedial items, not general observations.
- Be specific: include the location, equipment and the action required, exactly as described.
- Where a quantity is spoken ("three outlet locks"), expand into separate items ("... 1 of 3", "... 2 of 3", "... 3 of 3").
- If no remedial work is mentioned, return an empty array.
- Severity: critical = immediate danger/non-compliance, high = urgent, medium = should be addressed soon, low = minor improvement.
- British English.`;

type Remedial = { description: string; severity: string; seq: number };

const SEVERITIES = ["low", "medium", "high", "critical"];

/** Deepgram (preferred when configured) — accepts a signed URL directly. */
async function transcribeWithDeepgram(key: string, signedUrl: string) {
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&paragraphs=true&utterances=true&detect_language=true",
    {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: signedUrl }),
    },
  );
  if (!res.ok) throw new Error(`Deepgram error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  const alt = result.results?.channels?.[0]?.alternatives?.[0];
  return {
    transcript: alt?.paragraphs?.transcript || alt?.transcript || "",
    duration: result.metadata?.duration ?? null,
  };
}

/** ElevenLabs Scribe fallback — already configured in this workspace. */
async function transcribeWithElevenLabs(key: string, signedUrl: string, fileName: string) {
  const media = await fetch(signedUrl);
  if (!media.ok) throw new Error(`Could not download media (${media.status})`);
  const blob = await media.blob();
  if (blob.size > 90 * 1024 * 1024) throw new Error("Recording is too large to transcribe (over 90MB).");

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", blob, fileName || "recording");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return { transcript: String(result.text || ""), duration: null as number | null };
}

async function extractRemedials(transcript: string) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  const endpoint = openaiKey
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const apiKey = openaiKey || lovableKey;
  const model = openaiKey ? "gpt-4o-mini" : "google/gemini-3.8-flash";
  if (!apiKey) return { summary: "", remedials: [] as Remedial[] };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Transcript from on-site recording:\n\n${transcript}` },
      ],
    }),
  });

  if (!res.ok) {
    console.error("AI extraction failed", res.status, await res.text());
    return { summary: "", remedials: [] as Remedial[] };
  }

  const result = await res.json();
  let parsed: any = {};
  try {
    parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
  } catch {
    parsed = {};
  }
  const remedials: Remedial[] = (Array.isArray(parsed.remedials) ? parsed.remedials : [])
    .map((r: any, i: number) => ({
      description: String(r?.description || "").trim(),
      severity: SEVERITIES.includes(String(r?.severity || "").toLowerCase())
        ? String(r.severity).toLowerCase()
        : "medium",
      seq: i,
    }))
    .filter((r: Remedial) => r.description.length > 0);
  return { summary: String(parsed.summary || ""), remedials };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let recordId: string | null = null;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!deepgramKey && !elevenKey) {
      return json({ error: "Transcription is not configured on this workspace." }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const { file_path, job_id, survey_id, bucket = "submissions" } = body || {};
    if (!file_path) return json({ error: "file_path is required" }, 400);

    const { data: membership } = await admin
      .from("organisation_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const orgId = membership?.org_id ?? null;

    const { data: signedData, error: signErr } = await admin.storage
      .from(bucket)
      .createSignedUrl(file_path, 900);
    if (signErr || !signedData?.signedUrl) {
      return json({ error: `Cannot access file: ${signErr?.message || "no URL"}` }, 400);
    }

    const { data: record, error: insertErr } = await admin
      .from("media_transcripts")
      .insert({
        org_id: orgId,
        job_id: job_id || null,
        survey_id: survey_id || null,
        file_path,
        bucket,
        status: "processing",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insertErr) return json({ error: `Failed to create transcript record: ${insertErr.message}` }, 400);
    recordId = record.id;

    const fileName = String(file_path).split("/").pop() || "recording";
    const { transcript, duration } = deepgramKey
      ? await transcribeWithDeepgram(deepgramKey, signedData.signedUrl)
      : await transcribeWithElevenLabs(elevenKey!, signedData.signedUrl, fileName);

    if (!transcript.trim()) {
      const payload = {
        transcript: "",
        summary: "No speech detected in this recording.",
        suggested_remedials: [] as Remedial[],
        duration_seconds: duration,
      };
      await admin
        .from("media_transcripts")
        .update({ ...payload, status: "completed", updated_at: new Date().toISOString() })
        .eq("id", recordId);
      return json({ id: recordId, ...payload });
    }

    const { summary, remedials } = await extractRemedials(transcript);

    await admin
      .from("media_transcripts")
      .update({
        transcript,
        summary,
        suggested_remedials: remedials,
        status: "completed",
        duration_seconds: duration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    return json({
      id: recordId,
      transcript,
      summary,
      suggested_remedials: remedials,
      duration_seconds: duration,
    });
  } catch (err: any) {
    console.error("transcribe-media error:", err);
    if (recordId) {
      await admin
        .from("media_transcripts")
        .update({ status: "failed", error: String(err?.message || err), updated_at: new Date().toISOString() })
        .eq("id", recordId);
    }
    return json({ error: String(err?.message || err) }, 400);
  }
});
