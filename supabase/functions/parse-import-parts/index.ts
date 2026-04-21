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
      
      // Pre-process CSV: strip HTML tags and trim large fields to reduce token count
      text = text.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ");
      
      // For Shopify-style CSVs, try to keep only relevant columns
      const lines = text.split("\n");
      if (lines.length > 1) {
        const header = lines[0].toLowerCase();
        // If it looks like a Shopify CSV with many irrelevant columns, simplify
        if (header.includes("handle") && header.includes("body") && header.includes("variant price")) {
          try {
            // Parse header to find relevant column indices
            const cols = lines[0].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
            const keepCols = ["handle", "title", "vendor", "variant sku", "variant price", "variant compare at price", "cost per item", "product category", "type", "tags", "variant barcode", "variant grams", "variant weight unit"];
            const keepIndices: number[] = [];
            cols.forEach((c, i) => {
              if (keepCols.some(k => c.toLowerCase().includes(k))) keepIndices.push(i);
            });
            
            if (keepIndices.length > 3) {
              const filteredLines = lines.map(line => {
                // Simple CSV field extraction (handles quoted fields with commas)
                const fields: string[] = [];
                let current = "";
                let inQuotes = false;
                for (const ch of line) {
                  if (ch === '"') { inQuotes = !inQuotes; }
                  else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ""; }
                  else { current += ch; }
                }
                fields.push(current.trim());
                return keepIndices.map(i => fields[i] || "").join(",");
              });
              // Filter out empty data rows (all commas)
              text = filteredLines.filter(l => l.replace(/,/g, "").trim().length > 0).join("\n");
            }
          } catch { /* fall through to raw text */ }
        }
      }
      
      if (text.length > 40000) {
        text = text.slice(0, 40000) + "\n\n[TRUNCATED]";
      }
      userContent = `Extract all parts, materials, and components from this CSV/text data (${file_name}):\n\n${text}\n\nReturn as a JSON array.`;
    } else if (ext === ".xlsx" || ext === ".xls") {
      // Use SheetJS — handles both legacy .xls (binary) and modern .xlsx (zip) formats.
      const fileBytes = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
      let combinedText = "";
      try {
        const XLSX = await import("npm:xlsx@0.18.5");
        const wb = XLSX.read(fileBytes, { type: "array" });
        const sheetsText: string[] = [];
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (csv.trim()) sheetsText.push(`=== Sheet: ${sheetName} ===\n${csv}`);
        }
        combinedText = sheetsText.join("\n\n");
      } catch (e) {
        console.error("Failed to parse Excel file:", e);
        return new Response(JSON.stringify({ error: "Could not read Excel file" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
            content: `You extract parts/materials data from documents. Return a JSON array of objects with these fields: name, quantity, unit_cost, china_cost, uk_cost, sell_price, supplier, part_number, category, notes.
Rules:
- name: the part or material name (required)
- quantity: numeric quantity, default 1
- unit_cost: numeric cost per unit, default 0. Look for fields like "Cost per item", "cost", "wholesale price", "unit cost"
- china_cost: numeric cost when sourced from China, default 0. Look for columns like "China", "China cost", "China price", "CN cost", "import cost"
- uk_cost: numeric cost when sourced from UK, default 0. Look for columns like "UK", "UK cost", "UK price", "local cost", "domestic cost"
- sell_price: numeric selling price per unit, default 0. Look for fields like "Variant Price", "price", "retail price", "sell price", "RRP"
- supplier: supplier or vendor name if available
- part_number: part number, SKU, or product code if available
- category: product category if available, default "general"
- notes: any extra info like specs, description, or other details
- Extract ALL parts/materials/components you can find
- If a field is not found, use the default value 0 for numeric fields
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
