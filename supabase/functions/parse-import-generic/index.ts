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
  site_document: `You are extracting site survey information from a document. The document may describe ONE or MULTIPLE distinct systems/sites (e.g. separate pages or sections for different addresses or system labels). Extract EACH system as a separate entry. Return a JSON array where each element is one system/site with these fields:
- customer_name: the name of the customer or company
- site_address: the full site address for this specific system
- outlets_count: the number of outlets for THIS specific system only (integer, or null if not found). Do NOT add up counts from other systems.
- riser_location: the riser location for THIS specific system (or null if not found)
- site_name: a suitable name for this site/system (derive from customer name + address or system label if not explicit)
- postcode: postcode/zip code if present (or empty string)
- contact_name: contact person name if present (or empty string)
- notes: any other relevant site notes for this system
If there is only one system, still return a JSON array with one element.
Return ONLY the JSON array, no markdown.`,
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

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Failed to parse document with AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    const jsonStr = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    let records;
    try {
      records = JSON.parse(jsonStr);
    } catch {
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
