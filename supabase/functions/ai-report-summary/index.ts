import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM = `You write a short customer-facing SUMMARY paragraph for a completed UK fire-protection service report.

You are given the report's actual answers (question -> answer) and any recorded defects. Those are the ONLY facts that exist.

HARD RULES:
1. Use ONLY the supplied answers and defect records. Never invent a finding, a measurement, a location, a date, a person or a recommendation that is not supported by them.
2. Never add a severity judgement, risk rating or compliance verdict that the answers do not already state.
3. If there are no adverse findings (no fails, no defects, no negative answers), say so plainly in one or two sentences — do not manufacture caveats.
4. Mention defects with the location stated in the record, exactly as recorded.
5. Recommended actions may only restate remedial actions already implied by a recorded defect or a failed/negative answer (e.g. "the outlet padlock noted at Level 2 requires replacement"). If none, omit recommendations.
6. 3 to 5 sentences maximum. Plain, professional British English, third person, no bullet points, no headings, no markdown.
7. Do not repeat the customer or site name more than once, and do not restate the whole checklist.
8. If the supplied answers are too sparse to summarise, return a single sentence saying the report was completed and refer the reader to the detail below.

Return the paragraph only.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsError } = await db.auth.getClaims(token);
  if (claimsError || !claims?.claims) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const templateName = String(body?.template_name || "Service report").slice(0, 200);
    const context = {
      customer: body?.context?.customer ? String(body.context.customer).slice(0, 200) : null,
      site: body?.context?.site ? String(body.context.site).slice(0, 300) : null,
      date: body?.context?.date ? String(body.context.date).slice(0, 40) : null,
    };
    const answers: Array<{ label: string; value: string }> = Array.isArray(body?.answers)
      ? body.answers
          .map((a: any) => ({
            label: String(a?.label ?? "").slice(0, 200).trim(),
            value: String(a?.value ?? "").slice(0, 600).trim(),
          }))
          .filter((a: any) => a.label && a.value)
          .slice(0, 200)
      : [];
    const defects: Array<{ title: string; location?: string; notes?: string }> = Array.isArray(body?.defects)
      ? body.defects
          .map((d: any) => ({
            title: String(d?.title ?? "").slice(0, 300).trim(),
            location: d?.location ? String(d.location).slice(0, 200).trim() : "",
            notes: d?.notes ? String(d.notes).slice(0, 500).trim() : "",
          }))
          .filter((d: any) => d.title)
          .slice(0, 50)
      : [];

    if (answers.length === 0 && defects.length === 0) {
      return json({ error: "This report has no completed answers to summarise yet." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured." }, 500);

    const facts = [
      `## REPORT\ntype: ${templateName}`,
      context.customer ? `customer: ${context.customer}` : null,
      context.site ? `site: ${context.site}` : null,
      context.date ? `date: ${context.date}` : null,
      `\n## ANSWERS\n${answers.map((a) => `${a.label}: ${a.value}`).join("\n") || "(none recorded)"}`,
      `\n## DEFECTS RECORDED\n${
        defects.length
          ? defects
              .map((d) => [d.title, d.location ? `location: ${d.location}` : null, d.notes ? `notes: ${d.notes}` : null].filter(Boolean).join(" | "))
              .join("\n")
          : "(none recorded)"
      }`,
    ]
      .filter(Boolean)
      .join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: facts },
        ],
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "The AI is busy right now. Please try again in a moment." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits have run out. Top up to keep using AI summaries." }, 402);
      console.error("gateway error", aiResp.status, await aiResp.text());
      return json({ error: "The AI could not write this summary. Please try again." }, 502);
    }

    const payload = await aiResp.json();
    let summary = String(payload?.choices?.[0]?.message?.content ?? "").trim();
    // Strip any stray markdown the model may add.
    summary = summary.replace(/^[#*\-\s]+/, "").replace(/\*\*/g, "").trim();
    if (!summary) return json({ error: "The AI returned an empty summary. Please try again." }, 502);
    // Keep it short: 5 sentences max, hard cap on length.
    const sentences = summary.match(/[^.!?]+[.!?]+(\s|$)/g);
    if (sentences && sentences.length > 5) summary = sentences.slice(0, 5).join("").trim();
    if (summary.length > 1200) summary = summary.slice(0, 1200).trim();

    return json({ summary });
  } catch (e: any) {
    console.error("ai-report-summary error", e);
    return json({ error: e?.message || "Unexpected error" }, 500);
  }
});
