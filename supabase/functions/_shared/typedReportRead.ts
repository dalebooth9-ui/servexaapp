// Reads an already-typed report (typed PDF text layer or Word document text)
// into the same template answers a new report uses. Text only — never the
// handwriting reader. Values the text does not state clearly are flagged
// unclear (low confidence) rather than guessed.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

/** Streams a Responses call with a strict JSON schema and returns the parsed object. */
async function callJson(apiKey: string, system: string, user: string, name: string, schema: any): Promise<any> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Lovable-API-Key": apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL, stream: true, store: false, reasoning: { effort: "low" },
        input: [{ role: "system", content: system }, { role: "user", content: user }],
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
    });
    if (!r.ok || !r.body) {
      last = `AI gateway error (${r.status}): ${(await r.text()).slice(0, 200)}`;
      if (r.status >= 500 || r.status === 429) continue;
      break;
    }
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = "", out = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") out += ev.delta || "";
          if (ev.type === "error" || ev.type === "response.failed") last = JSON.stringify(ev).slice(0, 200);
        } catch { /* partial line */ }
      }
    }
    try { return JSON.parse(out); } catch { last = last || "Unreadable AI reply"; }
  }
  throw new Error(last || "Typed report could not be read");
}

const HEADER_KEYS = ["site", "customer", "date", "engineer", "po_ref", "riser_location", "number_of_outlets", "cabinet_keys"];

export async function readTypedReport(service: any, apiKey: string, orgId: string, text: string) {
  const clean = text.replace(/\s+\n/g, "\n").slice(0, 40000);
  const { data: tpls } = await service.from("job_sheet_templates").select("id, name, fields, org_id, status")
    .or(`org_id.eq.${orgId},org_id.is.null`);
  const list = (tpls || []).filter((t: any) => !/retired|duplicate/i.test(t.name || "") && t.status !== "archived");
  if (!list.length) throw new Error("No report types set up for this company");
  const names = Array.from(new Set(list.map((t: any) => t.name)));

  const pick = await callJson(apiKey,
    "You identify which report form a typed service report matches. Choose only from the given names. Confidence is 0 to 1.",
    `Report names:\n${names.map((n) => `- ${n}`).join("\n")}\n\nTyped report text:\n${clean.slice(0, 8000)}`,
    "pick_template", { type: "object", additionalProperties: false, properties: { template_name: { type: "string", enum: names }, confidence: { type: "number" } }, required: ["template_name", "confidence"] });
  const candidates = list.filter((t: any) => t.name === pick.template_name);
  const tpl = candidates.find((t: any) => t.org_id === orgId) || candidates[0];
  const fields = (Array.isArray(tpl.fields) ? tpl.fields : []).filter((f: any) => f?.id && !/signature|photo|file|image/i.test(f.type || ""));

  const out = await callJson(apiKey,
    "You copy answers from a TYPED service report into form questions. The text is typed, not handwriting. Copy values exactly as written. For yes/no or checkbox questions answer yes, no or n/a. For pass/fail answer pass or fail. Only include questions the text answers. If the text is ambiguous or garbled for a question, include it with unclear=true and your best reading. Never invent answers. Header values not stated are null; the date is as written (UK format).",
    `Form: ${tpl.name}\nQuestions (id | label | type | options):\n${fields.map((f: any) => `${f.id} | ${f.label} | ${f.type}${Array.isArray(f.options) ? ` | ${f.options.join("/")}` : ""}`).join("\n")}\n\nTyped report text:\n${clean}`,
    "map_answers", { type: "object", additionalProperties: false, required: ["answers", "header"], properties: {
      answers: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "value", "unclear"], properties: { id: { type: "string" }, value: { type: "string" }, unclear: { type: "boolean" } } } },
      header: { type: "object", additionalProperties: false, required: HEADER_KEYS, properties: Object.fromEntries(HEADER_KEYS.map((k) => [k, { type: ["string", "null"] }])) },
    } });
  const header = Object.fromEntries(Object.entries(out.header || {}).filter(([, v]) => v !== null && v !== ""));
  const ids = new Set(fields.map((f: any) => f.id));
  const extracted: Record<string, any> = {};
  const conf: Record<string, number> = {};
  for (const a of out.answers || []) {
    if (!ids.has(a.id) || a.value === undefined || a.value === "") continue;
    extracted[a.id] = a.value;
    conf[a.id] = a.unclear ? 0.4 : 0.97;
  }
  return {
    template: { id: tpl.id, name: tpl.name },
    confidence: typeof pick.confidence === "number" ? pick.confidence : 0.7,
    extracted,
    header: { ...header, _field_confidence: conf, _source: "typed" },
  };
}
