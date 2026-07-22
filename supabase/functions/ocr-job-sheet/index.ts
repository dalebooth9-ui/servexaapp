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

function normalizeCheckboxFieldValue(value: unknown) {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === "true") return "yes";
  if (normalized === "false") return "no";
  if (normalized === "yes" || normalized === "no" || normalized === "n/a" || normalized === "na") {
    return normalized;
  }

  return trimmed;
}

function normalizeExtractedCheckboxValues(extracted: Record<string, any> = {}, fields: any[] = []) {
  const next = { ...extracted };

  for (const field of fields) {
    if (field?.type !== "checkbox" || !(field.id in next)) continue;
    next[field.id] = normalizeCheckboxFieldValue(next[field.id]);
  }

  return next;
}

function normalizeComparableExtractionValue(value: unknown) {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function isNaEquivalent(value: unknown) {
  const normalized = normalizeComparableExtractionValue(value);
  return normalized === "n/a" || normalized === "na";
}

function containsExposedOutlets(value: unknown) {
  return /exposed\s*outlets?/i.test(normalizeComparableExtractionValue(value));
}

function extractStructuredPayload(result: any) {
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments?.trim()) {
    const parsed = parseStructuredJson(toolCall.function.arguments);
    return {
      extracted: parsed.fields || {},
      header: parsed.header || {},
      field_confidence: parsed.field_confidence || {},
    };
  }
  const content = typeof result.choices?.[0]?.message?.content === "string"
    ? result.choices?.[0]?.message?.content : "";
  if (content.trim()) {
    const parsed = parseStructuredJson(content);
    return {
      extracted: parsed.fields || parsed,
      header: parsed.header || {},
      field_confidence: parsed.field_confidence || {},
    };
  }
  throw new Error("AI returned no structured output");
}

// ── Build extraction tool schema ──

function buildExtractionTool(fields: any[], forVision: boolean) {
  const fieldProperties: Record<string, any> = {};
  // Anti-fabrication rule shared by every ticked/circled field type.
  // A wrong assertion on a certificate is worse than a blank — so any time the
  // model is not certain a mark exists, it MUST omit the field entirely.
  // "n/a" is a positive assertion an engineer WROTE — never a default.
  const OMIT_IF_UNCERTAIN = ` CRITICAL: If NO mark is clearly visible next to any option on this row (no tick, no circle, no strikethrough, no handwritten override), OMIT this field entirely — do NOT default to "n/a", do NOT guess, do NOT infer from the surrounding rows. "n/a" is ONLY valid when an engineer has explicitly ticked/circled a printed "N/A" option OR handwritten "N/A" on the row. When in doubt, OMIT.`;
  for (const f of fields) {
    if (f.type === "pass_fail") {
      const lowerLabel = f.label.toLowerCase();
      const isPressureTestField = f.id.includes("pressure_test") || lowerLabel.includes("pressure test");
      const extraInstruction = isPressureTestField && forVision
        ? ` CRITICAL: Look for a tick next to P (pass), F (fail), or N/A.`
        : "";
      fieldProperties[f.id] = {
        type: "string",
        description: `"${f.label}" — If clearly ticked YES/P/PASS or circled → "pass". If clearly ticked NO/F/FAIL or circled → "fail". If explicitly ticked/circled N/A or handwritten "N/A" → "n/a". If a handwritten exception note is written beside the row (e.g. "NOT VISIBLE", "NO ACCESS", "EXPOSED VALVE") return that FULL text instead.${OMIT_IF_UNCERTAIN}${extraInstruction}`,
      };
    } else if (f.type === "checkbox") {
      fieldProperties[f.id] = {
        type: "string",
        description: `"${f.label}" — Return "yes" if clearly marked YES/ticked, "no" if clearly marked NO, and "n/a" ONLY if an explicit N/A tick or handwritten "N/A" is present on the row. If the row contains descriptive text or a printed/handwritten exception (e.g. "NOT VISIBLE", "NO ACCESS", "NOT INSTALLED", "N/A - EXPOSED VALVE"), return the FULL text exactly as written instead of forcing yes/no/n/a.${OMIT_IF_UNCERTAIN}`,
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
        description: `"${f.label}" — pick the closest match: ${f.options.join(", ")}. Return an option value ONLY if the engineer has clearly ticked, circled, struck through, or otherwise marked one of them (or written a matching answer). If the handwritten answer is descriptive text (e.g. "NOT VISIBLE", "NO ACCESS", "N/A – EXPOSED INLET"), return the FULL text exactly as written and do NOT force it to the nearest option.${OMIT_IF_UNCERTAIN}${extraInstruction}`,
      };
    } else {
      const lowerLabel = (f.label || "").toLowerCase();
      const isRemarkField =
        f.type === "textarea" ||
        /remark|comment|note|defect|observation|issue|action|works?\s*carried|description of works/.test(lowerLabel);
      if (isRemarkField) {
        fieldProperties[f.id] = {
          type: "string",
          description: `"${f.label}" — freeform handwritten notes. CRITICAL LINE INTEGRITY RULES: (1) Read each physical handwritten line LEFT-TO-RIGHT in full before moving to the next line. (2) Preserve line breaks as "\\n" — one handwritten line = one statement = one output line. (3) Return lines in TOP-TO-BOTTOM order. (4) NEVER reorder, merge, or split lines: if a location annotation (e.g. "LEVEL 2 + 4", "on floors 3-5", "riser 1") appears on the same handwritten line as a defect ("OUTLET LOCKS REQ"), it MUST stay attached on the same output line ("OUTLET LOCKS REQ - LEVEL 2 + 4"). Detaching the location from its defect line is a critical error because it loses which defect that location refers to. (5) Do NOT insert bullets, dashes, or commas between lines — use only real newlines. (6) Transcribe verbatim; do not paraphrase.`,
        };
      } else {
        fieldProperties[f.id] = {
          type: "string",
          description: `"${f.label}" — transcribe the value exactly. Pay attention to each character.`,
        };
      }
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
              paperwork_owner_company: { type: "string", description: "The COMPANY that OWNS this paperwork — the company whose LOGO or COMPANY NAME appears in the LETTERHEAD/BRANDING at the very TOP of the sheet (e.g. 'BESSEGES', 'SAFELY COMPLY', 'VIVA FIRE PROTECTION'). Read this from the logo/branding block ONLY — do NOT read from the 'Customer:' or 'Site:' form fields. If the letterhead has a stylised logo, transcribe the visible company name text. Leave blank if there is no letterhead/branding on the sheet." },
              customer: { type: "string", description: "The COMPANY/ORGANISATION name written in the form's 'Customer:' or 'Client:' field (the FILLED-IN VALUE next to that label). NOT the letterhead — that goes in paperwork_owner_company. NOT a person's name from the signature block. On many subcontractor sheets this 'Customer:' field is blank because the details box only shows a site address — leave this blank in that case." },
              site: { type: "string", description: "FULL site address including street, city/town, and postcode. Look for fields labelled 'Site:', 'Site Address:', 'Address:', 'Location:' or similar in the header area. Include ALL address lines — do NOT omit any part. Read postcodes character by character: 0↔O, 6↔G, 8↔B, 9↔Q, N↔H. If multiple address lines exist, join them with ', '." },
              date: { type: "string", description: "Date the work was carried out, from the form header. Return in the exact format written on the sheet (usually DD/MM/YY or DD/MM/YYYY). This is a RECENTLY completed job sheet: the date must be on or before today and normally within the last 12 months. When ONLY the final year digit is ambiguous (e.g. handwritten '15/7/2_' where the last digit could be 0 or 6), resolve it using recency — a form scanned today is overwhelmingly likely to be current-year, not 6+ years old. But if the digit is genuinely unreadable, leave the field blank and set field_confidence <0.5. Never commit a possibly-wrong compliance date to the certificate." },
              po_ref: { type: "string", description: "PO number or reference number." },
              riser_location: { type: "string", description: "Riser location if present. Capture the FULL text including any handwritten annotations in parentheses next to or below the pre-printed location text. For example if the form says 'BACK OF BUILDING' and the technician has written '(inside building)' next to it, return 'BACK OF BUILDING (inside building)'. Always include both the pre-printed text AND any handwritten additions. IMPORTANT: Do NOT include any 'NUMBER OF OUTLETS', 'NO OF OUTLETS', 'GRAND OUTLETS', or outlet count text in this field — that belongs in number_of_outlets only. Strip any outlet references from the riser location string." },
              number_of_outlets: { type: "number", description: "HIGHEST PRIORITY FIELD on dry riser forms — the number of outlets / landing valves on the riser. Search the ENTIRE sheet for this count, not just a dedicated row: it is usually a small handwritten annotation in the answer column, and it is very often written INLINE on a different row (e.g. next to a landing valve YES/NO question, next to the riser location, in the header margin, or beside the address). Recognise ALL of these patterns and always return just the integer: 'NO OF OUTLETS: 2', 'NO. OF OUTLETS 4', 'NUMBER OF OUTLETS = 3', 'OUTLETS: 6', 'OUTLETS x 2', '2 OUTLETS', '4 LANDING VALVES', '3 x LV', 'LV x 2'. If you see any digit followed by 'outlet' / 'outlets' / 'landing valve(s)' / 'LV' anywhere on the sheet — even scribbled in a margin or on an unrelated row — extract that number here. Do NOT leave this blank if any such annotation exists. IMPORTANT: Do NOT put any valve type description (e.g. 'instantaneous', 'screw thread', 'BSP') in this field — that belongs in valve_type." },
              valve_type: { type: "string", description: "The type of landing valve fitted to the riser, when the technician has written it on the sheet. Common values: 'instantaneous', 'screw thread', 'BSP', 'round thread', 'flanged', or an abbreviation like 'INST'. Usually a short handwritten annotation next to the landing valve row or in the internal-equipment area of the sheet, alongside the outlet count. Leave BLANK/omit if no valve type text appears on the sheet — never guess and never carry an outlet count into this field." },
              cabinet_keys: { type: "string", description: "Cabinet keys / key holder / keys held by — an inline supplementary metadata field typically written near the riser location or in the header. Capture the FULL text exactly as written (e.g. 'YES', 'NO', 'CLIENT', 'HELD BY SITE', 'RECEPTION'). Omit if no such annotation appears anywhere on the sheet." },
              engineer: { type: "string", description: "Engineer/technician name from the sign-off area, ONLY if the handwriting is clearly legible letter-by-letter. If the name is scribbled, partially cut off, ambiguous between two plausible readings (e.g. 'P' vs 'L', 'JONES' vs 'JAMES'), or you would have to guess any character, return an EMPTY STRING and set field_confidence for this field <0.5. Do NOT invent a plausible-sounding name. Do NOT fall back to a name from the letterhead or the header customer field. A blank here is CORRECT when illegible — a reviewer will type it in." },
              customer_signed_name: { type: "string", description: "The PERSON's name printed or handwritten in the CUSTOMER signature block at the bottom of the form (NOT the company name, NOT the letterhead). ONLY return a value if the name is clearly legible letter-by-letter. If the customer signature/name row is blank, scribbled, illegible, ambiguous between two plausible readings (e.g. 'P. JONES' vs 'R. JONES', 'L' vs 'P'), partially cut off, or you would have to guess any character to complete it, you MUST return an EMPTY STRING and set field_confidence for this field <0.5. Do NOT infer a name from partial marks. Do NOT invent a plausible-sounding name. Do NOT copy the header customer/company name into this field. A blank here is CORRECT when unclear — the office reviewer will fill it in manually." },
              customer_sign_date: { type: "string", description: "Date next to the customer signature at the bottom of the form. Same rules as header.date: recent job sheet, must be on/before today and typically within the last 12 months; ambiguous final year digit should be resolved using recency, but a genuinely unreadable digit means BLANK + low confidence rather than a guess." },
              customer_signature_bbox: {
                type: "object",
                description: "Bounding box for the customer/client signature INK on the customer row at the bottom of the form. Return this ONLY when a real customer handwritten signature is visibly present. If the customer row is empty and only printed table/grid lines are visible, OMIT this field. Do NOT capture the engineer row, footer, labels, or blank signature line. Return percentages (0-100) of image dimensions.",
                properties: {
                  x_min: { type: "number" }, y_min: { type: "number" },
                  x_max: { type: "number" }, y_max: { type: "number" },
                  page_index: { type: "number" },
                },
              },
              engineer_signature_bbox: {
                type: "object",
                description: "TIGHT bounding box around ONLY the engineer's handwritten signature INK STROKES (the squiggly mark, NOT the printed name). Return percentages (0-100) of image dimensions. Do NOT add padding. A typical signature is only 10-18% of page width and 3-8% of page height.",
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
          field_confidence: {
            type: "object",
            description: "Per-field extraction confidence keyed by the SAME field IDs used in `fields`. Value is a number 0.0–1.0 reflecting how sure you are that the value you returned matches what is actually written on the paper. Use <0.6 whenever you had to guess between two plausible marks, could not clearly see a tick/circle, the row was partially cut off, or the answer was inferred rather than directly read. Populate an entry for every field you extracted; omit for fields you did not extract.",
            additionalProperties: { type: "number" },
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
): Promise<{ extracted: Record<string, any>; header: Record<string, any>; field_confidence: Record<string, number> } | null> {
  const extractionTool = buildExtractionTool(fields, false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const systemPrompt = `You are a data mapping assistant. Today's date is ${todayIso}. The sheet you are mapping was scanned recently (within days), so any date field on it should be on or before ${todayIso} and normally within the last 12 months. You receive STRUCTURED TEXT extracted from a handwritten form by Azure Document Intelligence. Map the extracted key-value pairs, table data, and text to the correct schema fields.

RULES:
1. You are working with PRE-EXTRACTED TEXT, not raw images. The OCR has already been done.
2. The template name "${templateName}" is for context only — NEVER use it as a field value.
3. Only map values that actually appear in the extracted text. If a field has no data, OMIT it (do NOT fabricate "n/a" as a filler — see rule 3a).
3a. NEVER FABRICATE "N/A". "n/a" is a positive assertion an engineer WROTE on the sheet. If the extracted text does not clearly contain a tick/circle/handwritten mark for a row, OMIT that field entirely. Returning "n/a" for a row where no answer exists is a critical error — it puts a false assertion onto a certificate.
3b. CONFIDENCE (field_confidence): For every field you DO return, populate an entry in field_confidence with a number 0.0–1.0. Use <0.6 whenever the answer was ambiguous (e.g. the mark could belong to two rows, OCR text was noisy, or you had to guess between two plausible options). Use ≥0.85 only when the answer is unambiguous.
3c. NEVER GUESS HANDWRITTEN NAMES OR FREE-TEXT. For any handwritten name field (customer_signed_name, engineer / technician name, print name, "signed by", client name, contact name) OR any handwritten free-text answer: if the writing is not clearly legible — i.e. you cannot confidently read every letter, or you have to guess between two plausible readings (e.g. "P. JONES" vs "R. JONES", "L" vs "P") — you MUST return an empty string / OMIT the field. Wrong data confidently presented on a compliance certificate is worse than a blank. A reviewer will fill it in manually. When in ANY doubt, leave the field blank and set its field_confidence entry to <0.5 so the review UI flags it. Do NOT invent plausible-sounding names. Do NOT copy a name from a different field (letterhead, header customer, previous sheet). Do NOT default to the first letter you can make out plus "..." — return truly empty.
4. HEADER vs SIGNATURE BLOCK: "Customer:" in HEADER = COMPANY name. "Customer:" in SIGNATURE BLOCK = PERSON's name.
4b. LETTERHEAD / PAPERWORK OWNER: The company whose LOGO or NAME appears at the very TOP of the sheet (the letterhead / branding block) is the paperwork_owner_company — put it in header.paperwork_owner_company. This is often DIFFERENT from the 'Customer:' field. On subcontractor jobs the details box may only contain a site address and NO customer name — that is expected; leave header.customer blank in that case rather than guessing.
5. SITE ADDRESS: Look for "Site:", "Site Address:", "Address:", "Location:" in the text. Include the FULL address with street, town/city, and postcode. Do NOT omit any part of the address.
6. YES/NO INTERPRETATION — be very flexible with how technicians mark answers:
   a) CIRCLING: If "YES" or "NO" is circled, looped, underlined, or highlighted → that is the answer. OCR may render circles as "$", "©", "()", or other artifacts — ignore those symbols and focus on which word is marked.
   b) STRIKETHROUGH: If "YES/NO" appears with one option struck through (crossed out, lined through), the OTHER option is the answer. E.g. "YES/̶N̶O̶" or "YES/NO" with NO struck through → answer is "pass" (YES).
   c) HANDWRITING NEXT TO PRE-PRINTED TEXT: If the technician writes additional text next to YES/NO (e.g. numbers, notes, annotations), still determine the YES/NO answer AND capture the annotation. The YES/NO answer maps to pass/fail; any inline notes or numbers next to it should be captured in a notes field or the appropriate separate field (e.g. "NO OF OUTLETS: 4" → number_of_outlets).
   d) GENERAL RULE: If "YES" appears anywhere in the answer cell as the marked/selected option → "pass". If "NO" appears as the marked option → "fail". Be generous — any clear indication of YES or NO should be captured.
   e) DESCRIPTIVE OVERRIDES: If instead of YES/NO the text contains descriptive annotations like "NOT VISIBLE", "NO ACCESS", "NOT INSTALLED", or any other written-out text, return that FULL text instead of forcing pass/fail/n/a. Note: "NO ACCESS" is NOT the same as answering "NO" — it is a descriptive exception.
   f) UNMARKED: If none of YES/NO/N/A carries any tick, circle, strikethrough, or other mark, and there is no handwritten override, OMIT the field. Do NOT default to "n/a".
6a. ROW-ASSOCIATION FOR CIRCLED MARKS (CRITICAL — this is where most extraction errors happen): When you see a circle/tick/strikethrough on a YES/NO/N/A token, attach it to the row whose printed answer TOKENS the mark actually surrounds or overlaps, NOT the row whose question label is nearest vertically. Multi-line questions (where the printed question wraps across 2+ printed lines) are especially dangerous: the answer-column YES/NO/N/A tokens sit on ONE specific baseline within the row's block. Determine the CORRECT row by matching the mark's horizontal position to a specific YES/NO/N/A token in the answer column, then attributing to whichever question owns that token line. When the mark sits between two rows and could belong to either, mark that field with confidence <0.6 rather than guessing.
7. AIR RELEASE / VALVE FIELDS: Map each air release row to its own field independently. Do NOT duplicate values across rows. If a value says "N/A", "NOT INSTALLED", "NOT VISIBLE", or similar, return that full text.
8. Ditto marks (" or ″ or similar repeat marks) mean the value is the SAME as the row immediately above. Copy the value from the previous row.
9. Comments field: ONLY freeform remarks, not structured data from other fields.
9a. MULTI-LINE COMMENTS / REMARKS / NOTES: Read the handwritten block strictly LEFT-TO-RIGHT per line, then TOP-TO-BOTTOM. Preserve each physical line as a SEPARATE line in the output (join with real newlines "\\n"). NEVER re-flow, split, merge or reorder lines. If a location qualifier ("LEVEL 2 + 4", "3rd floor", "riser 1") sits on the same handwritten line as a defect ("OUTLET LOCKS REQ"), it MUST stay on that same line ("OUTLET LOCKS REQ - LEVEL 2 + 4"). Losing that attachment loses which defect the location refers to and is a critical error.
10. Character accuracy: For names, prefer L over P unless a closed loop is clearly visible.
11. FIELD ISOLATION: Annotations like "EXPOSED VALVE", "EXPOSED INLET", or "EXPOSED" belong ONLY to the specific field they are written next to. Do NOT copy or bleed these annotations into adjacent or unrelated fields. For example, if "EXPOSED VALVE" is written next to a valve condition field, do NOT also put it on the cabinet condition field. For "cabinet" fields (including CABINET KEYS, cabinet condition, cabinet door, cabinet glass/panel, cabinet lock), if the row literally only says "N/A" or "n/a", return EXACTLY "n/a". But if the same row shows a fuller exception like "N/A - EXPOSED VALVE", return the FULL text exactly as shown. Each field's value must come ONLY from what is written next to THAT specific field.
12. INLINE COUNT ANNOTATIONS (CRITICAL FOR DRY RISER FORMS): The number of outlets / landing valves is the single most important data point on any dry riser sheet. It is almost never in a dedicated labelled row — technicians write it as a small handwritten annotation inline in the answer column, usually next to the landing valve YES/NO row, sometimes in a margin, next to the riser location, or next to the address. Actively scan the ENTIRE sheet for any of: "NO OF OUTLETS: N", "NO. OF OUTLETS N", "NUMBER OF OUTLETS = N", "OUTLETS: N", "OUTLETS x N", "N OUTLETS", "N LANDING VALVES", "N x LV", "LV x N". If you see any digit adjacent to the words outlet(s) / landing valve(s) / LV anywhere on the page, extract that integer into header.number_of_outlets — even if the annotation physically sits on a row whose pre-printed question is about something else (e.g. landing valve condition). The YES/NO answer for that row should still be captured separately in its own field, but do NOT let the outlet number get lost.
    MORE GENERALLY: handwritten annotations in the answer column often belong to a DIFFERENT field than the row they were written on (there was no dedicated row so the tech scribbled it wherever there was space). Always ask yourself "what does this annotation mean?" rather than "what row is it on?", and route it to the correct schema field.
13. "N/A - EXPOSED VALVE" OR "N/A – EXPOSED VALVE" PRE-PRINTED TEXT: Some rows have "N/A - EXPOSED VALVE" or "N/A – EXPOSED VALVE" pre-printed in the answer column (common on glass and cabinet condition rows for breeching inlets). This is NOT a "NO" answer — return the FULL text "N/A - EXPOSED VALVE" exactly. NEVER shorten it to "NO" or "N/A". The text "N/A" at the start does NOT mean "NO".
14. SECTION HEADERS vs FIELD VALUES: Row labels like "EXTERNAL EQUIPMENT:", "INTERNAL EQUIPMENT:", or section titles are NOT fields to extract — they are section headers. Do NOT create a field or value for them. Only extract rows that have an actual question with an answer.
15. ADJACENT FIELD CONTAMINATION: When a row has YES circled (e.g. "Is the Breeching Inlet in good condition? → YES") and the NEXT row has "N/A - EXPOSED VALVE", do NOT let the "N/A" from the next row contaminate the current row. Each row must be read independently. "N/A" in one row does NOT negate "YES" in the row above or below.
16. MISSING ROWS: The template may contain fields that do NOT physically appear on the scanned sheet. If a template field has no matching row on the sheet, OMIT it — do NOT fill it with values borrowed from other sections. If a row IS present AND has a clear mark, extract its value. If a row IS present but has no mark, OMIT it (do NOT default to "n/a" — see rule 3a).
17. SECTION-SPECIFIC TERMINOLOGY: "EXPOSED INLET" and "EXPOSED OUTLETS" are EXTERNAL equipment concepts that refer to breeching inlets and landing valves. They NEVER apply to INTERNAL equipment fields (like outlet cabinets, landing valve padlocks inside, internal condition fields). If an INTERNAL section field has "N/A" written on the sheet, return exactly "n/a" — do NOT append "EXPOSED INLET" or "EXPOSED OUTLETS" to internal fields. These annotations only belong to EXTERNAL section fields where the physical inlet or outlet is exposed.

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
): Promise<{ extracted: Record<string, any>; header: Record<string, any>; field_confidence: Record<string, number> } | null> {
  const extractionTool = buildExtractionTool(fields, true);

  const todayIso = new Date().toISOString().slice(0, 10);
  const systemPrompt = `You are an expert OCR assistant. Today's date is ${todayIso}. The image you are reading is a RECENTLY scanned handwritten job sheet — any date on it should be on/before ${todayIso} and normally within the last 12 months. Extract data from the handwritten form in the image(s). Do NOT invent or guess values — ONLY transcribe what is physically written on the form.

DATE FIELDS: When a written date has an ambiguous final year digit (e.g. "15/7/2_" where the last digit could be 0 or 6), resolve it using recency — this sheet was scanned this week, so the current year is overwhelmingly more likely than any year 6+ years ago. But if the digit is genuinely unreadable or the whole date is illegible, leave the field blank and set field_confidence <0.5. NEVER commit a possibly-wrong date to a compliance certificate — a blank flagged for review is always safer than a plausible-looking wrong year.

NEVER FABRICATE "N/A": "n/a" is a positive assertion an engineer WROTE on the sheet. If a row has no clearly visible tick, circle, strikethrough, or handwritten mark, OMIT that field. Do NOT default absent answers to "n/a" — putting a false assertion on a certificate is worse than leaving it blank.
CONFIDENCE (field_confidence): For every field you return, populate an entry in field_confidence with a number 0.0–1.0. Use <0.6 whenever the mark was ambiguous, the row spanned multiple printed lines and the mark's owning row was unclear, the image was blurry, or you had to guess. Use ≥0.85 only when the mark is unambiguous.
ROW-ASSOCIATION FOR CIRCLED/TICKED MARKS (CRITICAL — most wrong answers come from this): Attach each YES/NO/N/A/PASS/FAIL circle-or-tick to the row whose printed answer TOKEN it actually surrounds or overlaps horizontally in the answer column — NOT to the row whose question label is nearest vertically. Multi-line questions (labels that wrap onto 2+ printed lines) are the danger zone: the answer-column tokens sit on ONE specific baseline within that row's block. Anchor the mark by identifying which printed YES/NO/N/A token it encloses, then attribute it to the question that owns THAT token line. When a mark sits ambiguously between two rows, mark that field with confidence <0.6 rather than guessing (or omit if you truly cannot tell).
HEADER: "Customer:" at TOP = COMPANY name. "Customer:" at BOTTOM signature block = PERSON's name.
LETTERHEAD / PAPERWORK OWNER: The company whose LOGO or NAME is printed at the very TOP of the sheet (the letterhead / branding block) is the paperwork_owner_company — extract it into header.paperwork_owner_company by reading the top-of-page logo/branding. It is often DIFFERENT from the 'Customer:' field. On subcontractor sheets the details box may only contain a SITE address and no 'Customer:' value — that is expected; leave header.customer blank in that case rather than inventing one from the letterhead or address.
SITE ADDRESS: Look for "Site:", "Site Address:", "Address:", or "Location:" in the header. Transcribe the FULL address including street, town/city, and postcode. Include ALL lines. If the address spans multiple lines, join with ", ".
Site postcodes: read character by character (0↔O, 6↔G, 8↔B).
AIR RELEASE / VALVE FIELDS: Read EACH air release row independently. Do NOT copy values from adjacent rows. If a field says "N/A", "NOT INSTALLED", "NOT VISIBLE", or similar descriptive text, return that FULL text.
YES/NO INTERPRETATION: Be very flexible. CIRCLED option = that answer. STRIKETHROUGH on one option = the OTHER is the answer (e.g. YES/̶N̶O̶ → "pass"). Handwriting next to pre-printed YES/NO = still determine the YES/NO answer; capture inline notes separately. "NO ACCESS" is a descriptive exception, NOT the same as "NO". OCR artifacts ($, ©, parens) around circled words should be ignored. If NONE of YES/NO/N/A carries any mark, OMIT the field — do NOT guess.
P/F/N/A: tick beside P = "pass", F = "fail", tick beside a printed N/A option = "n/a". An UNMARKED P/F/N/A row must be OMITTED, never defaulted to "n/a".
Descriptive text (e.g. "N/A – EXPOSED INLET") → return FULL text.
FIELD ISOLATION: Annotations like "EXPOSED VALVE" belong ONLY to the specific field they are written next to. Do NOT bleed them into adjacent fields. For ALL cabinet-related fields (CABINET KEYS, cabinet condition, cabinet door, cabinet glass/panel, cabinet lock), if the row literally only says "N/A", return exactly "n/a". But if the row itself says "N/A - EXPOSED VALVE" (or similar descriptive exception text), return the FULL text exactly as shown.
"N/A - EXPOSED VALVE" PRE-PRINTED TEXT: Some rows (especially glass and cabinet condition for breeching inlets) have "N/A - EXPOSED VALVE" pre-printed in the answer column. Return the FULL text "N/A - EXPOSED VALVE" — do NOT shorten to "NO" or just "N/A". The "N/A" prefix does NOT mean "NO".
SECTION HEADERS: Row labels like "EXTERNAL EQUIPMENT:", "INTERNAL EQUIPMENT:" are section headers, NOT fields. Do NOT extract values for them.
ADJACENT FIELD CONTAMINATION: Read each row independently. If one row has YES circled and the next row has "N/A - EXPOSED VALVE", do NOT let the "N/A" contaminate the YES row. Each answer belongs ONLY to its own row.
INLINE COUNT ANNOTATIONS (HIGHEST PRIORITY ON DRY RISER FORMS): The number of outlets / landing valves is the single most important value on any dry riser sheet. It is almost never in its own labelled row — techs scribble it inline in the answer column (often on the landing valve YES/NO row, or in a margin, or next to the riser location/address). Scan the WHOLE page for any of: "NO OF OUTLETS: N", "OUTLETS: N", "OUTLETS x N", "N OUTLETS", "N LANDING VALVES", "N x LV", "LV x N". If you see any digit next to outlet(s) / landing valve(s) / LV anywhere on the sheet, extract that integer into header.number_of_outlets — even if the row it sits on asks about something else. Still capture the row's YES/NO answer separately. More generally: a handwritten note in the answer column often belongs to a different field than the row it was written on; route it to the correct schema field by meaning, not by position.
Blank / unmarked fields → OMIT entirely (never default to "n/a").
MULTI-LINE COMMENTS / REMARKS / NOTES: For any freeform notes/comments/remarks textarea, read the block strictly LEFT-TO-RIGHT per handwritten line, then TOP-TO-BOTTOM. Preserve each physical line as a SEPARATE line in the output (join with real newlines "\\n"). NEVER re-flow, split, merge or reorder lines. If a location qualifier ("LEVEL 2 + 4", "3rd floor", "riser 1") sits on the same handwritten line as a defect ("OUTLET LOCKS REQ"), it MUST stay on that same line ("OUTLET LOCKS REQ - LEVEL 2 + 4"). Detaching the location from its defect line loses which defect it refers to and is a critical error.
MISSING / UNMARKED ROWS: If a template field has no matching row on the scanned sheet, OMIT it. If a row IS present but has no clear mark, OMIT it too — do NOT default to "n/a".
Template name "${templateName}" is NEVER a valid field value.

SIGNATURE EXTRACTION (CRITICAL):
- Look at the VERY BOTTOM of the form for the sign-off / signature section.
- There are typically TWO signature rows: one for the engineer/technician and one for the customer/client.
- For EACH signature row, extract the printed/handwritten NAME of the signer and the DATE next to the signature only when clearly legible.
- The customer's name goes in customer_signed_name. The engineer's name goes in engineer.
- For customer_signature_bbox, return a box ONLY around real handwritten customer signature ink. Empty ruled boxes/lines are not signatures.
- Do NOT capture the entire footer, blank signature line, or both rows together. Keep the box limited to visible customer signature ink only.
- Bounding boxes must be in percentage coordinates (0-100).
- If the customer signature row is blank, return no customer_signature_bbox and return an empty customer_signed_name. Never guess a customer name from an empty or illegible row.

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
    let bestExtraction: { extracted: Record<string, any>; header: Record<string, any>; field_confidence: Record<string, number> } | null = null;

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
      // Post-processing: strip "EXPOSED INLET" from internal section fields
      const internalFieldIds = (fields || [])
        .filter((f: any) => {
          const section = (f.section || "").toLowerCase();
          return section.includes("internal");
        })
        .map((f: any) => f.id);

      for (const fieldId of internalFieldIds) {
        const val = bestExtraction.extracted[fieldId];
        if (typeof val === "string" && /exposed\s*inlet/i.test(val)) {
          const cleaned = val.replace(/[-–—]\s*exposed\s*inlet/i, "").replace(/exposed\s*inlet/i, "").trim();
          if (cleaned) {
            bestExtraction.extracted[fieldId] = cleaned;
            console.log(`Post-process: stripped "EXPOSED INLET" from internal field ${fieldId}: "${val}" → "${cleaned}"`);
          } else {
            // Rather than fabricating "n/a" for a field that only ever said
            // "EXPOSED INLET" (which shouldn't be there), OMIT the field so
            // the renderer shows a dash and the office is prompted to check.
            delete bestExtraction.extracted[fieldId];
            console.log(`Post-process: dropped internal field ${fieldId} — only value was "EXPOSED INLET" (would fabricate n/a otherwise)`);
          }
        }
      }

      // Post-processing: if ANY field in a section says "EXPOSED OUTLETS", then all
      // subsequent fields in that same section that reference "cabinet" must be "n/a"
      // AND the immediately next field in the same section is also forced to "n/a".
      // NOTE: this is INTENTIONAL n/a assertion — EXPOSED OUTLETS on the printed
      // sheet is a legitimate engineer-written N/A. Not a fabrication.
      const fieldArray = fields || [];
      const normaliseLabel = (value: string) =>
        value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const isCustomerSignerNameField = (field: any) => {
        const label = normaliseLabel(`${field.section || ""} ${field.label || ""}`);
        const hasSignerContext = /signature|sign off|signoff|declaration|completion|footer|signed|signatory|printed name/.test(label);
        const isCustomerName = /customer|client/.test(label) && /name|signatory|signed|printed/.test(label);
        return hasSignerContext && isCustomerName;
      };

      const customerSigner = String(bestExtraction.header?.customer_signed_name || "").trim();
      for (const f of fieldArray) {
        if (!isCustomerSignerNameField(f)) continue;
        const confidence = bestExtraction.field_confidence?.[f.id];
        if (!customerSigner || (typeof confidence === "number" && confidence < 0.65)) {
          if (bestExtraction.extracted[f.id] !== undefined) {
            console.log(`Post-process: removed customer sign-off name field "${f.id}" because signer name was not confidently read`);
          }
          delete bestExtraction.extracted[f.id];
          bestExtraction.field_confidence = bestExtraction.field_confidence || {};
          bestExtraction.field_confidence[f.id] = Math.min(confidence ?? 0.4, 0.45);
        }
      }

      // LETTERHEAD GUARD: the sheet's own printed branding (paperwork_owner_company)
      // must NEVER surface as the customer / client / party value. If the model
      // has echoed the letterhead into header.customer or into any customer-ish
      // template field, blank it and flag low-confidence so the reviewer fills
      // it in from the handwritten customer entry (or leaves it blank).
      const normaliseCompany = (s: unknown) =>
        String(s ?? "")
          .toLowerCase()
          .replace(/https?:\/\//g, "")
          .replace(/^www\./, "")
          .replace(/\.(co\.uk|com|net|org|io|uk|ltd)\b/g, "")
          .replace(/\b(ltd|limited|plc|llp|inc|fire|protection|services|solutions|group|systems|company|co)\b\.?/g, "")
          .replace(/[^a-z0-9]/g, "");
      const letterhead = normaliseCompany(bestExtraction.header?.paperwork_owner_company);
      const collides = (candidate: unknown) => {
        if (!letterhead || letterhead.length < 3) return false;
        const c = normaliseCompany(candidate);
        if (!c || c.length < 3) return false;
        return c === letterhead || c.includes(letterhead) || letterhead.includes(c);
      };
      if (collides(bestExtraction.header?.customer)) {
        console.log(
          `Post-process: blanked header.customer ("${bestExtraction.header?.customer}") — matched letterhead paperwork_owner_company ("${bestExtraction.header?.paperwork_owner_company}")`,
        );
        bestExtraction.header.customer = "";
      }
      const isCustomerAnswerField = (field: any) => {
        const label = normaliseLabel(`${field.section || ""} ${field.label || ""}`);
        return /\b(customer|client)\b/.test(label) && !/site|address|postcode/.test(label);
      };
      for (const f of fieldArray) {
        if (!isCustomerAnswerField(f)) continue;
        if (collides(bestExtraction.extracted[f.id])) {
          console.log(
            `Post-process: cleared customer field "${f.id}" — value matched letterhead branding`,
          );
          delete bestExtraction.extracted[f.id];
          bestExtraction.field_confidence = bestExtraction.field_confidence || {};
          bestExtraction.field_confidence[f.id] = Math.min(
            bestExtraction.field_confidence[f.id] ?? 0.4,
            0.4,
          );
        }
      }

      const exposedOutletSections = new Set<string>();
      let hasExposedOutlets = false;
      for (const f of fieldArray) {
        const val = bestExtraction.extracted[f.id];
        if (containsExposedOutlets(val)) {
          hasExposedOutlets = true;
          const sectionKey = (f.section || "").trim().toLowerCase();
          if (sectionKey) exposedOutletSections.add(sectionKey);
        }
      }
      // Also do the consecutive-field rule
      for (let fi = 0; fi < fieldArray.length - 1; fi++) {
        const currentField = fieldArray[fi];
        const nextField = fieldArray[fi + 1];
        const currentVal = bestExtraction.extracted[currentField.id];
        const currentSection = (currentField.section || "").trim().toLowerCase();
        const nextSection = (nextField.section || "").trim().toLowerCase();
        const nextLooksRelated = /cabinet/i.test(nextField.label || "") || /outlet/i.test(nextField.label || "");
        if (
          containsExposedOutlets(currentVal) &&
          ((currentSection && currentSection === nextSection) || nextLooksRelated)
        ) {
          const nextVal = bestExtraction.extracted[nextField.id];
          if (!isNaEquivalent(nextVal)) {
            console.log(`Post-process: field "${nextField.id}" set to "n/a" because previous field "${currentField.id}" has EXPOSED OUTLETS`);
            bestExtraction.extracted[nextField.id] = "n/a";
          }
        }
      }
      // Force any cabinet-related field in an exposed-outlets section to n/a
      for (const f of fieldArray) {
        const sec = (f.section || "").trim().toLowerCase();
        const label = f.label || "";
        const shouldForceNa =
          (sec && exposedOutletSections.has(sec) && /cabinet/i.test(label)) ||
          (hasExposedOutlets && /outlet/i.test(label) && /cabinet/i.test(label));

        if (shouldForceNa && !isNaEquivalent(bestExtraction.extracted[f.id])) {
          console.log(`Post-process: cabinet field "${f.id}" set to "n/a" because exposed outlets were detected elsewhere on the sheet`);
          bestExtraction.extracted[f.id] = "n/a";
        }
      }

      const normalizedExtraction = {
        extracted: normalizeExtractedCheckboxValues(bestExtraction.extracted, fields),
        header: bestExtraction.header,
      };

      // Confidence: default any extracted field without an explicit score to 0.85
      // (a "we returned it but didn't score it" middle value) and any field the
      // model omitted stays absent — the reviewer treats absent as unanswered.
      const confidenceMap: Record<string, number> = { ...(bestExtraction.field_confidence || {}) };
      for (const key of Object.keys(normalizedExtraction.extracted)) {
        if (typeof confidenceMap[key] !== "number") {
          confidenceMap[key] = 0.85;
        }
      }

      return new Response(JSON.stringify({
        extracted: normalizedExtraction.extracted,
        header: normalizedExtraction.header,
        field_confidence: confidenceMap,
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
