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
          description: `"${f.label}" — Look at the LABEL of the box/column the tick is in. If the label is YES or P or PASS → return "pass". If the label is NO or F or FAIL → return "fail". WARNING: The word "pass" in this field name does NOT mean the answer is pass — read the form. For the Pressure Test Result row specifically, look for a tick next to P (pass) or F (fail): a tick next to F = "fail". If unclear, omit.`,
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
                riser_location: { type: "string", description: "Riser location — look for 'Riser Location:', 'Location:', 'Address:' fields at the top of the form or in the header section. Always extract this if present." },
                engineer: { type: "string", description: "Engineer name if present on the form" },
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

    const systemPrompt = `You are an expert OCR assistant reading a handwritten BS9990 Dry Riser Pressure Test form.

RULE 1 — HEADER: Read the printed labels and copy the handwritten values next to them:
  "Customer:" "Site:" "Riser Location:" "DATE:" "PO/REF:"

RULE 2 — YES/NO CHECKBOXES: Each inspection row has two boxes: [ ] YES  [ ] NO
  The engineer ticked ONE of them. Read which word is next to the tick.
  tick next to YES → "pass"
  tick next to NO  → "fail"
  Important: A tick (✓) does NOT automatically mean pass. A tick next to NO means the answer is NO = fail.

RULE 3 — P / F / N/A CHECKBOXES (used for overall equipment results and pressure test):
  tick next to P → "pass"
  tick next to F → "fail"    ← F means FAIL. A tick next to F = fail.
  tick next to N/A → "n/a"

RULE 4 — PRESSURE TEST RESULT row: Find "Pressure test result:" near the bottom.
  It has three boxes: P    F    N/A
  Look carefully — which box has the tick? If tick is by F → return "fail". If by P → return "pass".
  Do NOT be influenced by the word "pass" in any field name — read the actual form.

RULE 5 — Keep EXTERNAL EQUIPMENT and INTERNAL EQUIPMENT sections separate.

Use the extract_job_sheet tool to return your findings.`;

    const userContentParts: any[] = [
      {
        type: "text",
        text: `Read this "${template_name}" job sheet photo carefully.

For each checkbox row: find the tick mark and read the label next to it.
  - Tick next to YES → "pass"
  - Tick next to NO → "fail"
  - Tick next to P → "pass"
  - Tick next to F → "fail"  (F means FAIL, not pass)

For the Pressure Test Result row near the bottom: look at the P / F / N/A boxes — which one is ticked? If F is ticked, return "fail".

Extract header: Customer, Site, Riser Location, Date, PO/REF.`,
      },
    ];
    for (const img of images) {
      userContentParts.push({
        type: "image_url",
        image_url: { url: `data:${img.mime_type || "image/jpeg"};base64,${img.image_base64}` },
      });
    }

    // Use gemini-2.5-pro only — best vision model for handwritten form analysis
    // Only fall back on rate limit errors, not on quality failures
    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
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
