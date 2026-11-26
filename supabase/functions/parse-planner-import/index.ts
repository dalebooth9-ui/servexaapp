// Reads a photo of Michelle's weekly sheet / whiteboard, or pasted/spreadsheet text,
// into draft planner lines. Never writes anything: the office reviews and creates.
import { resolveCaller } from "../_shared/callerOrg.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const LINE = {
  type: "object", additionalProperties: false,
  required: ["company", "site", "postcode", "job_type", "quantity", "date", "target_month", "engineer", "comments", "time_window", "confidence", "raw"],
  properties: {
    company: { type: "string" }, site: { type: "string" }, postcode: { type: "string" },
    job_type: { type: "string" }, quantity: { type: ["integer", "null"] },
    date: { type: "string", description: "yyyy-MM-dd or empty" }, target_month: { type: "string", description: "yyyy-MM or empty" },
    engineer: { type: "string" }, comments: { type: "string" }, time_window: { type: "string" },
    confidence: { type: "string", enum: ["high", "low"] }, raw: { type: "string" },
  },
};
const SCHEMA = { type: "object", additionalProperties: false, required: ["lines"], properties: { lines: { type: "array", items: LINE } } };

const SYSTEM = (today: string) => `You read a UK fire-protection company's planning notes (printed weekly sheets, whiteboards, spreadsheets or pasted lines) into planner lines.
Today is ${today}. Dates are UK day/month/year; resolve to yyyy-MM-dd using the week/month written on the sheet, else the nearest future date. If only a month is given, fill target_month (yyyy-MM) and leave date empty.
One output line per job line. Examples: "Brondesbury Park x1 test" -> site "Brondesbury Park", job_type "pressure test", quantity 1. "Mts Walford x1 test early 7am" -> site "Mts Walford", quantity 1, job_type "pressure test", time_window "early start 7am". "vis"/"visual" = visual inspection; "test"/"PT" = pressure test.
Copy names exactly as written; never invent sites, companies, postcodes, engineers or dates — leave them empty if not written. Put PO numbers, access, contact and call-ahead notes in comments. Set confidence "low" for any handwriting you are unsure of or anything guessed. raw = the line as written.`;

async function read(apiKey: string, content: any[], today: string) {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Lovable-API-Key": apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: MODEL, stream: true, store: false, reasoning: { effort: "low" },
      input: [{ role: "system", content: SYSTEM(today) }, { role: "user", content }],
      text: { format: { type: "json_schema", name: "planner_lines", strict: true, schema: SCHEMA } } }),
  });
  if (!r.ok || !r.body) return { status: r.status, error: (await r.text()).slice(0, 300) };
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "", out = "", err = "";
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue; const d = line.slice(5).trim(); if (!d || d === "[DONE]") continue;
      try { const ev = JSON.parse(d); if (ev.type === "response.output_text.delta") out += ev.delta || ""; if (ev.type === "error" || ev.type === "response.failed") err = JSON.stringify(ev).slice(0, 300); } catch { /* partial */ }
    }
  }
  try { return { status: 200, data: JSON.parse(out) }; } catch { return { status: 502, error: err || "The reader returned nothing usable" }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const c = await resolveCaller(req);
  if ("error" in c) return json({ error: c.error }, c.status);
  if (!c.isAdmin) return json({ error: "Only office admins can import planner entries" }, 403);
  const apiKey = Deno.env.get("LOVABLE_API_KEY"); if (!apiKey) return json({ error: "AI reading is not set up" }, 500);
  const { text, image, mime } = await req.json().catch(() => ({}));
  const content: any[] = [{ type: "input_text", text: text ? `Lines:\n${String(text).slice(0, 30000)}` : "Read every job line on this planning sheet / whiteboard photo." }];
  if (image) {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(mime || "")) return json({ error: "Please upload a JPG, PNG or WebP photo" }, 400);
    if (String(image).length > 14_000_000) return json({ error: "Photo is too large; please use one under 10 MB" }, 400);
    content.push({ type: "input_image", image_url: `data:${mime};base64,${image}` });
  }
  if (!text && !image) return json({ error: "Nothing to read" }, 400);
  const res = await read(apiKey, content, new Date().toISOString().slice(0, 10));
  if (res.status !== 200) {
    const msg = res.status === 402 ? "AI credits have run out — top up in Settings → Plans & credits." : res.status === 429 ? "Too many requests just now; please try again in a minute." : `Could not read it (${res.status}).`;
    console.error("parse-planner-import", res.status, res.error);
    return json({ error: msg }, res.status === 402 || res.status === 429 ? res.status : 502);
  }
  return json({ lines: res.data.lines || [] });
});
