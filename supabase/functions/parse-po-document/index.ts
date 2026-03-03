import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_base64, file_name } = await req.json();
    if (!file_base64 || !file_name) {
      return new Response(JSON.stringify({ error: "file_base64 and file_name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = file_name.slice(file_name.lastIndexOf(".")).toLowerCase();
    let userContent: any[];

    if (ext === ".pdf") {
      userContent = [
        {
          type: "text",
          text: `Extract purchase order / job details from this document (${file_name}). Return as a single JSON object with these exact fields.`,
        },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${file_base64}` } },
      ];
    } else {
      // docx / doc: extract text from the ZIP
      let extractedText = "";
      try {
        const fileBytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
        const { ZipReader, BlobReader, TextWriter } = await import("https://deno.land/x/zipjs@v2.7.34/index.js");
        const reader = new ZipReader(new BlobReader(new Blob([fileBytes])));
        const entries = await reader.getEntries();
        for (const entry of entries) {
          if (entry.filename === "word/document.xml") {
            extractedText = await entry.getData!(new TextWriter());
            break;
          }
        }
        await reader.close();
        extractedText = extractedText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } catch (e) {
        console.error("Failed to extract docx text:", e);
        extractedText = `[Could not extract text from ${file_name}]`;
      }

      if (!extractedText || extractedText.length < 10) {
        return new Response(JSON.stringify({ error: "Could not extract readable text from document" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userContent = [
        {
          type: "text",
          text: `Extract purchase order / job details from this document (${file_name}). Document text:\n\n${extractedText}\n\nReturn as a single JSON object with these exact fields.`,
        },
      ];
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You extract purchase order details from documents. Return a SINGLE JSON object (not an array) with these exact fields:
- customer_name: the name of the client / company who issued or sent the order. Look everywhere: letterhead, "From", "Bill To", "Client", "Company", "Ordered By", "Issued To", "Raised By". Even short abbreviations like "ABCA" or initials are valid company names — copy them exactly as written.
- contact_name: contact person name if present, else ""
- address: the site/delivery/work address (look for "Deliver To", "Site Address", "Work Location", "Ship To", NOT the issuing company address)
- po_number: purchase order number or reference number (look for "PO#", "PO Number", "Order No", "Reference", "Ref No")
- job_description: full description of the work or goods ordered — include as much detail as possible
- quantity: total quantity ordered as a number (look for "Qty", "Quantity", "Units", "No. of", default 1 if only one item and no quantity stated)
- due_date: required completion or delivery date in YYYY-MM-DD format, or "" if not found
- priority: "high", "medium", or "low" based on urgency language such as "urgent", "ASAP", "priority" (default "medium")
- total_value: numeric value of the PO if present (strip currency symbols), else null
- currency: currency code (e.g. "GBP", "USD", "EUR") detected from symbols £/$€ or explicit text, else ""
- notes: any other important instructions, special requirements, or notes

Rules:
- Extract ALL available information — do not leave fields empty if the information exists anywhere in the document
- Company/customer names can be abbreviations, acronyms, or short codes — always copy them verbatim
- Return ONLY the JSON object, no markdown, no explanation
- If a field is truly not found, use empty string "" or null for numeric fields`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to parse document with AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    const jsonStr = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();

    let extracted;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Could not extract structured data from document" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise: if AI returned an array, take first element
    if (Array.isArray(extracted)) extracted = extracted[0] || {};

    return new Response(JSON.stringify({ data: extracted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
