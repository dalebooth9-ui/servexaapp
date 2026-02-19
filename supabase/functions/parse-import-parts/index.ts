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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is authenticated
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

    let userContent: any;

    if (ext === ".pdf") {
      userContent = [
        { type: "text", text: `Extract all parts, materials, and components from this document (${file_name}). Return as a JSON array.` },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${file_base64}` } },
      ];
    } else if (ext === ".csv" || ext === ".txt") {
      let text = new TextDecoder().decode(Uint8Array.from(atob(file_base64), c => c.charCodeAt(0)));
      if (text.length > 60000) {
        text = text.slice(0, 60000) + "\n\n[TRUNCATED - file too large, showing first portion]";
      }
      userContent = `Extract all parts, materials, and components from this CSV/text data (${file_name}):\n\n${text}\n\nReturn as a JSON array.`;
    } else if (ext === ".xlsx" || ext === ".xls") {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
      const fileBytes = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
      const workbook = XLSX.read(fileBytes, { type: "array" });

      const sheetsText: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        if (csv.trim()) {
          sheetsText.push(`--- Sheet: ${sheetName} ---\n${csv}`);
        }
      }
      let combinedText = sheetsText.join("\n\n");

      if (!combinedText || combinedText.length < 5) {
        return new Response(JSON.stringify({ error: "Excel file appears to be empty" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (combinedText.length > 60000) {
        combinedText = combinedText.slice(0, 60000) + "\n\n[TRUNCATED]";
      }

      userContent = `Extract all parts, materials, and components from this spreadsheet data (${file_name}):\n\n${combinedText}\n\nReturn as a JSON array.`;
    } else {
      // .docx/.doc
      let extractedText = "";
      try {
        const fileBytes = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
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
        console.error("Failed to extract text from docx:", e);
        extractedText = `[Could not extract text from ${file_name}]`;
      }

      if (!extractedText || extractedText.length < 10) {
        return new Response(JSON.stringify({ error: "Could not extract readable text from document" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userContent = `Extract all parts, materials, and components from this document (${file_name}). The document text:\n\n${extractedText}\n\nReturn as a JSON array.`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You extract parts/materials data from documents. Return a JSON array of objects with these fields: name, quantity, unit_cost, sell_price, supplier, part_number, category, notes.
Rules:
- name: the part or material name (required)
- quantity: numeric quantity, default 1
- unit_cost: numeric cost per unit, default 0. Look for fields like "Cost per item", "cost", "wholesale price"
- sell_price: numeric selling price per unit, default 0. Look for fields like "Variant Price", "price", "retail price", "sell price"
- supplier: supplier or vendor name if available
- part_number: part number, SKU, or product code if available
- category: product category if available, default "general"
- notes: any extra info like specs, description, or other details
- Extract ALL parts/materials/components you can find
- If a field is not found, use the default
- Return ONLY the JSON array, no markdown, no explanation`
          },
          {
            role: "user",
            content: userContent,
          }
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
      return new Response(JSON.stringify({ error: `Failed to parse document with AI (${aiResponse.status})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    const jsonStr = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();

    let parts;
    try {
      parts = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Could not extract structured data from document" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(parts)) {
      parts = [parts];
    }

    return new Response(JSON.stringify({ parts }), {
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
