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

    // Accept images and PDFs
    images = images.filter((img) => {
      const mime = img.mime_type || "image/jpeg";
      return mime.startsWith("image/") || mime === "application/pdf";
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
          description: `"${f.label}" — numeric value from the form. CRITICAL: If this field is blank, empty, or not filled in on the form, do NOT include it in the response at all. Only return a number if a value is clearly written on the form.`,
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
          description: `"${f.label}" — transcribe the handwritten text exactly, character by character. Pay close attention to technical terms, part numbers, and specifications (e.g. "PN16", "DN80", "bar" values). Do not guess or substitute — if a character could be a letter or number, look at the full word context. For example "PN16" is a pipe standard — a P followed by N followed by 1 followed by 6.`,
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
                customer: { type: "string", description: "The company or organisation name written next to the 'Customer:' label on the form. This is always a company name (e.g. 'TA Safely Comply'). NEVER return an email address here." },
                site: { type: "string", description: "Site name and/or address" },
                date: { type: "string", description: "Date on the form" },
                po_ref: { type: "string", description: "PO number, reference number, or job reference" },
                riser_location: { type: "string", description: "Riser location — look for 'Riser Location:', 'Location:', 'Address:' fields at the top of the form or in the header section. Always extract this if present." },
                engineer: { type: "string", description: "Engineer name if present on the form" },
                customer_signed_name: { type: "string", description: "The PRINTED or handwritten name of the customer written at the bottom of the form in the signature section, typically below a handwritten signature and next to or under 'Customer:' or 'Signature:' labels at the foot of the page. This is a person's name (e.g. 'Calvin', 'John Smith'). ONLY extract if a name is clearly written in the signature block at the bottom. Do NOT confuse with the company name in the header." },
                customer_sign_date: { type: "string", description: "The date written in the customer/signature section at the bottom of the form, next to a 'Date:' label in the signature block. May differ from the inspection date at the top." },
                customer_signature_bbox: {
                  type: "object",
                  description: "Bounding box of the customer's HANDWRITTEN SIGNATURE (the ink scrawl/mark, NOT the printed name). Coordinates are percentages (0-100) of the image dimensions. Only include if a visible handwritten signature mark exists.",
                  properties: {
                    x_min: { type: "number", description: "Left edge as percentage (0-100) of image width" },
                    y_min: { type: "number", description: "Top edge as percentage (0-100) of image height" },
                    x_max: { type: "number", description: "Right edge as percentage (0-100) of image width" },
                    y_max: { type: "number", description: "Bottom edge as percentage (0-100) of image height" },
                    page_index: { type: "number", description: "Which image contains this signature (0-indexed). Use 0 for the first/only image." },
                  },
                },
                engineer_signature_bbox: {
                  type: "object",
                  description: "Bounding box of the engineer/technician's HANDWRITTEN SIGNATURE (the ink scrawl/mark). Coordinates are percentages (0-100) of the image dimensions. Only include if a visible handwritten signature mark exists.",
                  properties: {
                    x_min: { type: "number", description: "Left edge as percentage (0-100) of image width" },
                    y_min: { type: "number", description: "Top edge as percentage (0-100) of image height" },
                    x_max: { type: "number", description: "Right edge as percentage (0-100) of image width" },
                    y_max: { type: "number", description: "Bottom edge as percentage (0-100) of image height" },
                    page_index: { type: "number", description: "Which image contains this signature (0-indexed). Use 0 for the first/only image." },
                  },
                },
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

    const systemPrompt = `You are an expert OCR assistant. Your ONLY job is to extract data from the handwritten form in the image(s). Do NOT invent, guess, or fill values from external knowledge. ONLY transcribe what is physically written or marked on the form.

⚠️ TEMPLATE NAME WARNING: You will be told the template name for reference only. The template name (e.g. "Field Report", "Dry Riser Inspection") is NEVER a valid value for any field. Do NOT copy it into any field. It is metadata, not form data.

HEADER EXTRACTION — The header table at the top has these printed labels. Copy ONLY the handwritten/typed value written next to each label:
  • "Customer:" → the company/organisation name HANDWRITTEN on the same line. It is always a company name (e.g. "TA Safely Comply"). NEVER use the template name, document title, email, or username here. If blank, omit.
  • "Site:" → the site or building name written on the same line
  • "Riser Location:" → the text written after "Riser Location:" (e.g. "Starwell")
  • "DATE:" → the date written in the top-right area
  • "PO/REF:" → the reference number written next to PO/REF

SIGNATURE BLOCK EXTRACTION — At the BOTTOM of the form there is usually a signature section with two columns: one for the Technician and one for the Customer. Each column has:
  • A "Date:" line — extract the date written there into customer_sign_date
  • A "Customer:" or "Name:" line (or space below the signature) — a person's handwritten name (e.g. "Calvin", "John Smith") — extract into customer_signed_name
  • A handwritten signature mark (the ink scrawl) — for this, return its BOUNDING BOX coordinates as percentages (0-100) of the image width and height. Include the page_index (0-indexed) if multiple images.
    - customer_signature_bbox: the bounding box around the customer's handwritten signature mark
    - engineer_signature_bbox: the bounding box around the engineer/technician's handwritten signature mark
  • Add ~5% padding around each signature to avoid cropping too tight.
  IMPORTANT: customer_signed_name is a PERSON'S NAME, NOT a company name. It belongs to the person who physically signed the form at the bottom. It may be printed clearly below the signature.

CRITICAL — For ALL fields (header and body): ONLY return values that are physically handwritten or typed by a human on the paper form. The following are NEVER valid field values:
  - The template name or document title
  - Any pre-printed label text
  - Any field ID or field label
  - Any value you infer from context without seeing it written on the form
  If a field is blank or not filled in, omit it entirely from the response.

YES / NO CHECKBOXES — Each inspection row has two boxes labelled YES and NO.
  The engineer placed a tick (✓) inside or next to ONE box.
  • Tick inside/next to the YES box → return "pass"
  • Tick inside/next to the NO box  → return "fail"
  CRITICAL: The tick mark itself means nothing — what matters is WHICH LABEL (YES or NO) the tick is physically beside. A tick beside NO = "fail".

P / F / N/A CHECKBOXES — Used for "External equipment:", "Internal equipment:", and "Pressure test result:".
  Each has three options: P   F   N/A
  • Tick beside P   → "pass"
  • Tick beside F   → "fail"   ← F = FAIL. A tick beside F must return "fail".
  • Tick beside N/A → "n/a"

SECTION SEPARATION — The form has two distinct equipment sections. Extract them independently:
  1. EXTERNAL EQUIPMENT section — rows about Breeching Inlet, cabinet keys, signs, etc.
     The overall result for this section is labelled "External equipment:" with P / F / N/A boxes.
  2. INTERNAL EQUIPMENT section — rows about landing valves, outlet cabinets, washers, etc.
     The overall result for this section is labelled "Internal equipment:" with P / F / N/A boxes.
  Do NOT mix results from one section into the other.

PRESSURE TEST RESULTS — Near the bottom is a row: "Pressure test result:  P   F   N/A"
  Find which of P, F, or N/A has the tick and return that. Ignore the word "pass" appearing in field IDs.
  ALSO look for "Test Pressure (bar):" and "Hold Time (minutes):" fields — extract the numeric values written there.
  Per BS 9990:2015, the standard test is 12 bar for 15 minutes. If the values written match this standard, extract them as numbers (12 and 15).
  For "Leaks Detected?" look for Yes or No ticked/circled.

Use the extract_job_sheet tool to return all findings.`;

    const userContentParts: any[] = [
      {
        type: "text",
        text: `Extract data from this handwritten form. The template name is "${template_name}" — this is for your reference ONLY and must NEVER appear as a value in any extracted field.

RULES:
- Every field value must come from handwriting or typed text physically present on the paper form.
- If a field is blank on the form, omit it. Do not guess or default.
- "Customer" = the company name handwritten next to the "Customer:" label — never the template name.
- For YES/NO rows: tick beside YES = "pass", tick beside NO = "fail".
- For P/F/N/A rows: tick beside F = "fail", tick beside P = "pass".`,
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
