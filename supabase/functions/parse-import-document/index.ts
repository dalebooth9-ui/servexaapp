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
    // Verify caller is admin
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

    // Build messages based on file type
    let userContent: any[];

    if (ext === ".pdf") {
      // Gemini supports PDF inline
      userContent = [
        { type: "text", text: `Extract all job/drop entries from this document (${file_name}). Return as a JSON array.` },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${file_base64}` } },
      ];
    } else {
      // .docx/.doc - extract text from the ZIP (docx is a ZIP containing XML)
      let extractedText = "";
      try {
        // Use Deno's built-in JSZip-like approach: docx is a zip, word/document.xml has the content
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
        // Strip XML tags to get plain text
        extractedText = extractedText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } catch (e) {
        console.error("Failed to extract text from docx:", e);
        // Fallback: try sending raw base64 as text context
        extractedText = `[Could not extract text from ${file_name}]`;
      }

      if (!extractedText || extractedText.length < 10) {
        return new Response(JSON.stringify({ error: "Could not extract readable text from document" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userContent = [
        { type: "text", text: `Extract all job/drop entries from this document (${file_name}). The document text content is:\n\n${extractedText}\n\nReturn as a JSON array.` },
      ];
    }

    // Use Gemini to extract structured job data from the document
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
            content: `You extract job/drop data from documents. Return a JSON array of objects with these fields: customer, name, reference_number, address, priority, category. 
Rules:
- priority must be "high", "medium", or "low" (default "medium")
- category defaults to "general"
- Extract ALL jobs/drops/entries you can find in the document
- If a field is not found, use empty string
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
      return new Response(JSON.stringify({ error: "Failed to parse document with AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    // Parse the JSON from AI response, stripping markdown fences if present
    const jsonStr = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    let jobs;
    try {
      jobs = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Could not extract structured data from document" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(jobs)) {
      jobs = [jobs];
    }

    return new Response(JSON.stringify({ jobs }), {
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
