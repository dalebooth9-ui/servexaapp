import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
  const { data, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Support both legacy single-image and new multi-image format
    let images: { image_base64: string; mime_type?: string }[] = [];
    if (body.images && Array.isArray(body.images)) {
      images = body.images;
    } else if (body.image_base64) {
      images = [{ image_base64: body.image_base64, mime_type: body.mime_type }];
    }

    const { template_name, fields } = body;

    // Filter out any non-image payloads (e.g. accidentally encoded JSON error responses)
    images = images.filter((img) => {
      const mime = img.mime_type || "image/jpeg";
      return mime.startsWith("image/");
    });

    if (images.length === 0 || !fields) {
      return new Response(JSON.stringify({ error: "Missing image(s) or fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build the extraction prompt
    const fieldList = fields.map((f: any) => {
      let desc = `- "${f.id}" (label: "${f.label}", type: ${f.type})`;
      if (f.type === "pass_fail") desc += ` — value must be exactly "pass", "fail", or "n/a". TWO-COLUMN FORMS: a tick in the LEFT/PASS/YES column = "pass"; a tick in the RIGHT/FAIL/NO column = "fail". SINGLE-COLUMN FORMS: a tick = "pass", a cross/X = "fail". A handwritten "NO" or circled "NO" = "fail". A handwritten "YES" = "pass". DO NOT default to "pass" — carefully identify which column the mark is in before deciding.`;
      if (f.type === "checkbox") desc += ` — value must be true or false. A tick/checkmark = true. A cross, "X", "NO", or circled "NO" = false. An empty box = false.`;
      if (f.options?.length) desc += ` — options: ${f.options.join(", ")}`;
      return desc;
    }).join("\n");

    const systemPrompt = `You are an expert OCR system that reads handwritten job sheet forms, specialising in fire safety inspection sheets including BS9990 dry riser forms.

##  STEP 1 — ANALYSE THE FORM LAYOUT BEFORE EXTRACTING ANY VALUES

Before reading any field values, you MUST first identify the column structure of the form:
- Look at the top of each section/table for column headers. Common headers: YES / NO, PASS / FAIL, ✓ / ✗, Y / N, SATISFACTORY / UNSATISFACTORY.
- Count how many result columns there are and identify the position (left/right) of each.
- The POSITIVE column (YES/PASS/SATISFACTORY) is almost always on the LEFT.
- The NEGATIVE column (NO/FAIL/UNSATISFACTORY) is almost always on the RIGHT.
- Note: on BS9990 forms the result columns are usually on the far right of each row, with YES on the left of the pair and NO on the right.

## STEP 2 — READ EACH TICK'S COLUMN POSITION

For every row with a tick/checkmark:
- Determine the x-position of the tick relative to the column headers identified in Step 1.
- If the tick falls under or nearest to the YES/PASS column → value is "pass".
- If the tick falls under or nearest to the NO/FAIL column → value is "fail".
- A TICK IN THE NO/FAIL COLUMN MEANS FAIL — it is not a positive result just because it is a tick.
- A handwritten "NO", circled "NO", or a cross "X" always means "fail".

## STEP 3 — DO NOT DEFAULT TO "pass"

- If you cannot clearly determine which column a mark is in, OMIT the field entirely.
- NEVER assume "pass" when uncertain. An omitted field is safer than a wrong "pass".

## SPECIFIC KNOWN CASES ON BS9990 DRY RISER FORMS:
- "Is the Breeching Inlet in good condition?" — a tick in the NO column = "fail". Do not return "pass" for this field unless the tick is unambiguously in the YES column.
- "Is the system in good working order?" — same column rules apply.
- Section summary rows (e.g. "External equipment:", "Internal equipment:") follow the same YES/NO column structure.

## GENERAL OUTPUT RULES:
- Return ONLY a JSON object with two top-level keys: "header" and "fields"
- "header" must contain these keys (use empty string if not found):
  - "customer": the customer or client name
  - "site": the site name and/or address
  - "date": the date on the form
  - "po_ref": the PO number, reference number, or job reference
  - "riser_location": the riser location if present
- "fields" must be a JSON object with field IDs as keys and extracted values
- For pass_fail fields: value must be exactly "pass", "fail", or "n/a"
- For checkbox fields: value must be exactly true or false
- For text/number fields: transcribe handwritten text as accurately as possible
- If a field is blank or unreadable, omit it
- Do not include any explanation — only the JSON object`;

    const userPrompt = `These are ${images.length} photo(s) of a filled-in "${template_name}" job sheet form.

IMPORTANT: Before extracting values, study the column headers carefully to understand which column means YES/PASS and which means NO/FAIL.

Extract the header information (Customer, Site/Address, Date, PO/REF, Riser Location) from the top of the form.

Then extract the handwritten values for these template fields:
${fieldList}

Return a JSON object with "header" and "fields" keys.`;

    // Build content parts — one text prompt followed by all images
    const userContentParts: any[] = [{ type: "text", text: userPrompt }];
    for (const img of images) {
      userContentParts.push({
        type: "image_url",
        image_url: { url: `data:${img.mime_type || "image/jpeg"};base64,${img.image_base64}` },
      });
    }

    // Use gemini-2.5-pro as primary for best vision accuracy, fall back to flash then gpt
    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash", "openai/gpt-5-mini"];
    let response: Response | null = null;
    for (const model of models) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContentParts },
          ],
        }),
      });
      if (response.ok) break;
      const status = response.status;
      if (status === 429 || status === 402) break; // don't retry rate/payment errors
      console.warn(`Model ${model} failed with ${status}, trying next...`);
    }

    if (!response || !response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    // Robust JSON extraction from AI response
    let parsed: any = {};
    try {
      // Strip markdown code blocks
      let cleaned = content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      // Find JSON boundaries
      const jsonStart = cleaned.search(/[\{\[]/);
      const jsonEnd = cleaned.lastIndexOf(jsonStart !== -1 && cleaned[jsonStart] === '[' ? ']' : '}');

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No JSON object found in response");
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Fix common issues: trailing commas, control characters
        cleaned = cleaned
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, "");
        parsed = JSON.parse(cleaned);
      }
    } catch (parseErr) {
      console.error("Failed to parse AI response as JSON:", content);
      return new Response(JSON.stringify({ error: "Could not parse handwriting", raw: content }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Support both old format (flat fields) and new format (header + fields)
    const extracted = parsed.fields || parsed;
    const header = parsed.header || {};

    return new Response(JSON.stringify({ extracted, header }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ocr-job-sheet error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
