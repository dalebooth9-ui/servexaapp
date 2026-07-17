// Parse a historic report file (PDF / DOCX / image) and extract the
// metadata needed for bulk-importing legacy pre-Servexa reports:
// customer, site/address, report date, and report type.
//
// Returns { data: { customer_name, site_address, report_date, report_type,
// report_type_label, confidence, notes } } — the client then matches
// customer/site fuzzily and writes historic_reports rows on confirm.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const {
      file_base64,
      file_name,
      report_type_hints,
    }: {
      file_base64: string;
      file_name: string;
      report_type_hints?: string[];
    } = await req.json();

    if (!file_base64 || !file_name) {
      return json({ error: "file_base64 and file_name are required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const ext = file_name.slice(file_name.lastIndexOf(".")).toLowerCase();

    let userContent: any[];
    if (ext === ".pdf") {
      userContent = [
        {
          type: "text",
          text:
            `Extract report metadata from this historic report file. Filename: "${file_name}".`,
        },
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${file_base64}` },
        },
      ];
    } else if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"].includes(ext)) {
      const mime = ext === ".jpg" ? "image/jpeg" : `image/${ext.slice(1)}`;
      userContent = [
        {
          type: "text",
          text:
            `Extract report metadata from this scanned historic report image. Filename: "${file_name}".`,
        },
        {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${file_base64}` },
        },
      ];
    } else if (ext === ".docx" || ext === ".doc") {
      let extractedText = "";
      try {
        const bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
        const { ZipReader, BlobReader, TextWriter } = await import(
          "https://deno.land/x/zipjs@v2.7.34/index.js"
        );
        const reader = new ZipReader(new BlobReader(new Blob([bytes])));
        const entries = await reader.getEntries();
        for (const entry of entries) {
          if (entry.filename === "word/document.xml") {
            extractedText = await entry.getData!(new TextWriter());
            break;
          }
        }
        await reader.close();
        extractedText = extractedText
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      } catch (e) {
        console.error("docx extraction failed:", e);
      }
      if (!extractedText || extractedText.length < 20) {
        // Fall back to filename-only extraction so we don't drop the row.
        extractedText = "[Could not read document body — infer from filename only]";
      }
      userContent = [
        {
          type: "text",
          text:
            `Extract report metadata. Filename: "${file_name}". Document text:\n\n${extractedText}`,
        },
      ];
    } else {
      // Unknown extension — use filename only.
      userContent = [
        {
          type: "text",
          text:
            `Extract report metadata using only the filename (no file body available). Filename: "${file_name}".`,
        },
      ];
    }

    const hintList = (report_type_hints || []).slice(0, 40).join(", ");

    const systemPrompt =
      `You extract metadata from historic fire-safety inspection / service reports (dry riser visual, dry riser pressure test, wet riser, sprinkler, hydrant, fire alarm, emergency lighting, extinguisher service, etc.) for bulk import into a jobs system.

Return a SINGLE JSON object with these exact fields:
- customer_name: the customer / end-client company the report was carried out for (NOT the servicing contractor). If not found, "".
- site_address: the site/property the report covers — building name, street, town, postcode as much as available. If not found, "".
- report_date: the date of the inspection or test in YYYY-MM-DD. If only month/year known, use YYYY-MM-01. If unknown, "".
- report_type: a short slug from this list when possible: dry_riser_visual, dry_riser_pressure_test, wet_riser, sprinkler, hydrant, fire_alarm, emergency_lighting, extinguisher, smoke_vent, fire_door, ppm, service_report, other.
- report_type_label: human-readable label matching report_type (e.g. "Dry Riser Pressure Test").
- confidence: "high" | "medium" | "low" — your overall confidence in the extraction.
- notes: any other short context that would help matching (max 200 chars).

Known report-type hints from this organisation's templates (prefer matching one of these when reasonable): ${hintList || "none"}.

Rules:
- Use both the filename and the document body. Filenames often carry customer name and date.
- Never invent data. Empty string is better than a guess.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return json({ error: "Rate limit exceeded — please retry in a moment." }, 429);
      }
      if (aiResponse.status === 402) {
        return json({ error: "AI credits exhausted — please add credits." }, 402);
      }
      return json({ error: "Failed to parse historic report" }, 500);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();

    let extracted: any = {};
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Bad AI JSON:", content);
      return json({ error: "Could not parse AI response" }, 422);
    }
    if (Array.isArray(extracted)) extracted = extracted[0] || {};

    return json({ data: extracted }, 200);
  } catch (err) {
    console.error("parse-historic-report error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
