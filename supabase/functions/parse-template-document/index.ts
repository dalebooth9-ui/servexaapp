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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
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
    const fileBytes = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));

    let userContent: any[];

    if (ext === ".pdf") {
      userContent = [
        { type: "text", text: `Analyze this job sheet / report template document (${file_name}) and extract all form fields that an engineer would need to fill in on-site. Return a JSON array of field objects.` },
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
        console.error("Failed to extract text from docx:", e);
        extractedText = `[Could not extract text from ${file_name}]`;
      }

      if (!extractedText || extractedText.length < 10) {
        return new Response(JSON.stringify({ error: "Could not extract readable text from document" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userContent = [
        { type: "text", text: `Analyze this job sheet / report template document (${file_name}). The document text content is:\n\n${extractedText}\n\nExtract all form fields that an engineer would need to fill in on-site. Return a JSON array of field objects.` },
      ];
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
            content: `You extract form fields from job sheet and report template documents. Analyze the document and identify every field, question, or input area that an engineer would fill in on-site.

Return a JSON array of field objects. Each field must have:
- "id": a unique snake_case identifier (e.g. "site_address", "gas_pressure_reading")
- "label": the human-readable field label as it appears in the document
- "type": one of "text", "number", "date", "checkbox", "pass_fail", "select", "textarea", "photo"
- "required": boolean, true if the field seems mandatory
- "section": a group/section name if the document has sections (e.g. "Site Details", "Safety Checks")
- "options": array of strings ONLY if type is "select" (dropdown choices)
- "placeholder": optional hint text

Guidelines:
- Yes/No questions → type "checkbox"
- Pass/Fail items → type "pass_fail" (NOT select)
- Long text / notes / comments → type "textarea"
- Readings, measurements, quantities → type "number"
- Dates → type "date"
- Photo/image fields → type "photo"
- Short text entries → type "text"
- Group related fields under the same section
- Preserve the order as they appear in the document
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
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to parse template with AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    const jsonStr = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();

    let fields;
    try {
      fields = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Could not extract form fields from document" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(fields)) {
      fields = [fields];
    }

    return new Response(JSON.stringify({ fields }), {
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
