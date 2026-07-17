// Classify a photo of a paper job sheet against the caller's org's
// published job_sheet_templates and return the top matches.
// Used by the admin "Scan Paper Report" backfill flow.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type TemplateSummary = {
  id: string;
  name: string;
  category: string | null;
  job_category: string | null;
  field_labels: string[];
};

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) return null;
  const opener = cleaned[start];
  const closer = opener === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closer);
  if (end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.substring(start, end + 1));
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const images: { image_base64: string; mime_type?: string }[] =
      Array.isArray(body.images)
        ? body.images
        : body.image_base64
          ? [{ image_base64: body.image_base64, mime_type: body.mime_type }]
          : [];

    if (images.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one image is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Load caller's org templates (org-scoped + global).
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const orgId = (profile as any)?.org_id;

    const { data: templates, error: tplErr } = await supabase
      .from("job_sheet_templates")
      .select("id, name, category, job_category, fields, org_id, status")
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .eq("status", "published");

    if (tplErr) throw new Error(tplErr.message);

    const summaries: TemplateSummary[] = (templates || []).map((t: any) => {
      const labels = Array.isArray(t.fields)
        ? t.fields
            .slice(0, 8)
            .map((f: any) => f?.label)
            .filter((x: any) => typeof x === "string")
        : [];
      return {
        id: t.id,
        name: t.name,
        category: t.category ?? null,
        job_category: t.job_category ?? null,
        field_labels: labels,
      };
    });

    if (summaries.length === 0) {
      return new Response(JSON.stringify({ candidates: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const catalog = summaries
      .map(
        (s, i) =>
          `${i + 1}. id=${s.id} | "${s.name}" | category=${s.category || "-"} | fields=${s.field_labels.join(" · ")}`,
      )
      .join("\n");

    const systemPrompt = `You are helping an admin file a completed paper job sheet in a fire-safety servicing app.
Look at the photo(s) of the paper form and pick which of the available templates it best matches.

ALSO classify the document type so we can catch misdrops:
- "job_sheet": a completed handwritten job/inspection/service report — printed section titles like "Visual Inspection", "Pressure Test", "Certificate of Inspection", tick boxes, handwritten answers, signature blocks.
- "purchase_order": a purchase order issued BEFORE work — a PO number, ordering party, line items with quantities and prices, delivery instructions, no handwritten inspection answers.
- "unknown": can't tell.

CRITICAL matching rules:
- You MUST return a template_id from the "Available templates" list below. Never invent or generate a template name that is not in the list — return the exact uuid.
- Match on printed headings, section titles, question wording, and layout — NOT on handwritten answers.
- A form titled "6 MONTHLY VISUAL INSPECTION", "VISUAL INSPECTION", "PERIODIC VISUAL", or that only contains yes/no tick-box rows for physical condition (valves, outlets, signage, cabinet) is a VISUAL inspection template — never a pressure test template, even if the form is about a dry riser.
- A form titled "HYDRAULIC PRESSURE TEST", "PRESSURE TEST", "ANNUAL PRESSURE TEST", or that has psi/bar/pressure-reading columns and a hold-time table is a PRESSURE TEST template.
- "CERTIFICATE OF INSPECTION SPRINKLER SYSTEM" / "SPRINKLER" → sprinkler inspection template.
- "WET RISER" → wet riser template.
- If more than one plausible template exists, return them ordered best first with honest confidences (do not return 0.9 unless the printed heading is unambiguous). If nothing is a reasonable match, return an empty candidates array.

Return STRICT JSON only, no prose, no markdown:
{"document_kind":"job_sheet|purchase_order|unknown","document_kind_reason":"short","candidates":[{"template_id":"<uuid>","confidence":0-1,"reason":"short"}]}
Return up to 3 candidates, ordered best first.`;

    const userPrompt = `Available templates:\n${catalog}\n\nBased on the photo(s), which template matches?`;

    const content: any[] = [{ type: "text", text: userPrompt }];
    for (const img of images.slice(0, 3)) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mime_type || "image/jpeg"};base64,${img.image_base64}`,
          detail: "low",
        },
      });
    }

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          temperature: 0.1,
          max_tokens: 800,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
          ],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      const status = aiResponse.status;
      if (status === 429 || status === 402) {
        return new Response(
          JSON.stringify({
            error:
              status === 402
                ? "AI credits exhausted — add credits in workspace settings."
                : "AI rate limit reached — please retry in a moment.",
          }),
          {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`AI classify error (${status}): ${errText.substring(0, 200)}`);
    }

    const result = await aiResponse.json();
    const raw = result?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParseJson(typeof raw === "string" ? raw : JSON.stringify(raw));

    let candidates: {
      template_id: string;
      confidence: number;
      reason?: string;
    }[] = [];

    if (parsed?.candidates && Array.isArray(parsed.candidates)) {
      candidates = parsed.candidates
        .map((c: any) => ({
          template_id: String(c.template_id || c.id || ""),
          confidence:
            typeof c.confidence === "number"
              ? Math.max(0, Math.min(1, c.confidence))
              : 0.5,
          reason: typeof c.reason === "string" ? c.reason : undefined,
        }))
        .filter((c: any) =>
          summaries.some((s) => s.id === c.template_id),
        )
        .slice(0, 3);
    }

    // Enrich with template name for the client
    const enriched = candidates.map((c) => {
      const t = summaries.find((s) => s.id === c.template_id)!;
      return { ...c, name: t.name, category: t.category };
    });

    return new Response(
      JSON.stringify({ candidates: enriched, considered: summaries.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("classify-job-sheet-template error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
