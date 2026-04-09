import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Companies House lookup ---
async function lookupCompaniesHouse(companyName: string, apiKey: string) {
  try {
    const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=3`;
    const encoded = btoa(apiKey + ":");
    console.log("CH auth header length:", encoded.length, "key starts with:", apiKey.substring(0, 4));
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + encoded },
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("Companies House search failed:", res.status, errBody);
      return null;
    }
    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) return null;

    // Pick the best match (first result)
    const match = items[0];
    const companyNumber = match.company_number;

    // Fetch full company profile for registered address
    const profileRes = await fetch(
      `https://api.company-information.service.gov.uk/company/${companyNumber}`,
      { headers: { Authorization: "Basic " + btoa(apiKey + ":") } }
    );
    if (!profileRes.ok) return null;
    const profile = await profileRes.json();

    const addr = profile.registered_office_address;
    if (!addr) return null;

    const parts = [
      addr.address_line_1,
      addr.address_line_2,
      addr.locality,
      addr.region,
      addr.postal_code,
    ].filter(Boolean);

    return {
      address: parts.join(", "),
      companyName: profile.company_name,
      companyNumber,
    };
  } catch (err) {
    console.error("Companies House lookup error:", err);
    return null;
  }
}

// --- AI web search for email/phone ---
async function aiWebSearch(
  companyName: string,
  missingFields: string[],
  apiKey: string
) {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a business contact lookup assistant. Only return real, verifiable information. If unsure, leave the field empty. UK phone format.",
          },
          {
            role: "user",
            content: `Find the following for the UK company "${companyName}": ${missingFields.join(", ")}. Search their official website and public directories.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "web_contact_results",
              description: "Return company contact details found online",
              parameters: {
                type: "object",
                properties: {
                  email: { type: "string", description: "Company contact email" },
                  phone: { type: "string", description: "Company phone number" },
                  source: { type: "string", description: "Where info was found" },
                },
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "web_contact_results" } },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return null;
  }
}

// --- AI extraction from internal data ---
async function aiExtractFromInternalData(
  customer: any,
  missingFields: string[],
  contextParts: string[],
  apiKey: string
) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a data extraction assistant. Extract the customer's OWN email and phone from internal records. Job/site addresses are WORK LOCATIONS, not the customer's address. Site contact emails/phones may belong to the customer. Only return high-confidence data. UK phone format.",
        },
        {
          role: "user",
          content: `Find missing fields (${missingFields.join(", ")}) for customer "${customer.name}".\n\n${contextParts.join("\n")}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "update_customer_contact",
            description: "Update missing customer contact details",
            parameters: {
              type: "object",
              properties: {
                email: { type: "string" },
                phone: { type: "string" },
                confidence_notes: { type: "string" },
              },
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "update_customer_contact" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw { status: 429, message: "AI rate limited" };
    if (res.status === 402) throw { status: 402, message: "AI credits exhausted" };
    throw { status: 500, message: "AI service error" };
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  return JSON.parse(toolCall.function.arguments);
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
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
    const {
      data: { user },
      error: authErr,
    } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { customer_id } = await req.json();
    if (!customer_id) {
      return new Response(JSON.stringify({ error: "Missing customer_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customer_id)
      .single();
    if (!customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const missingFields: string[] = [];
    if (!customer.address) missingFields.push("address");
    if (!customer.email) missingFields.push("email");
    if (!customer.phone) missingFields.push("phone");

    if (missingFields.length === 0) {
      return new Response(
        JSON.stringify({ message: "All contact fields are already populated", updates: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const updates: Record<string, string> = {};
    const notes: string[] = [];

    // Step 1: Companies House for address
    if (!customer.address) {
      const chKey = Deno.env.get("COMPANIES_HOUSE_API_KEY");
      if (chKey) {
        console.log(`Companies House lookup for "${customer.name}"`);
        const chResult = await lookupCompaniesHouse(customer.name, chKey);
        if (chResult?.address) {
          updates.address = chResult.address;
          notes.push(`Address from Companies House (${chResult.companyNumber})`);
        }
      }
    }

    // Step 2: Internal data extraction for email/phone
    const stillMissing = missingFields.filter(
      (f) => f === "address" ? !updates.address : true
    ).filter((f) => f !== "address"); // Only email/phone from internal data

    if (stillMissing.length > 0) {
      // Build context from jobs & sites
      const contextParts: string[] = [];
      const { data: customerSites } = await supabase
        .from("customer_sites")
        .select("site_id")
        .eq("customer_id", customer_id);

      if (customerSites && customerSites.length > 0) {
        const { data: sites } = await supabase
          .from("sites")
          .select("name, contact_email, contact_phone")
          .in("id", customerSites.map((cs) => cs.site_id));
        if (sites) {
          for (const s of sites) {
            const parts = [];
            if (s.name) parts.push(`Site: ${s.name}`);
            if (s.contact_email) parts.push(`Email: ${s.contact_email}`);
            if (s.contact_phone) parts.push(`Phone: ${s.contact_phone}`);
            if (parts.length) contextParts.push(`- ${parts.join(", ")}`);
          }
        }
      }

      try {
        const extracted = await aiExtractFromInternalData(
          customer,
          stillMissing,
          contextParts,
          LOVABLE_API_KEY
        );
        if (extracted) {
          if (!customer.email && extracted.email) {
            updates.email = extracted.email;
            notes.push("Email from internal records");
          }
          if (!customer.phone && extracted.phone) {
            updates.phone = extracted.phone;
            notes.push("Phone from internal records");
          }
        }
      } catch (e: any) {
        if (e.status) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: e.status,
            headers: corsHeaders,
          });
        }
      }
    }

    // Step 3: Web search fallback for anything still missing
    const finalMissing: string[] = [];
    if (!customer.address && !updates.address) finalMissing.push("address");
    if (!customer.email && !updates.email) finalMissing.push("email");
    if (!customer.phone && !updates.phone) finalMissing.push("phone");

    if (finalMissing.length > 0) {
      const webResult = await aiWebSearch(customer.name, finalMissing, LOVABLE_API_KEY);
      if (webResult) {
        if (!updates.address && webResult.address && finalMissing.includes("address")) {
          updates.address = webResult.address;
          notes.push(`Address from web (${webResult.source || "AI search"})`);
        }
        if (!updates.email && webResult.email && finalMissing.includes("email")) {
          updates.email = webResult.email;
          notes.push(`Email from web (${webResult.source || "AI search"})`);
        }
        if (!updates.phone && webResult.phone && finalMissing.includes("phone")) {
          updates.phone = webResult.phone;
          notes.push(`Phone from web (${webResult.source || "AI search"})`);
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("customers").update(updates).eq("id", customer_id);
    }

    return new Response(
      JSON.stringify({
        message:
          Object.keys(updates).length > 0
            ? `Updated ${Object.keys(updates).join(", ")}`
            : "No new details could be extracted",
        updates,
        confidence_notes: notes.join(". ") || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("ai-enrich-customer error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
