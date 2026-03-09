import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    let images: { image_base64: string; mime_type?: string }[] = [];
    if (body.images && Array.isArray(body.images)) {
      images = body.images;
    } else if (body.image_base64) {
      images = [{ image_base64: body.image_base64, mime_type: body.mime_type }];
    }

    const { template_name, fields } = body;

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

    // Build tool call schema from fields
    const fieldProperties: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === "pass_fail") {
        fieldProperties[f.id] = {
          type: "string",
          enum: ["pass", "fail", "n/a"],
          description: `"${f.label}" — Look at where the mark/tick is relative to the column headers. YES/PASS column = "pass". NO/FAIL column = "fail". If unreadable, omit this field.`,
        };
      } else if (f.type === "checkbox") {
        fieldProperties[f.id] = {
          type: "boolean",
          description: `"${f.label}" — true if ticked/checked, false if crossed, empty or marked NO.`,
        };
      } else if (f.type === "number") {
        fieldProperties[f.id] = {
          type: "number",
          description: `"${f.label}" — numeric value from the form.`,
        };
      } else if (f.type === "select" && f.options?.length) {
        fieldProperties[f.id] = {
          type: "string",
          enum: f.options,
          description: `"${f.label}" — pick the closest matching option from the form.`,
        };
      } else {
        fieldProperties[f.id] = {
          type: "string",
          description: `"${f.label}" — transcribe the handwritten text exactly.`,
        };
      }
    }

    const extractionTool = {
      type: "function",
      function: {
        name: "extract_job_sheet",
        description: "Extract all fields and header information from the job sheet photo(s).",
        parameters: {
          type: "object",
          properties: {
            header: {
              type: "object",
              description: "Header information from the top of the form.",
              properties: {
                customer: { type: "string", description: "Customer or client name" },
                site: { type: "string", description: "Site name and/or address" },
                date: { type: "string", description: "Date on the form" },
                po_ref: { type: "string", description: "PO number, reference number, or job reference" },
                riser_location: { type: "string", description: "Riser location if present" },
              },
              required: [],
            },
            fields: {
              type: "object",
              description: "Extracted field values keyed by field ID.",
              properties: fieldProperties,
              required: [],
            },
          },
          required: ["header", "fields"],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `You are an expert at reading handwritten fire safety inspection forms, including BS9990 dry riser service sheets.

KEY RULE FOR PASS/FAIL FIELDS ON BS9990 FORMS:
These forms have two result columns per row — YES on the left, NO on the right (or PASS/FAIL).
- A tick/checkmark in the YES column means the answer is YES → value = "pass"
- A tick/checkmark in the NO column means the answer is NO → value = "fail"
- A tick is NOT automatically a positive result. Its column position determines the value.
- Before assigning any pass_fail value, look at the column headers at the top of the section to confirm which side is YES and which is NO.
- A handwritten "NO", circled "NO", or a cross (X) always = "fail".
- If you cannot confidently determine the column, omit the field entirely — do NOT guess "pass".

Use the extract_job_sheet tool to return your findings.`;

    const userContentParts: any[] = [
      {
        type: "text",
        text: `These are ${images.length} photo(s) of a filled-in "${template_name}" job sheet. Extract all visible header information and field values. For every pass/fail field, carefully identify which column (YES or NO) the tick is in before deciding the value.`,
      },
    ];
    for (const img of images) {
      userContentParts.push({
        type: "image_url",
        image_url: { url: `data:${img.mime_type || "image/jpeg"};base64,${img.image_base64}` },
      });
    }

    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash", "openai/gpt-5-mini"];
    let aiResponse: Response | null = null;
    for (const model of models) {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          tools: [extractionTool],
          tool_choice: { type: "function", function: { name: "extract_job_sheet" } },
        }),
      });
      if (aiResponse.ok) break;
      const status = aiResponse.status;
      if (status === 429 || status === 402) break;
      console.warn(`Model ${model} failed with ${status}, trying next...`);
    }

    if (!aiResponse || !aiResponse.ok) {
      const status = aiResponse!.status;
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
      const text = await aiResponse!.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await aiResponse.json();

    // Extract from tool call response
    let extracted: any = {};
    let header: any = {};

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        extracted = parsed.fields || {};
        header = parsed.header || {};
      } catch (e) {
        console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
        return new Response(JSON.stringify({ error: "Could not parse handwriting", raw: toolCall.function.arguments }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Fallback: try to parse content as JSON (older model responses)
      const content = result.choices?.[0]?.message?.content || "";
      try {
        let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const jsonStart = cleaned.search(/[\{\[]/);
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(cleaned);
          extracted = parsed.fields || parsed;
          header = parsed.header || {};
        }
      } catch {
        console.error("Failed to parse AI response as JSON:", content);
        return new Response(JSON.stringify({ error: "Could not parse handwriting", raw: content }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
