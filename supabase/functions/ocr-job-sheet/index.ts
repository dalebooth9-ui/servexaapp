import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_base64, mime_type, template_name, fields } = await req.json();
    
    if (!image_base64 || !fields) {
      return new Response(JSON.stringify({ error: "Missing image or fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build the extraction prompt
    const fieldList = fields.map((f: any) => {
      let desc = `- "${f.id}" (label: "${f.label}", type: ${f.type})`;
      if (f.type === "pass_fail") desc += ` — value must be "pass", "fail", or "n/a"`;
      if (f.type === "checkbox") desc += ` — value must be true or false`;
      if (f.options?.length) desc += ` — options: ${f.options.join(", ")}`;
      return desc;
    }).join("\n");

    const systemPrompt = `You are an expert OCR system that reads handwritten job sheet forms. You extract data from photos of filled-in inspection/service sheets and return structured JSON matching the template fields.

Rules:
- Return ONLY a JSON object with two top-level keys: "header" and "fields"
- "header" must contain these keys (use empty string if not found/readable):
  - "customer": the customer or client name
  - "site": the site name and/or address
  - "date": the date on the form
  - "po_ref": the PO number, reference number, or job reference
  - "riser_location": the riser location if present
- "fields" must be a JSON object with field IDs as keys and extracted values
- For pass_fail fields, determine if the mark indicates "pass", "fail", or "n/a"
- For checkbox fields, return true or false
- For text/number fields, transcribe the handwritten text as accurately as possible
- If a field appears blank or unreadable, omit it from the response
- Do not include any explanation, only the JSON object`;

    const userPrompt = `This is a photo of a filled-in "${template_name}" job sheet form.

First, extract the header information (Customer, Site/Address, Date, PO/REF, Riser Location) from the top of the form.

Then extract the handwritten values for these template fields:
${fieldList}

Return a JSON object with "header" and "fields" keys.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: `data:${mime_type || "image/jpeg"};base64,${image_base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    // Parse JSON from the response (handle markdown code blocks)
    let parsed: any = {};
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = (jsonMatch[1] || content).trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response as JSON:", content);
      return new Response(JSON.stringify({ error: "Could not parse handwriting", raw: content }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Support both old format (flat fields) and new format (header + fields)
    const extracted = parsed.fields || parsed;
    const header = parsed.header || {};

    return new Response(JSON.stringify({ extracted, header }), {
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
