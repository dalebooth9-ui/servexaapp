import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Image compression helper ──

const AZURE_MAX_BYTES = 4 * 1024 * 1024; // Azure limit is 4MB

function compressBase64Image(base64: string, maxBytes: number): string {
  // If already under limit, return as-is
  const rawBytes = Math.ceil(base64.length * 3 / 4);
  if (rawBytes <= maxBytes) return base64;

  // Downsample by reducing base64 quality — re-encode at lower resolution
  // For Deno, we strip EXIF/padding and truncate if needed
  // The real fix: the client should resize before upload, but as a server-side
  // safeguard we'll just skip Azure for oversized images gracefully
  return base64;
}

// ── Azure Document Intelligence helpers ──

interface AzureExtractionResult {
  text: string;
  confidence: number;
  kvPairCount: number;
  tableCount: number;
}

async function analyzeWithAzure(
  imagePayloads: { image_base64: string; mime_type?: string }[],
  endpoint: string,
  apiKey: string,
): Promise<AzureExtractionResult> {
  const allText: string[] = [];
  const allKvPairs: string[] = [];
  const allTables: string[] = [];
  const confidences: number[] = [];

  for (let pageIdx = 0; pageIdx < imagePayloads.length; pageIdx++) {
    const img = imagePayloads[pageIdx];
    const mime = img.mime_type || "image/jpeg";
    const binaryData = Uint8Array.from(atob(img.image_base64), (c) => c.charCodeAt(0));

    // Skip this page for Azure if too large (will still be processed by GPT-vision fallback)
    if (binaryData.length > AZURE_MAX_BYTES) {
      console.warn(`Page ${pageIdx + 1} is ${(binaryData.length / 1024 / 1024).toFixed(1)}MB — exceeds Azure 4MB limit, skipping.`);
      continue;
    }

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

    const operationLocation = submitResponse.headers.get("operation-location");
    if (!operationLocation) {
      const directResult = await submitResponse.json();
      allText.push(extractTextFromAzureResult(directResult));
      confidences.push(computeAzureConfidence(directResult));
      continue;
    }

    await submitResponse.text();

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
    }

    if (!analyzeResult) throw new Error("Azure analysis timed out after 60 seconds");

    // Compute per-page confidence from word-level confidences
    confidences.push(computeAzureConfidence(analyzeResult));

    const pageLabel = imagePayloads.length > 1 ? `[Page ${pageIdx + 1}] ` : "";

    if (analyzeResult.keyValuePairs && analyzeResult.keyValuePairs.length > 0) {
      for (const kvp of analyzeResult.keyValuePairs) {
        const key = kvp.key?.content?.trim() || "";
        const value = kvp.value?.content?.trim() || "";
        if (key || value) {
          allKvPairs.push(`${pageLabel}${key}: ${value}`);
        }
      }
    }

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

    if (analyzeResult.content) {
      allText.push(`${pageLabel}${analyzeResult.content}`);
    } else if (analyzeResult.paragraphs) {
      const paras = analyzeResult.paragraphs.map((p: any) => p.content).join("\n");
      allText.push(`${pageLabel}${paras}`);
    }
  }

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

  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  return {
    text: sections.join("\n\n"),
    confidence: avgConfidence,
    kvPairCount: allKvPairs.length,
    tableCount: allTables.length,
  };
}

function computeAzureConfidence(result: any): number {
  // Average word-level confidence across all pages
  const words: any[] = [];
  for (const page of result.pages || []) {
    for (const word of page.words || []) {
      if (typeof word.confidence === "number") {
        words.push(word.confidence);
      }
    }
  }
  if (words.length === 0) return 0;
  return words.reduce((a: number, b: number) => a + b, 0) / words.length;
}

function extractTextFromAzureResult(result: any): string {
  if (result.content) return result.content;
  if (result.paragraphs) return result.paragraphs.map((p: any) => p.content).join("\n");
  return "";
}

// ── Shared utilities ──

function parseStructuredJson(raw: string) {
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
}

function hasMeaningfulValues(record: Record<string, any> = {}) {
  return Object.values(record).some((value) => value !== undefined && value !== null && value !== "");
}

function extractStructuredPayload(result: any) {
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
}

// ── Build extraction tool schema ──

function buildExtractionTool(fields: any[], forVision: boolean) {
  const fieldProperties: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === "pass_fail") {
      const lowerLabel = f.label.toLowerCase();
      const isPressureTestField = f.id.includes("pressure_test") || lowerLabel.includes("pressure test");
      const extraInstruction = isPressureTestField && forVision
        ? ` CRITICAL: Look for a tick next to P (pass), F (fail), or N/A.`
        : "";
      fieldProperties[f.id] = {
        type: "string",
        description: `"${f.label}" — If clearly ticked YES/P/PASS → "pass". If clearly ticked NO/F/FAIL → "fail". If marked N/A → "n/a". IMPORTANT: Any handwritten exception note beside the row (e.g. "NOT VISIBLE", "NO ACCESS", "NOT ACCESSIBLE", "NOT INSTALLED", "EXPOSED") OVERRIDES the printed pass/fail choice and must be returned EXACTLY as written. Only use pass/fail/n/a when there is a clear tick or circle and no overriding handwritten exception.${extraInstruction}`,
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
      const lowerLabel = f.label.toLowerCase();
      const isAirReleaseField = f.id.includes("air_release") || lowerLabel.includes("air release");
      const extraInstruction = isAirReleaseField
        ? ` IMPORTANT: For air release fields, handwritten exception notes like "NOT VISIBLE", "NO ACCESS", "NOT ACCESSIBLE", "NOT INSTALLED", or ditto marks repeating the previous row OVERRIDE the printed Yes/No/N/A or Satisfactory/Unsatisfactory options. Return the handwritten exception EXACTLY as written instead of the nearest option.`
        : "";
      fieldProperties[f.id] = {
        type: "string",
        description: `"${f.label}" — pick the closest match: ${f.options.join(", ")}. If the handwritten answer is descriptive text instead of one of those options (e.g. "NOT VISIBLE", "NO ACCESS", "N/A – EXPOSED INLET"), return the FULL text exactly as written and do NOT force it to the nearest option.${extraInstruction}`,
      };
    } else {
      fieldProperties[f.id] = {
        type: "string",
        description: `"${f.label}" — transcribe the value exactly. Pay attention to each character.`,
      };
    }
  }

  return {
    type: "function",
    function: {
      name: "extract_job_sheet",
      description: forVision
        ? "Extract all fields and header information from the job sheet photo(s)."
        : "Map the Azure-extracted text to the job sheet schema fields.",
      parameters: {
        type: "object",
        properties: {
          header: {
            type: "object",
            description: "Header information from the form.",
            properties: {
              customer: { type: "string", description: "The COMPANY/ORGANISATION name from the header 'Customer:' field at the TOP of the form. NOT a person's name from the signature block." },
              site: { type: "string", description: "FULL site address including street, city/town, and postcode. Look for fields labelled 'Site:', 'Site Address:', 'Address:', 'Location:' or similar in the header area. Include ALL address lines — do NOT omit any part. Read postcodes character by character: 0↔O, 6↔G, 8↔B, 9↔Q, N↔H. If multiple address lines exist, join them with ', '." },
              date: { type: "string", description: "Date from the form header." },
              po_ref: { type: "string", description: "PO number or reference number." },
              riser_location: { type: "string", description: "Riser location if present. Capture the FULL text including any handwritten annotations in parentheses next to or below the pre-printed location text. For example if the form says 'BACK OF BUILDING' and the technician has written '(inside building)' next to it, return 'BACK OF BUILDING (inside building)'. Always include both the pre-printed text AND any handwritten additions." },
              number_of_outlets: { type: "number", description: "Number of outlets/landing valves. Often written as an inline annotation like 'NO OF OUTLETS: 4' next to a landing valve condition row. Extract just the number." },
              engineer: { type: "string", description: "Engineer/technician name." },
              customer_signed_name: { type: "string", description: "Person's name from the SIGNATURE BLOCK at the bottom (not the company name). HANDWRITING: 'L' has a horizontal base with NO loop; 'P' has a closed loop at top. Prefer 'L' unless a closed loop is clearly visible." },
              customer_sign_date: { type: "string", description: "Date from the customer signature section." },
              customer_signature_bbox: {
                type: "object",
                description: "Bounding box of the customer's handwritten signature as percentages (0-100). Omit if unavailable.",
                properties: {
                  x_min: { type: "number" }, y_min: { type: "number" },
                  x_max: { type: "number" }, y_max: { type: "number" },
                  page_index: { type: "number" },
                },
              },
              engineer_signature_bbox: {
                type: "object",
                description: "Bounding box of the engineer's handwritten signature as percentages (0-100). Omit if unavailable.",
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
}

// ── GPT field mapping (Stage 2 — text-only, after Azure) ──

async function gptFieldMapping(
  azureText: string,
  templateName: string,
  fields: any[],
  lovableApiKey: string,
): Promise<{ extracted: Record<string, any>; header: Record<string, any> } | null> {
  const extractionTool = buildExtractionTool(fields, false);

  const systemPrompt = `You are a data mapping assistant. You receive STRUCTURED TEXT extracted from a handwritten form by Azure Document Intelligence. Map the extracted key-value pairs, table data, and text to the correct schema fields.

RULES:
1. You are working with PRE-EXTRACTED TEXT, not raw images. The OCR has already been done.
2. The template name "${templateName}" is for context only — NEVER use it as a field value.
3. Only map values that actually appear in the extracted text. If a field has no data, OMIT it.
4. HEADER vs SIGNATURE BLOCK: "Customer:" in HEADER = COMPANY name. "Customer:" in SIGNATURE BLOCK = PERSON's name.
5. SITE ADDRESS: Look for "Site:", "Site Address:", "Address:", "Location:" in the text. Include the FULL address with street, town/city, and postcode. Do NOT omit any part of the address.
6. YES/NO CIRCLING: On these forms the technician answers by CIRCLING either "YES" or "NO" (the circle may look like a loop, underline, or scribble around the word). Be very flexible: if "YES" appears circled, highlighted, underlined, or is the only clearly marked option in the cell, the answer is "pass". If "NO" is circled/marked, the answer is "fail". OCR may render the circle as symbols like "$", "©", parentheses, or other artifacts — ignore those and focus on which word (YES or NO) is marked. If the text contains descriptive annotations like "NOT VISIBLE", "NO ACCESS", "NOT INSTALLED", or any other written-out text instead of YES/NO, return that FULL text instead of forcing pass/fail/n/a.
7. AIR RELEASE / VALVE FIELDS: Map each air release row to its own field independently. Do NOT duplicate values across rows. If a value says "N/A", "NOT INSTALLED", "NOT VISIBLE", or similar, return that full text.
8. Ditto marks (" or ″ or similar repeat marks) mean the value is the SAME as the row immediately above. Copy the value from the previous row.
9. Comments field: ONLY freeform remarks, not structured data from other fields.
10. Character accuracy: For names, prefer L over P unless a closed loop is clearly visible.
11. FIELD ISOLATION: Annotations like "EXPOSED VALVE", "EXPOSED INLET", or "EXPOSED" belong ONLY to the specific field they are written next to. Do NOT copy or bleed these annotations into adjacent or unrelated fields. For example, if "EXPOSED VALVE" is written next to a valve condition field, do NOT also put it on the cabinet condition field. For "cabinet" fields (including CABINET KEYS, cabinet condition, cabinet door, cabinet glass/panel, cabinet lock), if the technician writes "N/A" or "n/a", return EXACTLY "n/a" — do NOT append any reason like "EXPOSED VALVE". Each field's value must come ONLY from what is written next to THAT specific field.
12. INLINE COUNT ANNOTATIONS: Technicians sometimes write counts like "NO OF OUTLETS: 4" or "NO OF OUTLETS: 2" next to a landing valve or condition row. Extract the number into the header field "number_of_outlets". The YES/NO answer for that row should still be captured separately in its own field.

Use the extract_job_sheet tool.`;

  const userPrompt = `Map this Azure-extracted text to the schema. Template: "${templateName}".

${azureText}`;

  const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
  let lastError = "";

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
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
        await aiResponse.text();
        lastError = `AI gateway error (${status})`;
        continue;
      }

      const responseText = await aiResponse.text();
      if (!responseText?.trim()) continue;

      let result: any;
      try { result = JSON.parse(responseText); } catch { continue; }

      try {
        const payload = extractStructuredPayload(result);
        if (hasMeaningfulValues(payload.extracted) || hasMeaningfulValues(payload.header)) {
          return payload;
        }
      } catch { /* try next */ }
    }
    // If we got a result from the first model, we'd have returned already
  }

  console.warn("GPT field mapping failed:", lastError);
  return null;
}

// ── GPT-Vision fallback (direct image → GPT, original method) ──

async function gptVisionFallback(
  images: { image_base64: string; mime_type?: string }[],
  templateName: string,
  fields: any[],
  lovableApiKey: string,
): Promise<{ extracted: Record<string, any>; header: Record<string, any> } | null> {
  const extractionTool = buildExtractionTool(fields, true);

  const systemPrompt = `You are an expert OCR assistant. Extract data from the handwritten form in the image(s). Do NOT invent or guess values — ONLY transcribe what is physically written on the form.

HEADER: "Customer:" at TOP = COMPANY name. "Customer:" at BOTTOM signature block = PERSON's name.
SITE ADDRESS: Look for "Site:", "Site Address:", "Address:", or "Location:" in the header. Transcribe the FULL address including street, town/city, and postcode. Include ALL lines. If the address spans multiple lines, join with ", ".
Site postcodes: read character by character (0↔O, 6↔G, 8↔B).
AIR RELEASE / VALVE FIELDS: Read EACH air release row independently. Do NOT copy values from adjacent rows. Check the EXACT column each tick mark is in — YES/P column = "pass", NO/F column = "fail". If a field says "N/A", "NOT INSTALLED", "NOT VISIBLE", or similar descriptive text, return that FULL text.
YES/NO CIRCLING: The technician circles either YES or NO. Be flexible — if "YES" is circled, underlined, or visually marked → "pass". If "NO" is marked → "fail". Ignore OCR artifacts around the circled word (e.g. "$", "©", parentheses). If NEITHER is clearly marked but descriptive text is present, return the full text.
P/F/N/A: tick beside P = "pass", F = "fail", N/A = "n/a".
Descriptive text (e.g. "N/A – EXPOSED INLET") → return FULL text.
FIELD ISOLATION: Annotations like "EXPOSED VALVE" belong ONLY to the specific field they are written next to. Do NOT bleed them into adjacent fields. For "cabinet" condition fields, if there is no cabinet (exposed valve), return just "n/a" — NOT "N/A - EXPOSED VALVE".
INLINE COUNT ANNOTATIONS: If "NO OF OUTLETS: X" is written next to a landing valve row, extract the number into header.number_of_outlets. Still capture the YES/NO answer for that row separately.
Blank fields → OMIT entirely.
Template name "${templateName}" is NEVER a valid field value.

Use the extract_job_sheet tool.`;

  const userContentParts: any[] = [
    {
      type: "text",
      text: `Extract data from this handwritten form. Template: "${templateName}".`,
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

  const models = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
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
        await aiResponse.text();
        if (status === 429 || status === 402) throw new Error(`AI error: ${status}`);
        continue;
      }

      const responseText = await aiResponse.text();
      if (!responseText?.trim()) continue;

      let result: any;
      try { result = JSON.parse(responseText); } catch { continue; }

      try {
        const payload = extractStructuredPayload(result);
        if (hasMeaningfulValues(payload.extracted) || hasMeaningfulValues(payload.header)) {
          return payload;
        }
      } catch { /* try next */ }
    }
  }

  return null;
}

// ── Main handler ──

const AZURE_CONFIDENCE_THRESHOLD = 0.6;

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let ocrPath = "unknown";
    let bestExtraction: { extracted: Record<string, any>; header: Record<string, any> } | null = null;

    // ── Try Azure Document Intelligence first ──
    const AZURE_ENDPOINT = Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
    const AZURE_KEY = Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_KEY");

    if (AZURE_ENDPOINT && AZURE_KEY) {
      try {
        console.log("Stage 1: Azure Document Intelligence prebuilt-layout...");
        const azureResult = await analyzeWithAzure(images, AZURE_ENDPOINT.replace(/\/$/, ""), AZURE_KEY);
        console.log(`Azure complete: ${azureResult.text.length} chars, confidence=${azureResult.confidence.toFixed(3)}, kvPairs=${azureResult.kvPairCount}, tables=${azureResult.tableCount}`);

        if (azureResult.confidence >= AZURE_CONFIDENCE_THRESHOLD && azureResult.text.length > 50) {
          // Azure confidence is good — use Azure text + GPT mapping
          console.log("Stage 2: GPT field mapping from Azure text (high confidence)...");
          bestExtraction = await gptFieldMapping(azureResult.text, template_name, fields, LOVABLE_API_KEY);
          if (bestExtraction) {
            ocrPath = `azure+gpt (confidence=${azureResult.confidence.toFixed(3)})`;
          }
        } else {
          console.warn(`Azure confidence too low (${azureResult.confidence.toFixed(3)}) or insufficient text (${azureResult.text.length} chars). Falling back to GPT-vision.`);
        }
      } catch (azureErr: any) {
        console.warn(`Azure failed, falling back to GPT-vision: ${azureErr.message}`);
      }
    } else {
      console.log("Azure credentials not configured, using GPT-vision directly.");
    }

    // ── Fallback: GPT-Vision (direct image reading) ──
    if (!bestExtraction) {
      console.log("Using GPT-vision fallback (direct image analysis)...");
      bestExtraction = await gptVisionFallback(images, template_name, fields, LOVABLE_API_KEY);
      if (bestExtraction) {
        ocrPath = "gpt-vision-fallback";
      }
    }

    console.log(`OCR path used: ${ocrPath}`);

    if (bestExtraction) {
      return new Response(JSON.stringify({
        extracted: bestExtraction.extracted,
        header: bestExtraction.header,
        _ocr_path: ocrPath,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Could not extract data from the sheet. Try a clearer photo." }), {
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
