// Segment a multi-page scan into individual sheets.
// Input:  { pages: [{ image_base64, mime_type? }, ...] }
// Output: {
//   sheets: [
//     { page_indices: number[], template_id: string|null, template_name?: string,
//       confidence: number, reason?: string, needs_matching: boolean }
//   ],
//   document_kind: "job_sheet" | "purchase_order" | "unknown",
//   document_kind_reason?: string,
// }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) return null;
  const opener = cleaned[start];
  const closer = opener === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closer);
  if (end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.substring(start, end + 1));
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const pages: { image_base64: string; mime_type?: string }[] =
      Array.isArray(body?.pages) ? body.pages : [];
    if (pages.length === 0) {
      return new Response(JSON.stringify({ error: "pages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If only one page, don't waste an AI call.
    if (pages.length === 1) {
      return new Response(
        JSON.stringify({
          sheets: [
            {
              page_indices: [0],
              template_id: null,
              confidence: 0,
              needs_matching: false,
            },
          ],
          document_kind: "unknown",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load org templates as catalogue.
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const orgId = (profile as any)?.org_id;

    const { data: templates } = await supabase
      .from("job_sheet_templates")
      .select("id, name, category, org_id, status, fields")
      .or(`org_id.is.null,org_id.eq.${orgId ?? ""}`)
      .eq("status", "published");

    const summaries = (templates || []).map((t: any) => ({
      id: t.id as string,
      name: t.name as string,
      category: (t.category ?? null) as string | null,
      labels: Array.isArray(t.fields)
        ? t.fields.slice(0, 6).map((f: any) => f?.label).filter(Boolean)
        : [],
    }));

    const catalog = summaries.length
      ? summaries
          .map(
            (s, i) =>
              `${i + 1}. id=${s.id} | "${s.name}" | category=${s.category || "-"} | fields=${s.labels.join(" · ")}`,
          )
          .join("\n")
      : "(no templates published for this org)";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are helping an admin split a scanned stack of paper job sheets.
The images are the pages of ONE multi-page scan in order. Each page may be:
- the FIRST page of a new completed job sheet (printed title/header, form structure begins), or
- a CONTINUATION page (back-of-form, page 2/3 of a sheet), or
- BLANK / SEPARATOR (mostly empty), or
- a completely UNKNOWN document.

Also classify the overall document kind (job_sheet | purchase_order | unknown) so we can catch misdrops.

Return STRICT JSON only, no prose, no markdown:
{
  "document_kind":"job_sheet|purchase_order|unknown",
  "document_kind_reason":"short",
  "sheets":[
    { "page_indices":[0,1], "template_id":"<uuid or null>", "confidence":0-1, "reason":"short" }
  ]
}
Rules:
- Every input page index (0..N-1) MUST appear in exactly ONE sheet's page_indices, IN ORDER. Do not drop pages. Unclassifiable pages attach to the previous sheet, or form their own sheet with template_id=null if they start the stack.
- template_id must be one of the uuids from the catalogue below, or null if you can't tell.
- Confidence 0-1; be honest (0.9+ only if the printed heading is unambiguous).`;

    const userPrompt = `Available templates:\n${catalog}\n\nSegment these ${pages.length} pages into individual sheets.`;

    const content: any[] = [{ type: "text", text: userPrompt }];
    // Cap page images sent to model to keep payload sane.
    const MAX_PAGES = 20;
    const toSend = pages.slice(0, MAX_PAGES);
    toSend.forEach((p, idx) => {
      content.push({ type: "text", text: `Page index ${idx}:` });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${p.mime_type || "image/jpeg"};base64,${p.image_base64}`,
          detail: "low",
        },
      });
    });

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0.1,
          max_tokens: 1500,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
          ],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      const status = aiResponse.status;
      if (status === 429 || status === 402) {
        return new Response(
          JSON.stringify({
            error:
              status === 402
                ? "AI credits exhausted."
                : "AI rate limit — retry shortly.",
          }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI split error (${status}): ${errText.substring(0, 200)}`);
    }

    const result = await aiResponse.json();
    const raw = result?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParseJson(typeof raw === "string" ? raw : JSON.stringify(raw));

    const validIds = new Set(summaries.map((s) => s.id));
    let sheets: any[] = [];
    const seen = new Set<number>();

    if (parsed?.sheets && Array.isArray(parsed.sheets)) {
      for (const s of parsed.sheets) {
        const idxs = Array.isArray(s?.page_indices)
          ? s.page_indices
              .map((n: any) => Number(n))
              .filter((n: number) => Number.isInteger(n) && n >= 0 && n < pages.length)
          : [];
        const uniqueIdxs = idxs.filter((n: number) => {
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
        if (uniqueIdxs.length === 0) continue;
        const tid = typeof s?.template_id === "string" && validIds.has(s.template_id)
          ? s.template_id
          : null;
        const tpl = tid ? summaries.find((x) => x.id === tid) : null;
        sheets.push({
          page_indices: uniqueIdxs.sort((a, b) => a - b),
          template_id: tid,
          template_name: tpl?.name,
          confidence: Math.max(0, Math.min(1, Number(s?.confidence) || 0)),
          reason: typeof s?.reason === "string" ? s.reason : undefined,
          needs_matching: tid == null,
        });
      }
    }

    // Guarantee every page is accounted for — attach stragglers to the last sheet,
    // or as a new "needs matching" sheet if nothing exists yet.
    for (let i = 0; i < pages.length; i++) {
      if (seen.has(i)) continue;
      if (sheets.length === 0) {
        sheets.push({
          page_indices: [i],
          template_id: null,
          confidence: 0,
          needs_matching: true,
        });
      } else {
        sheets[sheets.length - 1].page_indices.push(i);
      }
      seen.add(i);
    }
    // Re-sort page_indices inside each sheet.
    sheets = sheets.map((s) => ({
      ...s,
      page_indices: [...s.page_indices].sort((a, b) => a - b),
    }));
    // Sort sheets by their first page for stable ordering.
    sheets.sort((a, b) => a.page_indices[0] - b.page_indices[0]);

    const documentKind = ["job_sheet", "purchase_order", "unknown"].includes(
      parsed?.document_kind,
    )
      ? parsed.document_kind
      : "unknown";
    const documentKindReason =
      typeof parsed?.document_kind_reason === "string"
        ? parsed.document_kind_reason
        : null;

    return new Response(
      JSON.stringify({
        sheets,
        document_kind: documentKind,
        document_kind_reason: documentKindReason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("split-paper-scan-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
