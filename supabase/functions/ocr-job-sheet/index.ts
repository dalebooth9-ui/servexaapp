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
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
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
        const isPressureTestField = f.id.includes("pressure_test") || f.label.toLowerCase().includes("pressure test");
        const extraInstruction = isPressureTestField
          ? ` CRITICAL: This is the overall pressure test result. There MUST be a tick next to either P (pass), F (fail), or N/A on the form. Look carefully in the "Pressure Test Results" section. If P is ticked → "pass". If F is ticked → "fail". You MUST return a value for this field — do not omit it.`
          : "";
        fieldProperties[f.id] = {
          type: "string",
          enum: ["pass", "fail", "n/a"],
          description: `"${f.label}" — Look at the LABEL of the box/column the tick is in. If the label is YES or P or PASS → return "pass". If the label is NO or F or FAIL → return "fail". WARNING: The word "pass" in this field name does NOT mean the answer is pass — read the form. For the Pressure Test Result row specifically, look for a tick next to P (pass) or F (fail): a tick next to F = "fail".${extraInstruction}`,
        };
      } else if (f.type === "checkbox") {
        const isDrainField = f.label.toLowerCase().includes("drain") || f.label.toLowerCase().includes("drop leg");
        const extraNote = isDrainField
          ? ` IMPORTANT: This field defaults to YES if left blank on the handwritten sheet. Only return false if there is a clear NO mark, cross, or explicit negative marking. If the item is unmarked or blank, OMIT this field from the response entirely so the app keeps the default YES.`
          : "";
        fieldProperties[f.id] = {
          type: "boolean",
          description: `"${f.label}" — true if ticked/checked or marked YES, false only if clearly crossed or marked NO. If blank or unmarked, do NOT include this field in the response at all.${extraNote}`,
        };
      } else if (f.type === "number") {
        fieldProperties[f.id] = {
          type: "number",
          description: `"${f.label}" — numeric value from the form. CRITICAL: If this field is blank, empty, or not filled in on the form, do NOT include it in the response at all. Only return a number if a value is clearly written on the form.`,
        };
      } else if (f.type === "select" && f.options?.length) {
        fieldProperties[f.id] = {
          type: "string",
          description: `"${f.label}" — pick the closest matching option from the form: ${f.options.join(", ")}. IMPORTANT: If the handwritten text says something clearly different from these options (e.g. "NOT VISIBLE", "NOT INSTALLED", "NOT ACCESSIBLE", "N/A – EXPOSED INLET", "YES - EXPOSED OUTLETS"), transcribe that FULL text exactly as written instead of forcing it into one of the options. Include any annotation after the main answer (e.g. "N/A – EXPOSED INLET" not just "N/A").`,
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
                customer: { type: "string", description: "The company or organisation name written next to the 'Customer:' label IN THE HEADER TABLE at the TOP of the form (first few rows). This is always a company/organisation name (e.g. 'ATC', 'TA Safely Comply'). CRITICAL: Do NOT confuse this with the customer's PERSON name written in the SIGNATURE BLOCK at the BOTTOM of the page. The header Customer is a COMPANY, the signature Customer is a PERSON. If the header Customer field is blank, omit it entirely — do NOT copy the person's name from the bottom signature section." },
                site: { type: "string", description: "Site address written next to the 'Site:' label in the header. Read the postcode VERY carefully character by character — common misreads: 0 vs O, 6 vs G, 8 vs B, 9 vs Q, N vs H. UK postcodes follow patterns like 'OL6 8NQ', 'M1 1AA'. Double-check each character." },
                date: { type: "string", description: "Date on the form" },
                po_ref: { type: "string", description: "PO number, reference number, or job reference" },
                riser_location: { type: "string", description: "Riser location — look for 'Riser Location:', 'Location:', 'Address:' fields at the top of the form or in the header section. Always extract this if present." },
                engineer: { type: "string", description: "Engineer name if present on the form" },
                customer_signed_name: { type: "string", description: "The PRINTED or handwritten name of the customer written at the bottom of the form in the signature section, typically below a handwritten signature and next to or under 'Customer:' or 'Signature:' labels at the foot of the page. This is a person's name (e.g. 'Calvin', 'John Smith'). ONLY extract if a name is clearly written in the signature block at the bottom. Do NOT confuse with the company name in the header. HANDWRITING WARNING: Common misreads for initials — 'L' is often misread as 'P', 'I', or 'T'. Look carefully at the stroke shape: 'L' has a horizontal base stroke, 'P' has a closed loop at the top. If the letter has a flat horizontal foot → it is 'L'. Also watch for 'C' vs 'G', 'B' vs 'D', 'M' vs 'N'." },
                customer_sign_date: { type: "string", description: "The date written in the customer/signature section at the bottom of the form, next to a 'Date:' label in the signature block. May differ from the inspection date at the top." },
                customer_signature_bbox: {
                  type: "object",
                  description: "Bounding box of the customer's FULL HANDWRITTEN SIGNATURE (the ink scrawl/mark, NOT the printed name, and NEVER a logo, watermark, border, stamp, coloured curve, or any other pre-printed graphic). The box must cover the ENTIRE signature from the far-left stroke to the far-right stroke and full top-to-bottom height. IMPORTANT: Add at least 10% padding on ALL sides to ensure no strokes are cropped. Signatures are often wider and taller than they appear at first glance — err on the side of a LARGER box. Coordinates are percentages (0-100) of the image dimensions. Only include if a visible handwritten signature mark exists.",
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
                  description: "Bounding box of the engineer/technician's FULL HANDWRITTEN SIGNATURE (the ink scrawl/mark, NEVER a logo, watermark, border, stamp, coloured curve, or any other pre-printed graphic). The box must cover the ENTIRE signature from first stroke to last stroke. IMPORTANT: Add at least 10% padding on ALL sides to ensure no strokes are cropped. Err on the side of a LARGER box. Coordinates are percentages (0-100) of the image dimensions. Only include if a visible handwritten signature mark exists.",
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

HEADER EXTRACTION — The header table at the TOP of the form (first few rows, above the inspection checklist) has these printed labels. Copy ONLY the handwritten/typed value written next to each label:
  • "Customer:" → the COMPANY or ORGANISATION name handwritten on the same line IN THE HEADER. This is NEVER a person's name. Examples: "ATC", "TA Safely Comply", "Kier Group". CRITICAL: There is also a "Customer:" label at the BOTTOM in the signature block — that one contains a PERSON'S name (e.g. "P. Callaghan"). Do NOT confuse the two. Only extract the COMPANY name from the TOP header here. If the header Customer field is blank, omit.
  • "Site:" → the site address written on the same line. Read postcodes character by character (e.g. OL6 8NQ not OL6 9NG). Common misreads: 0↔O, 6↔G, 8↔B, 9↔Q, N↔H.
  • "Riser Location:" → the text written after "Riser Location:" (e.g. "Starwell")
  • "DATE:" → the date written in the top-right area
  • "PO/REF:" → the reference number written next to PO/REF

SIGNATURE BLOCK EXTRACTION — At the BOTTOM of the form there is usually a signature section with two columns: one for the Technician and one for the Customer. Each column has:
  • A "Date:" line — extract the date written there into customer_sign_date
  • A "Customer:" or "Name:" line (or space below the signature) — a person's handwritten name (e.g. "Calvin", "John Smith") — extract into customer_signed_name
  • A handwritten signature mark (the ink scrawl) — for this, return its BOUNDING BOX coordinates as percentages (0-100) of the image width and height. Include the page_index (0-indexed) if multiple images.
    - customer_signature_bbox: the bounding box around the customer's handwritten signature mark
    - engineer_signature_bbox: the bounding box around the engineer/technician's handwritten signature mark
   • The signature box must contain the FULL signature, not just the darkest flourish or one end of it. Signatures often have wide, sweeping strokes — include ALL of them.
   • Ignore any pre-printed graphics entirely: logos, coloured arcs, watermarks, borders, boxes, stamps, ruled lines, and decorative marks are NEVER signatures.
   • Add at least 10% padding around each signature to avoid cropping too tight. A box that is slightly too large is MUCH better than one that clips any part of the signature.
  IMPORTANT: customer_signed_name is a PERSON'S NAME, NOT a company name. It belongs to the person who physically signed the form at the bottom. It may be printed clearly below the signature.

CRITICAL — For ALL fields (header and body): ONLY return values that are physically handwritten or typed by a human on the paper form. The following are NEVER valid field values:
  - The template name or document title
  - Any pre-printed label text
  - Any field ID or field label
  - Any value you infer from context without seeing it written on the form
  If a field is blank or not filled in, omit it entirely from the response.

YES / NO CHECKBOXES — Each inspection row has two columns: YES and NO. The engineer places a tick (✓) or circle inside ONE column.
  • Tick/circle around YES → return "Yes"
  • Tick/circle around NO  → return "No"
  CRITICAL: The tick mark itself means nothing — what matters is WHICH COLUMN (YES or NO) the tick is physically in.
  
  HOWEVER: Some rows do NOT have a simple YES/NO tick. Instead, the engineer has written descriptive text in the answer area, such as:
  • "N/A – EXPOSED INLET" — means the item is not applicable because the inlet is exposed (no cabinet/glass). Return the FULL text "N/A – EXPOSED INLET".
  • "YES - EXPOSED OUTLETS" — means YES but with a note. Return "YES - EXPOSED OUTLETS".
  • "NOT VISIBLE" — means the item could not be inspected. Return "NOT VISIBLE".
  • "NOT INSTALLED" — return "NOT INSTALLED".
  • "NOT ACCESSIBLE" — return "NOT ACCESSIBLE".
  If ANY handwritten text appears beyond the YES/NO columns (to the right, or written across the answer area), you MUST capture that full text. Do NOT reduce it to just "Yes" or "No".

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

TEXT FIELDS — Transcribe handwriting exactly. Technical codes like "PN16", "DN80", part numbers, and pressure values must be read character by character. "PN16" = P-N-1-6, a pipe pressure rating standard.

ANNOTATION & DESCRIPTIVE TEXT — CRITICAL: Many fields on fire safety forms have handwritten annotations BESIDE or INSTEAD OF the standard YES/NO answer. Common patterns:
  • "N/A – EXPOSED INLET" next to glass or cabinet questions (meaning no glass/cabinet exists because the inlet is exposed)
  • "YES - EXPOSED OUTLETS" next to padlock questions (meaning yes but outlets are exposed, no cabinets)
  • "NOT VISIBLE" next to air release valve questions (meaning the valve cannot be seen/accessed)
  You MUST return the FULL annotation text, not just "Yes", "No", or "N/A". The annotation provides critical compliance context.
  
   IMPORTANT: If "NOT VISIBLE" is written next to an air release valve row, return "NOT VISIBLE" for THAT field — do NOT put it in the comments field. Each annotation belongs to the row it is written next to on the form.

COMMENTS / NOTES FIELD — The "Additional Notes / Comments" or "Comments" field should ONLY contain freeform remarks that do NOT belong to any specific inspection row. If you see text like "CABINET KEYS: BIRD" or "NO OF OUTLETS: 5" written on the form, these belong to their SPECIFIC template fields (e.g. "Cabinet Keys" field, "Number of Outlets" field). Do NOT dump structured data into the comments field. Only truly miscellaneous notes that have no matching field should go in comments.

Use the extract_job_sheet tool to return all findings.`;

    const userContentParts: any[] = [
      {
        type: "text",
        text: `Extract data from this handwritten form. The template name is "${template_name}" — this is for your reference ONLY and must NEVER appear as a value in any extracted field.

RULES:
- Every field value must come from handwriting or typed text physically present on the paper form.
- If a field is blank on the form, omit it. Do not guess or default.
- "Customer" = the company name handwritten next to the "Customer:" label — never the template name.
- For signature boxes: capture the full handwritten signature only, and never select logos, coloured curves, watermarks, ruled lines, or other printed artwork.
- For YES/NO rows: tick beside YES = "pass", tick beside NO = "fail".
- For P/F/N/A rows: tick beside F = "fail", tick beside P = "pass".`,
      },
    ];
    for (const img of images) {
      userContentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mime_type || "image/jpeg"};base64,${img.image_base64}`,
          detail: "high",
        },
      });
    }

    const parseStructuredJson = (raw: string) => {
      let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      if (!cleaned) throw new Error("AI returned empty structured output");

      const jsonStart = cleaned.search(/[\{\[]/);
      if (jsonStart === -1) throw new Error("AI returned no JSON object");

      const openingChar = cleaned[jsonStart];
      const closingChar = openingChar === "[" ? "]" : "}";
      const jsonEnd = cleaned.lastIndexOf(closingChar);
      if (jsonEnd === -1 || jsonEnd < jsonStart) throw new Error("AI returned incomplete JSON");

      cleaned = cleaned
        .substring(jsonStart, jsonEnd + 1)
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[\x00-\x1F\x7F]/g, "");

      return JSON.parse(cleaned);
    };

    const hasMeaningfulValues = (record: Record<string, any> = {}) =>
      Object.values(record).some((value) => value !== undefined && value !== null && value !== "");

    const extractStructuredPayload = (result: any) => {
      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments?.trim()) {
        const parsed = parseStructuredJson(toolCall.function.arguments);
        return {
          extracted: parsed.fields || {},
          header: parsed.header || {},
        };
      }

      const content = typeof result.choices?.[0]?.message?.content === "string"
        ? result.choices?.[0]?.message?.content
        : "";

      if (content.trim()) {
        const parsed = parseStructuredJson(content);
        return {
          extracted: parsed.fields || parsed,
          header: parsed.header || {},
        };
      }

      throw new Error("AI returned no structured output");
    };

    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
    let lastStructuredError = "AI could not extract structured data from this sheet";
    let bestExtraction: { extracted: Record<string, any>; header: Record<string, any> } | null = null;

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            temperature: 0.1,
            reasoning: { effort: "medium" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContentParts },
            ],
            tools: [extractionTool],
            tool_choice: { type: "function", function: { name: "extract_job_sheet" } },
          }),
        });

        if (!aiResponse.ok) {
          const status = aiResponse.status;
          const text = await aiResponse.text();

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

          lastStructuredError = `AI gateway error (${status})`;
          console.warn(`Model ${model} attempt ${attempt + 1} failed with ${status}: ${text.substring(0, 300)}`);
          continue;
        }

        const responseText = await aiResponse.text();
        if (!responseText || responseText.trim().length === 0) {
          lastStructuredError = "AI returned empty response, please retry";
          console.warn(`Model ${model} attempt ${attempt + 1} returned an empty response body`);
          continue;
        }

        let result: any;
        try {
          result = JSON.parse(responseText);
        } catch {
          lastStructuredError = "AI response was malformed, please retry";
          console.error("Failed to parse AI response JSON:", responseText.substring(0, 500));
          continue;
        }

        const finishReason = result.choices?.[0]?.finish_reason ?? result.candidates?.[0]?.finishReason ?? "unknown";

        try {
          const { extracted, header } = extractStructuredPayload(result);
          if (!hasMeaningfulValues(extracted) && !hasMeaningfulValues(header)) {
            lastStructuredError = finishReason === "length" || finishReason === "MAX_TOKENS"
              ? "AI output was truncated, please retry"
              : "AI returned an empty extraction";
            console.warn(`Model ${model} attempt ${attempt + 1} returned empty structured output. finish_reason=${finishReason}`);
            continue;
          }

          bestExtraction = { extracted, header };
          console.log("OCR extracted header:", JSON.stringify(header));
          break;
        } catch (error) {
          lastStructuredError = error instanceof Error ? error.message : "Could not parse handwriting";
          console.warn(`Model ${model} attempt ${attempt + 1} could not produce structured output. finish_reason=${finishReason}. error=${lastStructuredError}`);
        }
      }
      if (bestExtraction) break;
    }

    if (bestExtraction) {
      return new Response(JSON.stringify({ extracted: bestExtraction.extracted, header: bestExtraction.header }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: lastStructuredError }), {
      status: 200,
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
