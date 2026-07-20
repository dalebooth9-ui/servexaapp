import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Grounded system prompt. All product knowledge comes from the help_articles
// table injected below as ## KNOWLEDGE. The model must NOT invent features.
const SYSTEM_PROMPT = `You are the Servexa in-app Help Assistant.

STRICT RULES — you MUST follow all of them:
1. Answer ONLY using the KNOWLEDGE section below. It is the single source of truth for how the app works.
2. Give numbered step-by-step instructions. Quote the exact button, tab and menu labels shown in KNOWLEDGE (e.g. "Click **New Job**"), never paraphrase them.
3. If the answer is NOT covered in KNOWLEDGE, reply exactly:
   "I don't have that in my help notes yet — raise a ticket and the Servexa team will add it."
   AND include ONE quick_action with url "#raise-support" labelled "Raise a support ticket" — the app will open the support form pre-filled with the user's question.
   Do NOT guess, do NOT describe features that aren't listed.
4. Keep answers short — under ~8 short lines unless the user explicitly asks for more detail.
5. Prefer instructions relevant to the user's CURRENT PAGE (shown below).
6. When suggesting a screen the user should navigate to, also emit a quick_action so they can jump straight there.

Format: brief intro line, then numbered steps, then optional 1-line tip.`;

const RESPOND_TOOL = {
  type: "function",
  function: {
    name: "respond",
    description: "Respond to the user with a grounded, numbered how-to answer and optional quick action buttons.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The grounded response. Numbered steps. Uses exact labels from KNOWLEDGE." },
        quick_actions: {
          type: "array",
          description: "0-3 clickable navigation buttons for pages mentioned in the answer.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              url: { type: "string" },
              description: { type: "string" },
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

function renderArticle(a: any): string {
  const steps = Array.isArray(a.steps) ? a.steps.map((g: any) => {
    const items = (g.items || []).map((s: string, i: number) => `  ${i + 1}. ${s}`).join("\n");
    return `- ${g.heading}:\n${items}`;
  }).join("\n") : "";
  const problems = Array.isArray(a.common_problems) ? a.common_problems.map((p: any) => `- Problem: ${p.problem}\n  Fix: ${p.fix}`).join("\n") : "";
  return `### ${a.title}  [slug: ${a.slug}${a.route_pattern ? ` — route ${a.route_pattern}` : ""}]
Purpose: ${a.purpose}
Steps:
${steps}
${problems ? `Common problems:\n${problems}` : ""}
Related: ${(a.related_slugs || []).join(", ") || "(none)"}
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const token = authHeader.replace("Bearer ", "");

  // Auth check using anon-scoped client with the user token
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { messages, currentPage, currentSlug } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Service-role read of help_articles (help content is not tenant-scoped).
    const supabaseSvc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load current article + related, then fill up to ~8 total articles for context.
    let current: any = null;
    let related: any[] = [];
    if (currentSlug) {
      const { data } = await supabaseSvc.from("help_articles").select("*").eq("slug", currentSlug).maybeSingle();
      current = data;
      const relatedSlugs = (current?.related_slugs as string[] | null) || [];
      if (relatedSlugs.length) {
        const { data: rel } = await supabaseSvc.from("help_articles").select("*").in("slug", relatedSlugs);
        related = rel || [];
      }
    }

    // Add a small selection of "core" articles so cross-topic questions still work.
    const coreSlugs = ["dashboard", "jobs", "jobs.create", "planner", "settings", "archive", "billing"];
    const { data: core } = await supabaseSvc.from("help_articles").select("*").in("slug", coreSlugs);

    const seen = new Set<string>();
    const picked: any[] = [];
    for (const a of [current, ...related, ...(core || [])]) {
      if (!a || seen.has(a.slug)) continue;
      seen.add(a.slug);
      picked.push(a);
      if (picked.length >= 8) break;
    }

    const knowledge = picked.length
      ? picked.map(renderArticle).join("\n---\n")
      : "(no articles loaded — reply with the fallback message from Rule 3.)";

    const systemWithContext = `${SYSTEM_PROMPT}

## CURRENT PAGE
${currentPage || "(unknown)"} — help slug: ${currentSlug || "(none)"}

## KNOWLEDGE
${knowledge}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemWithContext },
          ...(messages || []),
        ],
        tools: [RESPOND_TOOL],
        tool_choice: { type: "function", function: { name: "respond" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI usage limit reached. Please top up credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI error, please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawText = await response.text();

    // Handle SSE vs JSON responses.
    let toolArgs = "";
    let textContent = "";
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") || rawText.startsWith("data:") || rawText.startsWith(": OPENROUTER")) {
      for (const line of rawText.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") continue;
        try {
          const chunk = JSON.parse(json);
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.tool_calls?.[0]?.function?.arguments) toolArgs += delta.tool_calls[0].function.arguments;
          if (delta?.content) textContent += delta.content;
        } catch { /* skip */ }
      }
    } else {
      try {
        const data = JSON.parse(rawText);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) toolArgs = toolCall.function.arguments;
        else textContent = data.choices?.[0]?.message?.content || "";
      } catch {
        console.error("Failed to parse AI response:", rawText.slice(0, 200));
      }
    }

    if (toolArgs) {
      try {
        const parsed = JSON.parse(toolArgs);
        return new Response(JSON.stringify({ message: parsed.message, quick_actions: parsed.quick_actions || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch { /* fall through */ }
    }

    return new Response(JSON.stringify({
      message: textContent || "I don't have that in my help notes yet — raise a ticket and the Servexa team will add it.",
      quick_actions: textContent ? [] : [{ label: "Raise a support ticket", url: "#raise-support", description: "Open the support & feedback form pre-filled with your question." }],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("ai-help-wizard error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
