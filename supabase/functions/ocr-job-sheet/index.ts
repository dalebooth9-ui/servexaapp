import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Azure Document Intelligence helpers ──

async function analyzeWithAzure(
  imagePayloads: { image_base64: string; mime_type?: string }[],
  endpoint: string,
  apiKey: string,
): Promise<string> {
  // For multi-page, we send the first image (Azure accepts single document per call).
  // If multiple images, we call Azure for each and concatenate results.
  const allText: string[] = [];
  const allKvPairs: string[] = [];
  const allTables: string[] = [];

  for (let pageIdx = 0; pageIdx < imagePayloads.length; pageIdx++) {
    const img = imagePayloads[pageIdx];
    const mime = img.mime_type || "image/jpeg";
    const binaryData = Uint8Array.from(atob(img.image_base64), (c) => c.charCodeAt(0));

    // Submit analysis request
    const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30`;
    const submitResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": mime === "application/pdf" ? "application/pdf" : "application/octet-stream",
      },
      body: binaryData,
    });

    if (!submitResponse.ok) {
      const errText = await submitResponse.text();
      throw new Error(`Azure submit failed (${submitResponse.status}): ${errText.substring(0, 300)}`);
    }

    // Get operation-location for polling
    const operationLocation = submitResponse.headers.get("operation-location");
    if (!operationLocation) {
      // Some responses return result directly
      const directResult = await submitResponse.json();
      allText.push(extractTextFromAzureResult(directResult, pageIdx));
      continue;
    }

    // Consume the submit response body
    await submitResponse.text();

    // Poll for result
    let analyzeResult: any = null;
    for (let poll = 0; poll < 30; poll++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollResponse = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
      });
      const pollData = await pollResponse.json();

      if (pollData.status === "succeeded") {
        analyzeResult = pollData.analyzeResult || pollData;
        break;
      } else if (pollData.status === "failed") {
        throw new Error(`Azure analysis failed: ${JSON.stringify(pollData.error || pollData).substring(0, 300)}`);
      }
      // else "running" — continue polling
    }

    if (!analyzeResult) throw new Error("Azure analysis timed out after 60 seconds");

    // Extract structured data
    const pageLabel = imagePayloads.length > 1 ? `[Page ${pageIdx + 1}] ` : "";

    // 1. Key-value pairs (critical for form fields)
    if (analyzeResult.keyValuePairs && analyzeResult.keyValuePairs.length > 0) {
      for (const kvp of analyzeResult.keyValuePairs) {
        const key = kvp.key?.content?.trim() || "";
        const value = kvp.value?.content?.trim() || "";
        if (key || value) {
          allKvPairs.push(`${pageLabel}${key}: ${value}`);
        }
      }
    }

    // 2. Tables
    if (analyzeResult.tables && analyzeResult.tables.length > 0) {
      for (const table of analyzeResult.tables) {
        const tableRows: Record<number, Record<number, string>> = {};
        for (const cell of table.cells || []) {
          if (!tableRows[cell.rowIndex]) tableRows[cell.rowIndex] = {};
          tableRows[cell.rowIndex][cell.columnIndex] = cell.content || "";
        }
        const rowKeys = Object.keys(tableRows).map(Number).sort((a, b) => a - b);
        const tableLines: string[] = [];
        for (const rowIdx of rowKeys) {
          const cols = tableRows[rowIdx];
          const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
          tableLines.push(colKeys.map((c) => cols[c]).join(" | "));
        }
        allTables.push(`${pageLabel}TABLE:\n${tableLines.join("\n")}`);
      }
    }

    // 3. Full text content (paragraphs / lines)
    if (analyzeResult.content) {
      allText.push(`${pageLabel}${analyzeResult.content}`);
    } else if (analyzeResult.paragraphs) {
      const paras = analyzeResult.paragraphs.map((p: any) => p.content).join("\n");
      allText.push(`${pageLabel}${paras}`);
    }
  }

  // Compose structured extraction document for GPT
  const sections: string[] = [];
  if (allKvPairs.length > 0) {
    sections.push("=== KEY-VALUE PAIRS ===\n" + allKvPairs.join("\n"));
  }
  if (allTables.length > 0) {
    sections.push("=== TABLES ===\n" + allTables.join("\n\n"));
  }
  if (allText.length > 0) {
    sections.push("=== FULL TEXT ===\n" + allText.join("\n\n"));
  }

  return sections.join("\n\n");
}

function extractTextFromAzureResult(result: any, _pageIdx: number): string {
  if (result.content) return result.content;
  if (result.paragraphs) return result.paragraphs.map((p: any) => p.content).join("\n");
  return "";
}

// ── Main handler ──

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

    // ── STAGE 1: Azure Document Intelligence (prebuilt-layout) ──
    const AZURE_ENDPOINT = Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
    const AZURE_KEY = Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_KEY");
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
      throw new Error("Azure Document Intelligence credentials are not configured");
    }

    console.log("Stage 1: Sending to Azure Document Intelligence prebuilt-layout...");
    const azureExtractedText = await analyzeWithAzure(images, AZURE_ENDPOINT.replace(/\/$/, ""), AZURE_KEY);
    console.log(`Stage 1 complete: Azure extracted ${azureExtractedText.length} characters`);

    // ── STAGE 2: GPT field mapping (text only, no images) ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build tool call schema from fields
    const fieldProperties: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === "pass_fail") {
        fieldProperties[f.id] = {
          type: "string",
          enum: ["pass", "fail", "n/a"],
          description: `"${f.label}" — If the extracted text shows YES/P/PASS → "pass". If NO/F/FAIL → "fail". If N/A → "n/a".`,
        };
      } else if (f.type === "checkbox") {
        fieldProperties[f.id] = {
          type: "boolean",
          description: `"${f.label}" — true if marked YES/ticked, false if NO. Omit if blank.`,
        };
      } else if (f.type === "number") {
        fieldProperties[f.id] = {
          type: "number",
          description: `"${f.label}" — numeric value. Omit if blank.`,
        };
      } else if (f.type === "select" && f.options?.length) {
        fieldProperties[f.id] = {
          type: "string",
          description: `"${f.label}" — pick the closest match: ${f.options.join(", ")}. If text differs significantly (e.g. "NOT VISIBLE", "N/A – EXPOSED INLET"), return the full text as-is.`,
        };
      } else {
        fieldProperties[f.id] = {
          type: "string",
          description: `"${f.label}" — transcribe the value exactly as extracted. Pay attention to each character for technical terms and names.`,
        };
      }
    }

    const extractionTool = {
      type: "function",
      function: {
        name: "extract_job_sheet",
        description: "Map the Azure-extracted text to the job sheet schema fields.",
        parameters: {
          type: "object",
          properties: {
            header: {
              type: "object",
              description: "Header information from the form.",
              properties: {
                customer: { type: "string", description: "The COMPANY/ORGANISATION name from the header 'Customer:' field at the TOP of the form. NOT a person's name from the signature block." },
                site: { type: "string", description: "Site address from the header. Read postcodes carefully: 0↔O, 6↔G, 8↔B, 9↔Q, N↔H." },
                date: { type: "string", description: "Date from the form header." },
                po_ref: { type: "string", description: "PO number or reference number." },
                riser_location: { type: "string", description: "Riser location if present." },
                engineer: { type: "string", description: "Engineer/technician name." },
                customer_signed_name: { type: "string", description: "Person's name from the SIGNATURE BLOCK at the bottom (not the company name). HANDWRITING: 'L' has a horizontal base with NO loop; 'P' has a closed loop at top. Prefer 'L' unless a closed loop is clearly visible." },
                customer_sign_date: { type: "string", description: "Date from the customer signature section at the bottom." },
                customer_signature_bbox: {
                  type: "object",
                  description: "If Azure extracted signature location info, provide approximate bounding box as percentages (0-100). Otherwise omit.",
                  properties: {
                    x_min: { type: "number" }, y_min: { type: "number" },
                    x_max: { type: "number" }, y_max: { type: "number" },
                    page_index: { type: "number" },
                  },
                },
                engineer_signature_bbox: {
                  type: "object",
                  description: "Engineer signature bounding box if available. Otherwise omit.",
                  properties: {
                    x_min: { type: "number" }, y_min: { type: "number" },
                    x_max: { type: "number" }, y_max: { type: "number" },
                    page_index: { type: "number" },
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

    const systemPrompt = `You are a data mapping assistant. You receive STRUCTURED TEXT that was extracted from a handwritten form by Azure Document Intelligence. Your job is to map the extracted key-value pairs, table data, and text to the correct schema fields.

IMPORTANT RULES:
1. You are working with PRE-EXTRACTED TEXT, not raw images. The OCR has already been done — you just need to map values to fields.
2. The template name "${template_name}" is for context only — NEVER use it as a field value.
3. Only map values that actually appear in the extracted text. If a field has no corresponding data, OMIT it entirely.
4. HEADER vs SIGNATURE BLOCK distinction:
   - "Customer:" in the HEADER area = a COMPANY name (e.g. "ATC", "Kier Group")
   - "Customer:" in the SIGNATURE BLOCK at the bottom = a PERSON's name (e.g. "Calvin", "L. Smith")
   - Look at the key-value pairs section — header fields appear first, signature fields appear later.
5. For YES/NO inspection rows: map to the appropriate pass/fail/checkbox value.
6. For P/F/N/A rows: P="pass", F="fail", N/A="n/a".
7. If descriptive text appears instead of a simple YES/NO (e.g. "N/A – EXPOSED INLET", "NOT VISIBLE"), return the FULL text.
8. For the "Additional Notes / Comments" field: ONLY include freeform remarks. Do NOT put structured data that belongs to other fields.
9. Character accuracy: The Azure OCR may still have ambiguities. For names, if a character could be L or P, prefer L unless a clear closed loop is visible in the text context. For postcodes, verify against UK patterns.

Use the extract_job_sheet tool to return all mapped data.`;

    const userPrompt = `Map the following Azure-extracted document text to the job sheet schema. The template is "${template_name}".

${azureExtractedText}`;

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
        return { extracted: parsed.fields || {}, header: parsed.header || {} };
      }
      const content = typeof result.choices?.[0]?.message?.content === "string"
        ? result.choices?.[0]?.message?.content : "";
      if (content.trim()) {
        const parsed = parseStructuredJson(content);
        return { extracted: parsed.fields || parsed, header: parsed.header || {} };
      }
      throw new Error("AI returned no structured output");
    };

    console.log("Stage 2: Sending extracted text to GPT for field mapping...");

    const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
    let lastStructuredError = "AI could not map the extracted data to fields";
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
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
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
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (status === 402) {
            return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          lastStructuredError = `AI gateway error (${status})`;
          console.warn(`Model ${model} attempt ${attempt + 1} failed with ${status}: ${text.substring(0, 300)}`);
          continue;
        }

        const responseText = await aiResponse.text();
        if (!responseText || responseText.trim().length === 0) {
          lastStructuredError = "AI returned empty response, please retry";
          console.warn(`Model ${model} attempt ${attempt + 1} returned empty response`);
          continue;
        }

        let result: any;
        try {
          result = JSON.parse(responseText);
        } catch {
          lastStructuredError = "AI response was malformed, please retry";
          console.error("Failed to parse AI response:", responseText.substring(0, 500));
          continue;
        }

        try {
          const { extracted, header } = extractStructuredPayload(result);
          if (!hasMeaningfulValues(extracted) && !hasMeaningfulValues(header)) {
            lastStructuredError = "AI returned an empty extraction";
            console.warn(`Model ${model} attempt ${attempt + 1} returned empty output`);
            continue;
          }
          bestExtraction = { extracted, header };
          console.log("Stage 2 complete. Header:", JSON.stringify(header));
          break;
        } catch (error) {
          lastStructuredError = error instanceof Error ? error.message : "Could not parse output";
          console.warn(`Model ${model} attempt ${attempt + 1} parse error: ${lastStructuredError}`);
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
