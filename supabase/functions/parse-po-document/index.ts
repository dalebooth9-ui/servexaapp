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

    const body = await req.json();
    // Accept either a single file (legacy) or an array of files (multi-page PO
    // spread across separate PDFs / photos of the same order).
    type InFile = { file_base64: string; file_name: string };
    const files: InFile[] = Array.isArray(body.files) && body.files.length > 0
      ? body.files
      : (body.file_base64 && body.file_name ? [{ file_base64: body.file_base64, file_name: body.file_name }] : []);
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "files (or file_base64 + file_name) required" }), {
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

    const mimeForImage = (ext: string): string => {
      switch (ext) {
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        case ".png": return "image/png";
        case ".webp": return "image/webp";
        case ".heic": return "image/heic";
        case ".heif": return "image/heif";
        default: return "application/octet-stream";
      }
    };

    const userContent: any[] = [
      {
        type: "text",
        text: files.length === 1
          ? `Extract purchase order / job details from this document (${files[0].file_name}). Return as a single JSON object with these exact fields, aggregating everything you can see.`
          : `The following ${files.length} files (in order) are pages / photos of ONE purchase order for a SINGLE job. Combine information across ALL of them and return ONE JSON object. Sum quantities across pages, gather line items, and reconcile the PO number, customer, and site address from wherever they appear.`,
      },
    ];

    for (const f of files) {
      const ext = f.file_name.slice(f.file_name.lastIndexOf(".")).toLowerCase();
      if (ext === ".pdf") {
        userContent.push({ type: "text", text: `--- File: ${f.file_name} (PDF) ---` });
        userContent.push({ type: "image_url", image_url: { url: `data:application/pdf;base64,${f.file_base64}` } });
      } else if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) {
        // Photographed paperwork — pass straight to the vision model. Gemini
        // 2.5 Pro handles skew / lighting well enough for typed POs.
        userContent.push({ type: "text", text: `--- File: ${f.file_name} (photo) ---` });
        userContent.push({ type: "image_url", image_url: { url: `data:${mimeForImage(ext)};base64,${f.file_base64}` } });
      } else if (ext === ".docx" || ext === ".doc") {
        let extractedText = "";
        try {
          const fileBytes = Uint8Array.from(atob(f.file_base64), (c) => c.charCodeAt(0));
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
          extractedText = `[Could not extract text from ${f.file_name}]`;
        }
        userContent.push({
          type: "text",
          text: `--- File: ${f.file_name} (Word) ---\n${extractedText || "[empty]"}`,
        });
      } else {
        userContent.push({ type: "text", text: `--- File: ${f.file_name} (unsupported type — skipped) ---` });
      }
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
- document_kind: classify the document type. One of:
    * "purchase_order" — issued BEFORE work is done: a PO number, line items, ordering party, delivery instructions, prices, no handwritten answers or ticked inspection boxes.
    * "job_sheet" — a COMPLETED paper job/inspection/service sheet: has printed section headings like "Visual Inspection", "Pressure Test", "Service Report", "Certificate of Inspection"; ticked yes/no/pass/fail boxes; handwritten answers; engineer/customer signature blocks. Even if a job/reference number is present, if the document records work already carried out, it is a job_sheet, NOT a purchase_order.
    * "unknown" — cannot determine confidently.
- document_kind_reason: one short sentence explaining the classification (visible printed titles, tick boxes, signatures, etc.).
- customer_name: the name of the client / company who issued or sent the order. Look everywhere: letterhead, "From", "Bill To", "Client", "Company", "Ordered By", "Issued To", "Raised By". Even short abbreviations like "ABCA" or initials are valid company names — copy them exactly as written.
- contact_name: contact person name if present, else ""
- address: the site/delivery/work address (look for "Deliver To", "Site Address", "Work Location", "Ship To", NOT the issuing company address)
- po_number: purchase order number or reference number (look for "PO#", "PO Number", "Order No", "Reference", "Ref No")
- job_description: full description of the work or goods ordered — include as much detail as possible
- quantity: total quantity ordered as a number (look for "Qty", "Quantity", "Units", "No. of", default 1 if only one item and no quantity stated)
- pressure_test_qty: number of items requiring pressure/hydraulic testing (look for "pressure test", "hydraulic test", "wet test", "annual test"). Sum across line items and across pages. Default 0.
- visual_qty: number of items requiring visual inspection only ("visual", "visual inspection", "visual check", "six month visual"). Default 0.
- other_qty: number of items for any other service type (installation, repair, survey, remedial). Default 0. If the document only states a single overall quantity with no service-type breakdown, put it here.
- other_service_type: short label describing the "other" service when other_qty > 0 (e.g. "Installation", "Repair", "Survey", "Remedial"), else ""
- systems: array describing each distinct system/riser/asset referenced (e.g. [{ "label": "Dry Riser 1", "service": "Pressure Test" }, ...]) — used to drive multi-copy site sheets. Include one entry per riser/system per service type. Empty array if the PO covers a single system.
- due_date: required completion or delivery date in YYYY-MM-DD format, or "" if not found
- priority: "high", "medium", or "low" based on urgency language such as "urgent", "ASAP", "priority" (default "medium")
- total_value: numeric value of the PO if present (strip currency symbols), else null
- currency: currency code (e.g. "GBP", "USD", "EUR") detected from symbols £/$€ or explicit text, else ""
- notes: any other important instructions, special requirements, or notes

Rules:
- Extract ALL available information — do not leave fields empty if the information exists anywhere in the document(s)
- When multiple files are provided, treat them as pages of ONE purchase order. Sum quantities, merge line items, reconcile the PO number/customer/site — return ONE aggregated object.
- Company/customer names can be abbreviations, acronyms, or short codes — always copy them verbatim
- Return ONLY the JSON object, no markdown, no explanation
- If a field is truly not found, use empty string "" or null for numeric fields, or 0 for quantity fields, or [] for arrays`,
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
