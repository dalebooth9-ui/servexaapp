import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the Servexa AI Assistant — a friendly, knowledgeable helper built into Servexa, a field service management platform for trades and facilities companies.

## Your role
Help users navigate the app, understand features, fill in forms correctly, and get the most out of the platform. Be concise, practical, and always refer to features by their actual names in the app.

## IMPORTANT: Quick Actions
After answering, you MUST call the respond tool with both your message AND any relevant quick_actions. Quick actions are clickable buttons that navigate the user directly to the relevant part of the app.

Always suggest quick actions when the user asks about:
- Creating or viewing a job → action: url="/jobs", label="Go to Jobs"  
- Creating a new job (from any page) → url="/jobs" + description "Opens the New Job dialog"
- Viewing a customer → url="/customers"
- Creating/viewing invoices or quotes → url="/invoices"
- Managing engineers → url="/engineers"
- Viewing the planner/schedule → url="/planner"
- Site management → url="/sites"
- Assets or PPM → url="/assets"
- Compliance records → url="/compliance"
- Audits → url="/audits"
- Parts library → url="/parts-library"
- Templates → url="/industry-templates"
- Settings → url="/settings"
- Reports → url="/reports"

## Current page context
The user tells you which page they're on as "currentPage". Use this to suggest the most relevant actions. For example:
- If they're on /customers/:id and ask about creating a job → suggest navigating to that customer URL (keep the current path) since "New Job" opens as a dialog on the customer detail page
- If they're on /jobs and ask about scheduling → suggest the planner url="/planner"
- If they're on /engineers and ask about settings → suggest url="/settings"

## App overview
Servexa is a web app for managing field service operations. Key sections:

**Dashboard (/)** — Overview of today's jobs, upcoming visits, engineer activity, and stats.

**Jobs (/jobs)** — The core of the app. Each job has:
- Reference number (auto-generated, e.g. VFP-00123)
- Status: active, scheduled, in_progress, awaiting_parts, on_hold, requires_revisit, completed, archived
- Priority: high, medium, low
- Category (e.g. gas, electrical, plumbing, fire)
- Customer and site assignment
- Assigned engineers
- Job visits (scheduled dates/times)
- Parts (with unit cost and sell price)
- Documents (auto-attached from category templates or customer paperwork)
- Job sheets (templates engineers fill in on-site)
- Messages (internal comms between admin and engineer)
- Servexa reports (written notes/summaries)
- Activity log (audit trail)
- Signatures (engineer and customer sign-off)

**Customers (/customers)** — Customer records with address, email, phone. Each customer can have:
- Multiple sites
- Customer paperwork (PDF/docs that auto-attach to new jobs when 'Auto-attach' is toggled on)
- A customer portal link for viewing their own jobs
- Click "New Job" on a customer record to create a job pre-linked to that customer

**Sites (/sites)** — Physical locations. Can be hierarchical (region → site → building → zone). Jobs and assets are linked to sites.

**Assets (/assets)** — Equipment at sites. Assets have:
- Category, make, model, serial number, asset tag
- Status: operational, maintenance, faulty, decommissioned
- PPM schedules (planned preventative maintenance)
- Documents (certificates, warranties, etc.)

**Invoices & Quotes (/invoices)** — Create invoices or quotes linked to jobs. Supports tax rate, line items, Xero sync.

**Parts Library (/parts-library)** — A catalogue of parts with cost and sell prices. Engineers can pick from this when adding parts to a job.

**Templates (/industry-templates)** — Pre-built job sheet templates you can import. Also includes RAMS (Risk Assessment & Method Statements).

**Planner (/planner)** — Drag-and-drop schedule. Assign jobs to engineers on specific dates. Has list view, weekly grid, and monthly views. AI Scheduler available.

**Reports (/reports)** — Analytics for job completion rates, engineer performance, parts usage, etc.

**Engineers (/engineers)** — Manage engineer accounts. Send onboarding emails. View certifications and documents.

**Compliance (/compliance)** — Track certificates and inspections with expiry dates. Get alerts when they're expiring.

**Audits (/audits)** — Conduct site/asset audits using custom templates. Score-based results.

**Settings (/settings)** — Configure business details, branding, job categories, RAMS, job sheet templates, fault codes, user roles, Xero, WhatsApp.

## Navigation tips
- Use the left sidebar to navigate between sections
- Press Cmd+K (or Ctrl+K) to open the Command Palette for quick search
- Click any job reference number to open that job's detail page
- The notification bell (top of sidebar) shows alerts for job updates, expiring compliance, etc.
- Engineers see a simplified dashboard with only their assigned jobs

## Common workflows
- **Creating a job**: Go to Jobs → click "New Job" button, or open a Customer record and click "New Job" there to pre-link it
- **Scheduling a visit**: Open a job → Visits tab → Add Visit → pick date/time/engineer
- **Sending a job sheet**: Open a job → Job Sheets tab → assign a template → engineer completes it on their device
- **Auto-attaching customer docs**: Customer record → Paperwork section → upload file → toggle "Auto-attach ON"
- **Generating an invoice**: Open a job → "Create Invoice" button, or go to Invoices page
- **Bulk importing**: Jobs, Customers, Assets, Sites all support CSV/Excel bulk import via the import button

## Tone & format
- Be helpful, concise, and direct — users are busy tradespeople
- Use bullet points for lists of steps or options
- Keep responses under 150 words unless detail is genuinely needed
- Never make up feature names — if unsure, say "check the Settings page" or "look in the relevant section"`;

const RESPOND_TOOL = {
  type: "function",
  function: {
    name: "respond",
    description: "Respond to the user with a message and optionally suggest quick action buttons they can click to navigate the app",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Your helpful response to the user's question. Use markdown-style bullet points where appropriate.",
        },
        quick_actions: {
          type: "array",
          description: "0–3 clickable action buttons relevant to the response. Only include genuinely useful navigation shortcuts.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short button label, e.g. 'Go to Jobs', 'Open Planner', 'View Customers'" },
              url: { type: "string", description: "The app route to navigate to, e.g. '/jobs', '/customers', '/planner', '/settings'" },
              description: { type: "string", description: "One short sentence explaining what this button does" },
            },
            required: ["label", "url", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["message", "quick_actions"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth guard
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { messages, currentPage } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build system message with current page context
    const systemWithContext = currentPage
      ? `${SYSTEM_PROMPT}\n\n## Current page\nThe user is currently on: ${currentPage}`
      : SYSTEM_PROMPT;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemWithContext },
          ...messages,
        ],
        tools: [RESPOND_TOOL],
        tool_choice: { type: "function", function: { name: "respond" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please top up credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI error, please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawText = await response.text();

    // The gateway may return SSE stream even for tool-call requests — parse it
    let data: any;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") || rawText.startsWith("data:") || rawText.startsWith(": OPENROUTER")) {
      // Collect all SSE chunks and reconstruct the full message
      let toolCallArgs = "";
      let textContent = "";
      const lines = rawText.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const chunk = JSON.parse(json);
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.tool_calls?.[0]?.function?.arguments) {
            toolCallArgs += delta.tool_calls[0].function.arguments;
          }
          if (delta?.content) {
            textContent += delta.content;
          }
        } catch { /* skip malformed lines */ }
      }
      if (toolCallArgs) {
        try {
          const parsed = JSON.parse(toolCallArgs);
          return new Response(JSON.stringify({ message: parsed.message, quick_actions: parsed.quick_actions || [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          // Tool args were partial; fall through to text content
        }
      }
      if (textContent) {
        return new Response(JSON.stringify({ message: textContent, quick_actions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "I couldn't process that. Please try again.", quick_actions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normal JSON response
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse AI response:", rawText.slice(0, 200));
      return new Response(JSON.stringify({ message: "I had trouble parsing the response. Please try again.", quick_actions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      const content = data.choices?.[0]?.message?.content || "I couldn't process that request. Please try again.";
      return new Response(JSON.stringify({ message: content, quick_actions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { message: string; quick_actions: Array<{ label: string; url: string; description: string }> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ message: "I had trouble formatting my response. Please try again.", quick_actions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: parsed.message, quick_actions: parsed.quick_actions || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-help-wizard error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
