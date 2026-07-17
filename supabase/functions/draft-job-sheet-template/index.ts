// Edge function: draft-job-sheet-template
// Called by the "AI-draft template" button on the mismatch banner.
// Uses Lovable AI to produce a first-pass job sheet template for an
// uncovered work type and inserts it into public.job_sheet_templates as
// an UNPUBLISHED draft. Never auto-publishes — the office reviews it in
// the Template Builder before it becomes usable.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  work_type_slug: string;
  work_type_label: string;
  source_job_id?: string | null;
}

const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!key) return json(500, { error: "Missing LOVABLE_API_KEY" });

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "Not authenticated" });

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json(401, { error: "Not authenticated" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve caller's org and confirm they are an admin in it.
    const { data: member } = await admin
      .from("organisation_members")
      .select("org_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!member) return json(403, { error: "No active organisation" });
    const orgId = member.org_id as string;
    const isAdmin = ["owner", "admin"].includes((member.role || "").toLowerCase());
    if (!isAdmin) return json(403, { error: "Admin role required" });

    const body = (await req.json()) as Body;
    if (!body?.work_type_slug || !body?.work_type_label) {
      return json(400, { error: "work_type_slug and work_type_label required" });
    }

    // Ask the model for a structured template.
    const prompt =
      `You are drafting a UK fire-safety job sheet template for the work type: ` +
      `"${body.work_type_label}" (slug: ${body.work_type_slug}). ` +
      `Output JSON only. Follow this exact shape:\n` +
      `{ "name": "<short template name>", "description": "<one line>", ` +
      `"sections": [ { "title": "<section title>", "items": [ ` +
      `{ "id": "<snake_case_id>", "type": "text|number|date|select|checkbox|signature|photo|textarea", ` +
      `"label": "<question>", "required": true|false, "options": ["opt1","opt2"] (only for select/checkbox) } ` +
      `] } ] }\n\n` +
      `Rules:\n` +
      `- Include a Site & Customer details section, an Engineer & Date section, the specific inspection/test questions for this work type, a Comments/Observations section, and Sign-off (engineer signature, customer signature).\n` +
      `- Multiple-choice options should use short answers like "Pass"/"Fail"/"N/A" or "Yes"/"No" — never long sentences.\n` +
      `- Cite the relevant British Standard in the description if there is one (e.g. BS 9990, BS 5306, BS 5839, BS 5266, BS EN 12845, BS 7346).\n` +
      `- Be thorough but keep it usable on paper — 8–20 items across sections is typical.\n` +
      `- Do NOT include markdown fences. Output raw JSON only.`;

    const resp = await fetch(LOVABLE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("Lovable AI failed", resp.status, t);
      return json(resp.status, { error: "AI request failed", details: t });
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return json(500, { error: "Empty AI response" });

    let parsed: any;
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch { return json(500, { error: "AI returned invalid JSON", raw }); }

    // Flatten sections → fields[] array in the shape the builder expects.
    const fields: any[] = [];
    for (const sec of (parsed.sections || [])) {
      if (sec?.title) {
        fields.push({
          id: `sec_${slug(sec.title)}`,
          type: "section",
          label: sec.title,
        });
      }
      for (const it of (sec?.items || [])) {
        if (!it?.id || !it?.type || !it?.label) continue;
        const f: any = {
          id: String(it.id),
          type: String(it.type),
          label: String(it.label),
          required: !!it.required,
        };
        if (Array.isArray(it.options) && it.options.length) {
          f.options = it.options.map((o: any) => String(o));
        }
        fields.push(f);
      }
    }
    if (!fields.length) return json(500, { error: "AI produced no fields" });

    const baseName = (parsed.name && String(parsed.name).trim()) || body.work_type_label;
    const name = `${baseName} — AI DRAFT, review before use`;

    const { data: inserted, error: insErr } = await admin
      .from("job_sheet_templates")
      .insert({
        org_id: orgId,
        name: name.slice(0, 200),
        description: (parsed.description ? String(parsed.description) : `Auto-drafted for ${body.work_type_label}. Review and publish before use.`).slice(0, 500),
        fields,
        category: body.work_type_slug,
        job_category: body.work_type_slug,
        status: "draft",
        created_by: user.id,
      } as any)
      .select("id, name, status")
      .single();
    if (insErr) {
      console.error("insert template failed", insErr);
      return json(500, { error: "Could not save draft template", details: insErr.message });
    }

    return json(200, {
      template_id: inserted.id,
      name: inserted.name,
      status: inserted.status,
    });
  } catch (e) {
    console.error("draft-job-sheet-template threw", e);
    return json(500, { error: (e as Error).message || "Unknown error" });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "section";
}
