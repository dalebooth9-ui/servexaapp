import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENTITY_PROMPTS: Record<string, string> = {
  customers: `Extract all customer/contact/company records. Return a JSON array with fields: name, email, phone, address. 
Rules: name is required. Use empty string for missing fields. Return ONLY the JSON array.`,
  assets: `Extract all asset/equipment/inventory records. Return a JSON array with fields: name, asset_tag, category, make, model, serial_number, status.
Rules: name is required. status must be operational/maintenance/faulty/decommissioned (default operational). Use empty string for missing fields. Return ONLY the JSON array.`,
  sites: `Extract all site/location/premises/building records. Return a JSON array with fields: name, address, postcode, site_type, contact_name, contact_phone, contact_email.
Rules: name is required. site_type must be one of: region, site, building, zone (default site). Use empty string for missing fields. Return ONLY the JSON array.`,
  site_document: `You are extracting site survey information from a fire suppression / sprinkler system document. A document may describe ONE physical site/building that contains MULTIPLE systems (e.g. System 1, System 2, System 3 — different risers or zones within the same address). Alternatively, the document may describe multiple entirely separate sites at different addresses.

Return a JSON array where EACH ELEMENT represents ONE PHYSICAL SITE/LOCATION. Each element has:
- customer_name: the name of the customer or company (string)
- site_name: the name of the site/building (string, derive from customer name + address if not explicit)
- site_address: the full address of this site (string)
- postcode: postcode/zip code (string, or empty)
- contact_name: contact person for this site (string, or empty)
- systems: an array of systems/zones at THIS site. Each system has:
  - system_name: label for this system (e.g. "System 1", "Zone A", "Sprinkler System") — if there is only one system, use "Main System"
  - outlets_count: number of outlets/heads for THIS system only (integer or null). Do NOT sum counts across systems.
  - riser_location: the riser/valve location for THIS system (string or null)

Rules:
- Do NOT extract comments, remarks, survey notes, or any free-text annotation fields.
- If all systems share the same address → ONE site entry with multiple systems in the systems array.
- If systems are at different addresses → separate site entries, each with their own systems array.
- Always return a JSON array (even for a single site).
- Return ONLY the JSON array, no markdown, no explanation.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { file_base64, file_name, entity_type } = await req.json();
    if (!file_base64 || !file_name || !entity_type) {
      return new Response(JSON.stringify({ error: "file_base64, file_name, and entity_type are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = ENTITY_PROMPTS[entity_type];
    if (!systemPrompt) return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ext = file_name.slice(file_name.lastIndexOf(".")).toLowerCase();
    const fileBytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));

    let userContent: any[];

    if (ext === ".pdf") {
      userContent = [
        { type: "text", text: `Extract records from this document (${file_name}).` },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${file_base64}` } },
      ];
    } else {
      let extractedText = "";
      try {
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
        extractedText = `[Could not extract text from ${file_name}]`;
      }

      if (!extractedText || extractedText.length < 10) {
        return new Response(JSON.stringify({ error: "Could not extract readable text from document" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      userContent = [{ type: "text", text: `Extract records from this document (${file_name}):\n\n${extractedText}` }];
    }

    // Retry logic for transient errors (502, 503, 504)
    let aiResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
        }),
      });
      if (aiResponse.ok || (aiResponse.status !== 502 && aiResponse.status !== 503 && aiResponse.status !== 504)) break;
      console.warn(`AI gateway returned ${aiResponse.status}, retry ${attempt + 1}/3`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (!aiResponse || !aiResponse.ok) {
      const errText = aiResponse ? await aiResponse.text() : "no response";
      console.error("AI error:", aiResponse?.status, errText);
      if (aiResponse?.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse?.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Failed to parse document with AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    // Robust JSON extraction
    let records;
    try {
      let cleaned = content.replace(/```json?\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonStart = cleaned.search(/[\{\[]/);
      const bracketChar = jsonStart !== -1 ? cleaned[jsonStart] : "[";
      const jsonEnd = cleaned.lastIndexOf(bracketChar === "[" ? "]" : "}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      try {
        records = JSON.parse(cleaned);
      } catch {
        cleaned = cleaned
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, "")
          // Fix AI returning > instead of } (unicode \u003e corruption)
          .replace(/>\s*,/g, "},")
          .replace(/>\s*\]/g, "}]")
          .replace(/>\s*$/g, "}");
        records = JSON.parse(cleaned);
      }
    } catch {
      console.error("JSON parse failed, raw content:", content.substring(0, 500));
      return new Response(JSON.stringify({ error: "Could not extract structured data from document" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // site_document returns a single object; others return arrays
    if (entity_type !== "site_document" && !Array.isArray(records)) records = [records];

    return new Response(JSON.stringify({ records }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
