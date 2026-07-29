import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const body = await req.json();
    const { jobName, category, address, customer, ramsType, jobId } = body;
    /** Admin-supplied works description typed at generate time (overrides / supplements job.brief). */
    const worksDescriptionInput: string = (body.worksDescription || "").toString().trim();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Pull the caller's org so we compose from their RAMS Library.
    const { data: userRes } = await supabase.auth.getUser(token);
    const uid = userRes?.user?.id;
    let orgId: string | null = null;
    if (uid) {
      const { data: prof } = await supabase.from("profiles").select("org_id").eq("id", uid).maybeSingle();
      orgId = (prof as any)?.org_id || null;
    }

    // ---- Job-aware context: read the job's real works description, scope,
    // defects, remedial items, parts, site and customer details.
    const contextUsed: string[] = [];
    let worksDescription = worksDescriptionInput;
    let jobContext = "";
    let jobRow: any = null;
    if (jobId) {
      try {
        const { data: job } = await supabase
          .from("jobs")
          .select(
            "id, reference_number, name, brief, address, customer, category, job_type, other_service_type, detected_work_types, priority, due_date, is_remedial, site_id, customers(name), sites(name, address, postcode, riser_location, notes, site_type, what3words, contact_name, contact_phone)",
          )
          .eq("id", jobId)
          .maybeSingle();
        jobRow = job;

        const siteId = (job as any)?.site_id || null;
        const [defectsRes, remedialsRes, partsRes] = await Promise.all([
          supabase
            .from("defects")
            .select("title, description, severity, status, location_on_site, job_id, site_id")
            .or(siteId ? `job_id.eq.${jobId},site_id.eq.${siteId}` : `job_id.eq.${jobId}`)
            .neq("status", "resolved")
            .limit(40),
          supabase.from("job_remedial_items").select("description, comment, status").eq("job_id", jobId).limit(40),
          supabase.from("job_parts").select("name, quantity, notes").eq("job_id", jobId).limit(40),
        ]);

        const defects = ((defectsRes.data as any) || []).map(
          (d: any) => `- ${d.title || "Defect"}${d.location_on_site ? ` (${d.location_on_site})` : ""}${d.severity ? ` [${d.severity}]` : ""}${d.description ? `: ${d.description}` : ""}`,
        );
        const remedials = ((remedialsRes.data as any) || []).map(
          (r: any) => `- ${r.description || ""}${r.comment ? ` — ${r.comment}` : ""}`,
        );
        const parts = ((partsRes.data as any) || []).map(
          (p: any) => `- ${p.quantity ?? 1}x ${p.name}${p.notes ? ` (${p.notes})` : ""}`,
        );
        const site = (job as any)?.sites || {};

        // The job's own works description is the primary driver of the draft.
        if (!worksDescription && (job as any)?.brief) worksDescription = String((job as any).brief).trim();

        const bits: string[] = [];
        if (worksDescription) {
          bits.push(`DESCRIPTION OF WORKS REQUIRED (primary source — the method statement MUST cover these works):\n${worksDescription}`);
          contextUsed.push(worksDescriptionInput ? "Works description (entered now)" : "Job works description");
        }
        const typeBits = [ (job as any)?.job_type, (job as any)?.category, (job as any)?.other_service_type ].filter(Boolean);
        if (typeBits.length) { bits.push(`Job type / category: ${typeBits.join(" · ")}`); contextUsed.push("Job type / category"); }
        if (((job as any)?.detected_work_types || []).length) bits.push(`Detected work types: ${(job as any).detected_work_types.join(", ")}`);
        const customerName = (job as any)?.customers?.name || (job as any)?.customer;
        if (customerName) { bits.push(`Customer: ${customerName}`); contextUsed.push("Customer"); }
        const siteLine = [site?.name, site?.address, site?.postcode].filter(Boolean).join(", ") || (job as any)?.address;
        if (siteLine) { bits.push(`Site: ${siteLine}`); contextUsed.push("Site details"); }
        if (site?.site_type) bits.push(`Site type: ${site.site_type}`);
        if (site?.riser_location) bits.push(`Riser / plant location: ${site.riser_location}`);
        if (site?.what3words) bits.push(`what3words: ${site.what3words}`);
        if (site?.notes) { bits.push(`Site notes / access information:\n${site.notes}`); contextUsed.push("Site notes / access"); }
        if (site?.contact_name) bits.push(`Site contact: ${site.contact_name}${site.contact_phone ? ` (${site.contact_phone})` : ""}`);
        if (defects.length) { bits.push(`Outstanding defects on this job/site:\n${defects.join("\n")}`); contextUsed.push(`Defects (${defects.length})`); }
        if (remedials.length) { bits.push(`Remedial items listed on the job:\n${remedials.join("\n")}`); contextUsed.push(`Remedial items (${remedials.length})`); }
        if (parts.length) { bits.push(`Parts / materials allocated:\n${parts.join("\n")}`); contextUsed.push(`Parts (${parts.length})`); }

        if (bits.length) {
          jobContext = `\n\nACTUAL JOB CONTEXT — base the scope of works on this, not on generic servicing:\n${bits.join("\n\n")}\n
Write the description as a specific Scope of Works naming the actual tasks (with quantities and locations where given) and referencing the site. Every step described in the works description must appear in the method statement in a sensible sequence. Choose hazards, controls and method steps that genuinely apply to those tasks (e.g. drain-down and leak repair implies water damage control, system impairment notification to the responsible person/ARC, and a reinstatement/functional test; hot works only if cutting/brazing is actually implied; work at height controls only if ceiling voids/high level work is implied).`;
        }
      } catch (ctxErr) {
        console.error("job context fetch failed, falling back to category fill:", ctxErr);
      }
    } else if (worksDescription) {
      jobContext = `\n\nDESCRIPTION OF WORKS REQUIRED (primary source — the method statement MUST cover these works):\n${worksDescription}`;
      contextUsed.push("Works description (entered now)");
    }

    // Fetch library blocks matching this work type (or generic ones with no
    // work_types), then rank them against the actual works description so the
    // blocks we feed the model are the ones that match the described works.
    let libraryBlocks: any[] = [];
    if (orgId) {
      const { data: blocks } = await supabase
        .from("rams_library_items")
        .select("name, work_types, payload")
        .eq("org_id", orgId)
        .eq("kind", "block")
        .eq("archived", false);
      libraryBlocks = ((blocks as any) || []).filter((b: any) =>
        !b.work_types?.length || (ramsType && b.work_types.includes(ramsType)),
      );

      const words = new Set(
        (worksDescription || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3),
      );
      if (words.size) {
        const score = (b: any) => {
          const hay = `${b.name} ${(b.payload?.hazards || []).join(" ")} ${(b.payload?.controls || []).join(" ")} ${(b.payload?.method_steps || []).join(" ")}`.toLowerCase();
          let s = 0;
          for (const w of words) if (hay.includes(w)) s++;
          return s;
        };
        libraryBlocks = libraryBlocks
          .map((b) => ({ b, s: score(b) }))
          .sort((x, y) => y.s - x.s)
          .map((x) => x.b);
        if (libraryBlocks.length) contextUsed.push(`RAMS library blocks (${libraryBlocks.length})`);
      }
    }

    const librarySnippet = libraryBlocks.length
      ? `\n\nUse the following vetted library blocks as source-of-truth, most relevant first. PREFER these exact lines for any hazard/control they cover that applies to the described works; only invent new lines for gaps, and omit blocks that are irrelevant to the described works. Library:\n${
          libraryBlocks
            .slice(0, 20)
            .map(
              (b) =>
                `• ${b.name}\n   hazards: ${(b.payload?.hazards || []).join(" | ")}\n   controls: ${(b.payload?.controls || []).join(" | ")}\n   method: ${(b.payload?.method_steps || []).join(" | ")}\n   ppe: ${(b.payload?.ppe || []).join(", ")}`,
            )
            .join("\n")
        }`
      : "";

    const systemPrompt = `You are a fire safety RAMS (Risk Assessment and Method Statement) expert writing UK, PAS 79-aligned documents.
Rules:
- The DESCRIPTION OF WORKS REQUIRED supplied by the user is the source of truth. Every task it names must appear in the method statement, in a sensible sequence, with the practical steps that task really involves.
- Only include hazards, controls and PPE that genuinely apply to the described works. Do not pad with irrelevant generic content.
- Give each hazard a paired control measure and sensible pre-control and residual risk ratings (likelihood 1-5, severity 1-5) using the usual L x S scoring; residual must be lower than initial.
- British English throughout.`;

    const ramsTypeLabel: Record<string, string> = {
      dry_riser: "Dry Riser System",
      dry_riser_remedial: "Dry Riser System — Remedial / Repair Works",
      wet_riser: "Wet Riser System",
      sprinkler: "Sprinkler System",
      sprinkler_remedial: "Sprinkler System — Remedial / Repair Works",
      general_remedial: "Fire Protection System — Remedial / Repair Works",
      fire_extinguisher: "Fire Extinguisher",
      fire_hydrant: "Fire Hydrant",
      fire_alarm: "Fire Alarm System",
      emergency_lighting: "Emergency Lighting",
      aov_smoke_control: "AOV / Smoke Control System",
      passive_fire: "Passive Fire Protection",
      gas_suppression: "Gas Suppression System",
      kitchen_suppression: "Kitchen Suppression System",
      water_mist: "Water Mist System",
      hose_reel: "Hose Reel",
      fire_risk_assessment: "Fire Risk Assessment",
      installation: "Installation Works",
    };

    const isRemedial = ["dry_riser_remedial", "sprinkler_remedial", "general_remedial"].includes(ramsType) ||
      Boolean(jobRow?.is_remedial) ||
      /remedial|repair/i.test(`${jobName || ""} ${category || ""} ${worksDescription || ""}`);

    const userPrompt = `Generate RAMS content for:
System Type: ${ramsTypeLabel[ramsType] || ramsType || "Fire Safety System"}
Job Name: ${jobName || jobRow?.name || "N/A"}
Category: ${category || jobRow?.category || "fire_safety"}
Customer: ${customer || jobRow?.customers?.name || jobRow?.customer || "N/A"}
Site Address: ${address || jobRow?.address || "N/A"}

Tailor the method statement, hazards, and control measures specifically for the works described below, in compliance with UK fire safety regulations and PAS 79 structure.${
      isRemedial
        ? `\n\nThis is REMEDIAL / REPAIR work, not routine servicing. Where relevant to the described works the method must cover: system isolation and drain-down, notification of system impairment to the responsible person/ARC, protection against water damage, safe access to the work area, replacement of defective components, hot works controls where cutting/grinding/brazing applies, working from steps/ladders/platforms, reinstatement, functional/pressure testing and leaving the system fully operational with a written completion report.`
        : ""
    }${jobContext}${librarySnippet}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "fill_rams",
              description: "Fill RAMS fields with generated content",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  method_statement: { type: "string" },
                  hazards: { type: "array", items: { type: "string" } },
                  controls: { type: "array", items: { type: "string" } },
                  ppe: { type: "array", items: { type: "string" } },
                  risk_rows: {
                    type: "array",
                    description: "One row per hazard, in the same order as hazards[], with PAS 79 style risk ratings.",
                    items: {
                      type: "object",
                      properties: {
                        activity: { type: "string", description: "The task from the works description this risk relates to" },
                        hazard: { type: "string" },
                        who_at_risk: { type: "string" },
                        likelihood: { type: "integer", description: "1-5 before controls" },
                        severity: { type: "integer", description: "1-5 before controls" },
                        control: { type: "string" },
                        residual_likelihood: { type: "integer", description: "1-5 after controls" },
                        residual_severity: { type: "integer", description: "1-5 after controls" },
                      },
                      required: ["activity", "hazard", "who_at_risk", "likelihood", "severity", "control", "residual_likelihood", "residual_severity"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["description", "method_statement", "hazards", "controls", "ppe", "risk_rows"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "fill_rams" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned from AI");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-rams-autofill error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
