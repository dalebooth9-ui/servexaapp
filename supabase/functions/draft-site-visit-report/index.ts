// Drafts a Site Visit Report from the engineer's notes using Lovable AI.
// Same auth/secret pattern as ai-generate-rams. Access is checked with the
// caller's own token, so RLS enforces org isolation and job assignment.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const OUTCOME_LABEL: Record<string, string> = {
  completed: "Completed", partly_completed: "Partly completed",
  not_completed: "Not completed", investigation_only: "Investigation only",
};
const LABEL_TO_OUTCOME: Record<string, string> = Object.fromEntries(Object.entries(OUTCOME_LABEL).map(([k, v]) => [v, k]));

const EXAMPLE = `Site Visit Report – Level 2 Sprinkler Flow Switch Alarms. Dated 30 September 2026.

Summary: The Level 2 sprinkler flow switch does not appear to be the cause of the recent alarms. The evidence points to the building fire alarm system, most likely linked to the weekly Monday alarm test.

Job details: Reference: PO 123456. Client: Example Fire & Security Ltd. Site: Example House, 1 Example Street, Anytown. Date of visit: 30 September 2026. Attended by: A. Engineer. Site contact: the Assistant Manager. The system is a residential sprinkler system, with a Level 2 zone valve set and flow switch. There is a dedicated sprinkler monitoring panel installed by another contractor, and a separate building fire alarm panel, device 2:070.0, Zone 0031.

Work instructed: Attend to carry out sprinkler remedial – replace the Level 2 flow switch.
Outcome: Not completed. The switch could not be replaced on the day as a 1½ inch unit is needed. More importantly, our findings below suggest the switch is not the cause, so we do not recommend replacing it until the fire alarm side has been checked.

Reason for visit: We attended following repeated fire alarm activations reported as the Level 2 sprinkler flow switch. The client reported activations roughly two weeks apart, then one week apart, at different times. There were no reported leaks or signs of water discharge.

Findings: The fire alarm panel and the sprinkler panel disagree about what happened. The sprinkler panel monitors the flow switch directly and did not record either activation, on the 14th or 21st of September.

Events:
- Monday 14 September, 09:13, fire alarm panel: fire alarm labelled "2nd Floor Sprinkler Switch". Sprinkler panel recorded no event.
- Monday 21 September, 09:48, fire alarm panel: fire alarm with the same label. Sprinkler panel recorded no event.
- Wednesday 30 September, sprinkler panel: alarm at 10:19, supervisory at 10:32, restore at 10:40. This was our own test on the day. The fire alarm panel was not checked for this date.

Pattern: both recorded activations happened on a Monday morning, within 35 minutes of each other. We understand the weekly fire alarm test is carried out on Monday mornings.

Sprinkler panel: it records flow switch operation correctly, as shown by our test on the day. It shows no activation on the 14th or 21st of September.
Fire alarm panel: the Test and Disable indicators were lit at the time of our visit, and the sounders were shown as disabled.
Flow switch and valve set: no leaks or signs of water flow found. System pressure on the Level 2 gauge was approximately 9 bar.
Wiring: a lever connector on the flow switch wiring sits outside the enclosure, and the bottom cable gland did not appear fully sealed.
Not confirmed: the person who carries out the weekly fire alarm test was not on site, so we could not confirm what they activate during the test.

Conclusion: In our opinion the flow switch did not operate on the 14th or 21st of September, so the sprinkler system is unlikely to be the cause. The most likely causes sit on the fire alarm side. (1) The weekly test may be using the Level 2 sprinkler interface as its test point. (2) Fire alarm device 2:070.0 may be wrongly labelled as the sprinkler switch in the panel programming. (3) The fire alarm interface for the flow switch, or its wiring, may be giving a false signal when the loop is disturbed during testing. This cannot be confirmed until the weekly tester and the fire alarm maintainer have been spoken to.

Recommendations and next steps:
- Client / site team: confirm who carries out the weekly Monday fire alarm test, and which device they activate.
- Fire alarm maintainer: walk-test device 2:070.0 to confirm what it physically is, and check its label in the panel programming.
- Fire alarm maintainer: check the fire alarm event log around 09:13 on the 14th and 09:48 on the 21st of September for any other devices activated.
- Us: make the flow switch wiring safe, by moving the lever connector inside the enclosure and sealing the bottom cable gland.

Closing note: No changes were made to the flow switch settings. We do not recommend adjusting the switch until the fire alarm side has been checked, as it does not appear to be at fault.`;

function systemPrompt(company: string) {
  return `You are writing a site visit report for a UK fire protection contractor called "${company}". Wherever the report refers to "us" or "we", it means ${company}. Never use any other company name for us.

Return the report only through the function call, in exactly the given structure.

STRICT RULES:
1. Never invent facts. Only use what is in the notes, events table, photo captions and job record. No made-up times, pressures, device numbers, names or standards.
2. If something is missing (for example the client name or full site address), write "to be confirmed" in the report and add it to gaps_to_confirm. Never guess.
3. If something on site was not checked or could not be confirmed, say so plainly in the findings and add it to gaps_to_confirm.
4. Keep opinion clearly as opinion. Use wording like "in our opinion", "most likely", "appears to", "the evidence points to". Never state as fact that another contractor's system or workmanship is at fault – say what should be checked and by whom.
5. Keep times and dates exactly as given. Write dates in full UK format with the weekday where known (e.g. "Monday 14 September"). Use the 24-hour clock.
6. Point out patterns in the events where the notes support it (same weekday, same time of day, matches a known test).
7. Each recommendation must be one clear action with one owner. owner_type "us" for anything ${company} should do, "client" for the client or site team, "third_party" for anyone else (name them in owner_name, e.g. "Fire alarm maintainer").
8. Plain English, UK spelling, short sentences, no jargon the client wouldn't understand, no sales language.
9. Refer to us as ${company}. Do not use any other company name for us.
10. If the job instructed specific work (for example replacing a part), the summary or the start of the report must say plainly whether that work was done. If not done, say why, and say whether we still recommend it is done.
11. Use the details on the job record (PO, client, site name, address) exactly as they are. Only write "to be confirmed" when the job record itself is blank.
12. If the notes, the job sheet and the job record disagree (for example a different product name, floor or address), do not pick one. Use the job record wording in the report and add the mismatch to gaps_to_confirm.
13. Outcome: if the user already chose an outcome, outcome_reason, return visit or parts, keep exactly what they chose. Only fill in blank ones when the notes make it clear; otherwise leave them empty (outcome "" / null).

HOUSE STYLE – worked example (names removed). Copy the structure and tone, NOT the content:
---
${EXAMPLE}
---`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) return json(401, { error: "Unauthorized" });

  try {
    const { report_id } = await req.json();
    if (!report_id) return json(400, { error: "report_id required" });
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Access check: RLS on the caller's token limits this to their org and assigned jobs.
    const { data: report } = await supabase.from("site_visit_reports").select("*").eq("id", report_id).maybeSingle();
    if (!report) return json(403, { error: "You don't have access to this report." });
    const { data: job } = await supabase
      .from("jobs").select("id, org_id, reference_number, customer_po, customer, address, name, brief")
      .eq("id", report.job_id).maybeSingle();
    if (!job || (job as any).org_id !== report.org_id) return json(403, { error: "You don't have access to this job." });

    const [{ data: org }, { data: photos }] = await Promise.all([
      supabase.from("organisations").select("name").eq("id", report.org_id).maybeSingle(),
      supabase.from("site_visit_report_photos").select("caption, display_order").eq("report_id", report_id).order("display_order"),
    ]);
    const company = (org as any)?.name?.trim() || "our company";

    const v = (x: unknown) => (x === null || x === undefined || x === "" ? "(blank)" : String(x));
    const events = Array.isArray(report.event_log) ? report.event_log : [];
    const captions = (photos || []).map((p: any, i: number) => `Photo ${i + 1}: ${p.caption?.trim() || "(no caption)"}`);

    const userPrompt = `JOB RECORD (use exactly as written; "(blank)" means not recorded):
Reference / PO: ${v(report.po_reference || (job as any).customer_po || (job as any).reference_number)}
Client: ${v(report.client_name)}
Site name: ${v(report.site_name)}
Site address: ${v(report.site_address)}
Date of visit: ${v(report.visit_date)}
Attended by: ${v(report.attended_by)}
Site contact: ${v(report.site_contact_name)}${report.site_contact_title ? ` (${report.site_contact_title})` : ""}
Report title: ${v(report.title)}

WORK INSTRUCTED:
${v(report.work_instructed)}

OUTCOME ALREADY CHOSEN BY THE USER (keep these):
Outcome: ${report.outcome ? OUTCOME_LABEL[report.outcome] : "(blank)"}
Outcome reason: ${v(report.outcome_reason)}
Return visit required: ${report.return_visit_required ? "Yes" : "(not ticked)"}
Parts required: ${v(report.parts_required)}

ENGINEER NOTES (including any comments copied from the job sheet):
${v(report.raw_notes)}

EVENTS TABLE:
${events.length ? events.map((e: any) => `- date: ${v(e.date)} | time: ${v(e.time)} | source: ${v(e.source)} | recorded: ${v(e.what_was_recorded)} | note: ${v(e.note)}`).join("\n") : "(none)"}

PHOTO CAPTIONS:
${captions.length ? captions.join("\n") : "(none)"}

Write the site visit report.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: systemPrompt(company),
        input: userPrompt,
        tools: [{
          type: "function",
          ...({
            name: "draft_site_visit_report",
            description: "Return the drafted site visit report",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "1–2 sentences, bottom-line answer first" },
                system_description: { type: "string" },
                reason_for_visit: { type: "string" },
                outcome: { type: "string", enum: ["", "Completed", "Partly completed", "Not completed", "Investigation only"] },
                outcome_reason: { type: "string" },
                return_visit_required: { type: "boolean" },
                parts_required: { type: "string" },
                event_log: { type: "array", items: { type: "object", properties: {
                  date: { type: "string" }, time: { type: "string" }, source: { type: "string" },
                  what_was_recorded: { type: "string" }, note: { type: "string" },
                }, required: ["date", "time", "source", "what_was_recorded", "note"] } },
                findings: { type: "array", items: { type: "object", properties: {
                  heading: { type: "string" }, text: { type: "string" },
                }, required: ["heading", "text"] } },
                conclusion: { type: "string" },
                possible_causes: { type: "array", items: { type: "string" } },
                recommendations: { type: "array", items: { type: "object", properties: {
                  action: { type: "string" }, owner_type: { type: "string", enum: ["us", "client", "third_party"] }, owner_name: { type: "string" },
                }, required: ["action", "owner_type", "owner_name"] } },
                closing_note: { type: "string" },
                gaps_to_confirm: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "system_description", "reason_for_visit", "outcome", "event_log", "findings",
                "conclusion", "possible_causes", "recommendations", "closing_note", "gaps_to_confirm"],
            },
          }),
        }],
        tool_choice: { type: "function", name: "draft_site_visit_report" },
      }),
    });
    if (resp.status === 429) return json(429, { error: "The AI is busy right now. Please try again in a minute." });
    if (resp.status === 402) return json(402, { error: "AI credits have run out. Please top up in workspace settings." });
    if (!resp.ok) {
      console.error("AI gateway error", resp.status, await resp.text());
      return json(502, { error: "The AI couldn't draft the report. Please try again." });
    }
    const data = await resp.json();
    const args = (data?.output || []).find((o: any) => o?.type === "function_call")?.arguments;
    if (!args) return json(502, { error: "The AI returned an empty report. Please try again." });
    const out = typeof args === "string" ? JSON.parse(args) : args;

    const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
    const arr = (x: unknown) => (Array.isArray(x) ? x : []);
    const patch: Record<string, unknown> = {
      summary: str(out.summary) || null,
      system_description: str(out.system_description) || null,
      reason_for_visit: str(out.reason_for_visit) || null,
      event_log: arr(out.event_log).length ? arr(out.event_log) : events,
      findings: arr(out.findings).map((f: any) => ({ id: crypto.randomUUID(), heading: str(f.heading), text: str(f.text) })),
      conclusion: str(out.conclusion) || null,
      possible_causes: arr(out.possible_causes).map(str).filter(Boolean),
      recommendations: (() => {
        // Keep defect links from earlier approvals so a redraft never raises the same defect twice.
        const norm = (x: unknown) => str(x).toLowerCase().replace(/\s+/g, " ");
        const prior = arr(report.recommendations).filter((r: any) => r?.defect_id);
        const fresh = arr(out.recommendations).map((r: any) => {
          const match = prior.find((p: any) => norm(p.action) === norm(r.action));
          return {
            id: match?.id || crypto.randomUUID(), action: str(r.action),
            owner_type: ["us", "client", "third_party"].includes(r.owner_type) ? r.owner_type : "third_party",
            owner_name: str(r.owner_name), status: match?.status || "open", defect_id: match?.defect_id || null,
          };
        });
        const kept = prior.filter((p: any) => !fresh.some((f: any) => f.defect_id === p.defect_id));
        return [...fresh, ...kept];
      })(),
      closing_note: str(out.closing_note) || null,
      gaps_to_confirm: Array.from(new Set([...arr(report.gaps_to_confirm), ...arr(out.gaps_to_confirm).map(str).filter(Boolean)])),
      status: "draft",
    };
    // Outcome fields: user's choices win; only fill blanks.
    if (!report.outcome && LABEL_TO_OUTCOME[out.outcome]) patch.outcome = LABEL_TO_OUTCOME[out.outcome];
    if (!report.outcome_reason && str(out.outcome_reason)) patch.outcome_reason = str(out.outcome_reason);
    if (!report.return_visit_required && out.return_visit_required === true) patch.return_visit_required = true;
    if (!report.parts_required && str(out.parts_required)) patch.parts_required = str(out.parts_required);
    // raw_notes deliberately never touched.

    const { data: saved, error: upErr } = await supabase.from("site_visit_reports").update(patch).eq("id", report_id).select("*").single();
    if (upErr) {
      console.error("save failed", upErr);
      return json(500, { error: "The draft was written but couldn't be saved. Please try again." });
    }
    return json(200, { report: saved });
  } catch (e) {
    console.error("draft-site-visit-report error", e);
    return json(500, { error: "Something went wrong drafting the report. Your notes are safe." });
  }
});
