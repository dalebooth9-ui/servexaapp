import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { customer_id } = await req.json();
    if (!customer_id) {
      return new Response(JSON.stringify({ error: "Missing customer_id" }), { status: 400, headers: corsHeaders });
    }

    // Fetch customer
    const { data: customer } = await supabase.from("customers").select("*").eq("id", customer_id).single();
    if (!customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), { status: 404, headers: corsHeaders });
    }

    // Gather data from jobs
    const { data: jobs } = await supabase
      .from("jobs")
      .select("address, customer, name")
      .eq("customer_id", customer_id)
      .limit(50);

    // Gather data from linked sites
    const { data: customerSites } = await supabase
      .from("customer_sites")
      .select("site_id")
      .eq("customer_id", customer_id);

    let siteData: any[] = [];
    if (customerSites && customerSites.length > 0) {
      const siteIds = customerSites.map(cs => cs.site_id);
      const { data: sites } = await supabase
        .from("sites")
        .select("name, address, postcode, contact_email, contact_phone")
        .in("id", siteIds);
      if (sites) siteData = sites;
    }

    // Gather text from customer documents (extract file names as hints)
    const { data: docs } = await supabase
      .from("customer_documents")
      .select("file_name, file_url")
      .eq("customer_id", customer_id)
      .limit(30);

    // Try to extract text from PDF documents using AI vision
    let documentTexts: string[] = [];
    const pdfDocs = (docs || []).filter(d => d.file_name.toLowerCase().endsWith(".pdf")).slice(0, 5);
    
    for (const doc of pdfDocs) {
      try {
        const { data: fileData } = await supabase.storage.from("submissions").download(doc.file_url);
        if (fileData) {
          const buffer = await fileData.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer).slice(0, 500000)));
          documentTexts.push(`Document "${doc.file_name}": [PDF content available for analysis]`);
        }
      } catch {
        // Skip failed downloads
      }
    }

    // Build context for AI
    const missingFields: string[] = [];
    if (!customer.address) missingFields.push("address");
    if (!customer.email) missingFields.push("email");
    if (!customer.phone) missingFields.push("phone");

    if (missingFields.length === 0) {
      return new Response(JSON.stringify({ 
        message: "All contact fields are already populated",
        updates: {} 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const contextParts: string[] = [];
    contextParts.push(`Customer name: ${customer.name}`);
    if (customer.address) contextParts.push(`Current address: ${customer.address}`);
    if (customer.email) contextParts.push(`Current email: ${customer.email}`);
    if (customer.phone) contextParts.push(`Current phone: ${customer.phone}`);

    if (jobs && jobs.length > 0) {
      contextParts.push("\nJob records:");
      for (const j of jobs) {
        const parts = [];
        if (j.name) parts.push(`Job: ${j.name}`);
        if (j.address) parts.push(`Address: ${j.address}`);
        contextParts.push(`- ${parts.join(", ")}`);
      }
    }

    if (siteData.length > 0) {
      contextParts.push("\nLinked sites:");
      for (const s of siteData) {
        const parts = [];
        if (s.name) parts.push(`Site: ${s.name}`);
        if (s.address) parts.push(`Address: ${s.address}`);
        if (s.postcode) parts.push(`Postcode: ${s.postcode}`);
        if (s.contact_email) parts.push(`Email: ${s.contact_email}`);
        if (s.contact_phone) parts.push(`Phone: ${s.contact_phone}`);
        contextParts.push(`- ${parts.join(", ")}`);
      }
    }

    if (docs && docs.length > 0) {
      contextParts.push("\nDocument file names:");
      for (const d of docs) {
        contextParts.push(`- ${d.file_name}`);
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a data extraction assistant for a field service management system. Extract contact information for a customer from their associated data. Only return information you are highly confident about. Do not guess or fabricate data. UK format for phone numbers.`
          },
          {
            role: "user",
            content: `I need to find the missing contact details for this customer. Missing fields: ${missingFields.join(", ")}\n\nAvailable data:\n${contextParts.join("\n")}\n\nExtract the most likely ${missingFields.join(", ")} from the data above.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "update_customer_contact",
              description: "Update the customer's missing contact details based on extracted data",
              parameters: {
                type: "object",
                properties: {
                  address: { type: "string", description: "The customer's primary address. Only include if confident." },
                  email: { type: "string", description: "The customer's email address. Only include if confident." },
                  phone: { type: "string", description: "The customer's phone number. Only include if confident." },
                  confidence_notes: { type: "string", description: "Brief explanation of where each piece of data was found" }
                },
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "update_customer_contact" } }
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limited, please try again later" }), { status: 429, headers: corsHeaders });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ 
        message: "AI could not extract any contact details from the available data",
        updates: {} 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let extracted: any;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ 
        message: "Failed to parse AI response",
        updates: {} 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Only update fields that are currently missing
    const updates: Record<string, string> = {};
    if (!customer.address && extracted.address) updates.address = extracted.address;
    if (!customer.email && extracted.email) updates.email = extracted.email;
    if (!customer.phone && extracted.phone) updates.phone = extracted.phone;

    if (Object.keys(updates).length > 0) {
      await supabase.from("customers").update(updates).eq("id", customer_id);
    }

    return new Response(JSON.stringify({
      message: Object.keys(updates).length > 0 
        ? `Updated ${Object.keys(updates).join(", ")}` 
        : "No new details could be extracted",
      updates,
      confidence_notes: extracted.confidence_notes || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("ai-enrich-customer error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
